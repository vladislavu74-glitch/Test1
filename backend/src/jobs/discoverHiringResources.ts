// Оркестрация поиска ресурсов найма (раздел 10 требования): поиск → проверка
// источника и актуальности (делает агент, см. hiringResourceAgent.ts) →
// удаление дублей → ранжирование → сохранение → отчёт запуска.
//
// Запускается ТОЛЬКО вручную (кнопкой в приложении, POST /discover) —
// намеренно не подключено в scheduler.ts. В отличие от обычного скана
// вакансий это дорогая по токенам ИИ-операция, и пользователь просил не
// запускать её по расписанию.
//
// Работает асинхронно: startHiringResourceDiscovery сразу создаёт запись
// запуска и возвращает её id, а сам поиск продолжается в фоне — иначе
// HTTP-запрос от приложения висел бы без ответа несколько минут. Приложение
// опрашивает GET /runs/:id (поле status + queriesUsed) для статус-бара.
import { prisma } from '../db/client';
import { searchHiringResources } from '../discovery/hiringResourceAgent';
import { normalizeUrl, resolveOrganizationId } from '../discovery/dedupe';
import { scoreResource } from '../discovery/scoring';
import {
  DEFAULT_RECENCY_DAYS,
  type HiringResourceRunParams,
} from '../discovery/hiringResourceTypes';

export type RunTrigger = 'manual';

// Заполняет незаданные пользователем параметры практическими допущениями и
// явно фиксирует их (раздел 1: "если параметр не задан, агент должен явно
// зафиксировать используемое допущение").
function resolveParams(input: Partial<HiringResourceRunParams>): { params: HiringResourceRunParams; assumptions: string[] } {
  const assumptions: string[] = [];

  const countries = input.geography?.countries ?? [];
  const cities = input.geography?.cities ?? [];
  if (countries.length === 0 && cities.length === 0) {
    assumptions.push('География не задана — поиск ведётся без ограничения по странам/городам (не определялась по языку сайта).');
  }
  const remote = input.geography?.remote ?? true;

  const specialization = input.specialization ?? [];
  if (specialization.length === 0) {
    assumptions.push('Специализация не задана — допущение: любые отрасли/профессии.');
  }

  const categories = input.categories?.length
    ? input.categories
    : (['recruiting_agency', 'hr_agency', 'direct_employer', 'telegram', 'community', 'social'] as const);
  if (!input.categories?.length) {
    assumptions.push('Категории ресурсов не заданы — допущение: все категории, кроме работных сайтов/агрегаторов (job_board исключён по умолчанию).');
  }

  const languages = input.languages ?? [];
  if (languages.length === 0) {
    assumptions.push('Языки поиска не заданы — допущение: без ограничения по языку.');
  }

  const recencyDays = input.recencyDays ?? DEFAULT_RECENCY_DAYS;
  if (!input.recencyDays) {
    assumptions.push(`Актуальность не задана — допущение: публикации за последние ${DEFAULT_RECENCY_DAYS} дней.`);
  }

  const targetCount = input.targetCount ?? 20;
  if (!input.targetCount) {
    assumptions.push('Требуемый объём не задан — допущение: 20 подтверждённых уникальных ресурсов.');
  }

  const exclusions = input.exclusions ?? [];

  const params: HiringResourceRunParams = {
    geography: { countries, cities, remote },
    specialization,
    categories: [...categories],
    languages,
    recencyDays,
    targetCount,
    categoryDistribution: input.categoryDistribution,
    exclusions,
  };

  return { params, assumptions };
}

// Создаёт запись запуска синхронно (быстро — нужно вернуть id приложению
// сразу) и запускает сам поиск в фоне, не дожидаясь его завершения.
export async function startHiringResourceDiscovery(
  inputParams: Partial<HiringResourceRunParams> = {},
): Promise<{ runId: string }> {
  const { params, assumptions } = resolveParams(inputParams);

  const run = await prisma.hiringResourceRun.create({
    data: {
      trigger: 'manual',
      status: 'running',
      paramsJson: JSON.stringify({ ...params, assumptions }),
    },
  });

  // Намеренно без await — ошибки перехватываются и записываются в саму
  // запись запуска (processRun), а не пробрасываются наверх в HTTP-обработчик.
  void processRun(run.id, params, assumptions);

  return { runId: run.id };
}

async function processRun(runId: string, params: HiringResourceRunParams, assumptions: string[]): Promise<void> {
  const errors: string[] = [];

  try {
    const searchResult = await searchHiringResources(params, assumptions, async (queriesUsed) => {
      await prisma.hiringResourceRun.update({ where: { id: runId }, data: { queriesUsed } }).catch(() => {
        // Промежуточное обновление прогресса не критично — если БД временно
        // недоступна, не прерываем сам поиск из-за этого.
      });
    });

    let confirmedCount = 0;
    let needsReviewCount = 0;
    let excludedCount = 0;
    const organizationIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const candidate of searchResult.resources) {
      try {
        const normalizedUrl = normalizeUrl(candidate.url);
        seenUrls.add(normalizedUrl);

        const organizationId = await resolveOrganizationId(candidate.organizationName);
        if (organizationId) organizationIds.add(organizationId);

        const score = scoreResource(candidate, params);
        const now = new Date();

        const shared = {
          name: candidate.name,
          category: candidate.category,
          roles: JSON.stringify(candidate.roles ?? []),
          organizationId,
          hiringGeography: candidate.hiringGeography,
          agencyLocation: candidate.agencyLocation,
          specialization: candidate.specialization,
          evidenceSummary: candidate.evidenceSummary,
          evidenceUrl: candidate.evidenceUrl,
          lastRelevantDate: candidate.lastRelevantDate ? new Date(candidate.lastRelevantDate) : null,
          contactMethod: candidate.contactMethod,
          publicContact: candidate.publicContact,
          status: candidate.status,
          exclusionReason: candidate.exclusionReason,
          relatedResources: JSON.stringify(candidate.relatedResources ?? []),
          uncertainties: candidate.uncertainties,
          score: score.total,
          scoreGeoSpec: score.geoSpec,
          scoreEvidence: score.evidence,
          scoreRecency: score.recency,
          scoreContact: score.contact,
          checkedAt: now,
          lastSeenAt: now,
          isStale: false,
          runId,
        };

        // Повторно найденный тот же ресурс (по нормализованному URL) —
        // обновляем запись вместо создания дубля (раздел 8). "Новое" —
        // только для реально новых записей; у повторно найденных isNew не
        // трогаем, пока пользователь не отметит их просмотренными.
        await prisma.hiringResource.upsert({
          where: { url: normalizedUrl },
          create: { ...shared, url: normalizedUrl, isNew: true },
          update: shared,
        });

        if (candidate.status === 'confirmed') confirmedCount += 1;
        else if (candidate.status === 'needs_review') needsReviewCount += 1;
        else excludedCount += 1;
      } catch (error) {
        errors.push(`[${candidate.name}] ${(error as Error).message}`);
      }
    }

    // Пометить "неактуальными" ранее найденные ресурсы из категорий этого
    // запуска, которые не подтвердились повторно — "перестали откликаться
    // при поиске". Исключённые (status="excluded") не трогаем: они не
    // "устарели", они просто не подошли по критериям при прошлой проверке.
    await prisma.hiringResource.updateMany({
      where: {
        category: { in: params.categories },
        status: { not: 'excluded' },
        url: { notIn: Array.from(seenUrls) },
      },
      data: { isStale: true },
    });

    await prisma.hiringResourceRun.update({
      where: { id: runId },
      data: {
        status: 'done',
        finishedAt: new Date(),
        confirmedCount,
        needsReviewCount,
        excludedCount,
        organizationCount: organizationIds.size,
        limitations: JSON.stringify(searchResult.limitations),
        queriesUsed: searchResult.queriesUsed,
        error: errors.length ? errors.join('\n') : undefined,
      },
    });
  } catch (error) {
    await prisma.hiringResourceRun.update({
      where: { id: runId },
      data: { status: 'error', finishedAt: new Date(), error: (error as Error).message },
    });
  }
}
