import type { SourceCandidate } from '@prisma/client';
import { prisma } from '../db/client';
import { resolveConnector } from '../connectors';
import type { SourceRecord } from '../connectors/types';
import { classifyAgencySite } from '../discovery/agencyClassifier';

export type DiscoveryTrigger = 'cron' | 'manual';

export interface DiscoveryResult {
  discoveryRunId: string;
  checked: number;
  promoted: number;
  errors: string[];
}

// Ежедневно (и по кнопке) проверяет каталог кандидатов (SourceCandidate) —
// сайты рекрутинговых компаний/агентств, которые пользователь добавил через
// API/приложение, но которые ещё не подтверждены. Каждый непромотированный
// кандидат проверяется лёгким запросом (JobSourceConnector.probe); если
// ресурс жив и отдаёт корректный ответ, для него автоматически создаётся
// обычный Source, и он сразу участвует в следующем скане вакансий.
export async function runDiscovery(trigger: DiscoveryTrigger): Promise<DiscoveryResult> {
  const discoveryRun = await prisma.discoveryRun.create({ data: { trigger } });
  const errors: string[] = [];
  let promoted = 0;

  try {
    const candidates = await prisma.sourceCandidate.findMany({
      where: { promotedSourceId: null },
    });

    for (const candidate of candidates) {
      if (candidate.kind === 'recruiting_agency') {
        promoted += await checkAgencyCandidate(candidate, errors);
        continue;
      }

      const record: SourceRecord = {
        id: candidate.id,
        key: candidate.key,
        name: candidate.name,
        kind: candidate.kind as SourceRecord['kind'],
        country: candidate.country,
        config: candidate.config,
      };

      try {
        const connector = resolveConnector(record);
        if (!connector.probe) {
          throw new Error(`Connector "${connector.key}" does not support discovery probing`);
        }
        await connector.probe(record);

        const source = await prisma.source.create({
          data: {
            key: candidate.key,
            name: candidate.name,
            kind: candidate.kind,
            country: candidate.country,
            config: candidate.config,
            enabled: true,
            discovered: true,
          },
        });

        await prisma.sourceCandidate.update({
          where: { id: candidate.id },
          data: {
            promotedSourceId: source.id,
            lastCheckedAt: new Date(),
            lastCheckOk: true,
            lastCheckError: null,
          },
        });
        promoted += 1;
      } catch (error) {
        const message = (error as Error).message;
        errors.push(`[${candidate.name}] ${message}`);
        await prisma.sourceCandidate.update({
          where: { id: candidate.id },
          data: { lastCheckedAt: new Date(), lastCheckOk: false, lastCheckError: message },
        });
      }
    }

    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: {
        finishedAt: new Date(),
        checked: candidates.length,
        promoted,
        error: errors.length ? errors.join('\n') : undefined,
      },
    });

    return { discoveryRunId: discoveryRun.id, checked: candidates.length, promoted, errors };
  } catch (error) {
    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: { finishedAt: new Date(), error: (error as Error).message },
    });
    throw error;
  }
}

// Кандидаты с kind="recruiting_agency" не проверяются коннектором напрямую —
// вместо этого эвристический классификатор (см.
// src/discovery/agencyClassifier.ts) оценивает сам сайт по критериям
// пользователя и определяет его тип: кадровое агентство (с подтверждением
// или требующее проверки), доска объявлений/база вакансий, или репозиторий
// вакансий на сайте самого работодателя (Greenhouse/Lever). Возвращает 1,
// если кандидат был повышен до Source, иначе 0.
async function checkAgencyCandidate(candidate: SourceCandidate, errors: string[]): Promise<number> {
  try {
    const cfg = JSON.parse(candidate.config) as { url: string };
    const result = await classifyAgencySite(cfg.url);

    await prisma.sourceCandidate.update({
      where: { id: candidate.id },
      data: {
        lastCheckedAt: new Date(),
        lastCheckOk: true,
        lastCheckError: null,
        verificationStatus: result.status,
        resourceType: result.resourceType,
        score: result.score,
        geography: result.geography,
        specialization: result.specialization,
        evidenceQuote: result.evidenceQuote,
        employerContact: result.employerContact,
      },
    });

    // Найден репозиторий вакансий работодателя на Greenhouse/Lever — это
    // единственный случай, где есть реальный рабочий коннектор. Проверяем
    // его так же, как обычную ats_board-заявку, и если он действительно
    // отдаёт вакансии — сразу включаем в скан, а не просто каталогизируем.
    if (result.detectedAtsBoard) {
      const atsConfig = { connector: 'ats_board', ...result.detectedAtsBoard };
      const record: SourceRecord = {
        id: candidate.id,
        key: candidate.key,
        name: candidate.name,
        kind: 'ats',
        country: candidate.country,
        config: JSON.stringify(atsConfig),
      };
      try {
        await resolveConnector(record).probe?.(record);
        const source = await prisma.source.create({
          data: {
            key: candidate.key,
            name: candidate.name,
            kind: 'ats',
            country: candidate.country,
            config: JSON.stringify(atsConfig),
            enabled: true,
            discovered: true,
          },
        });
        await prisma.sourceCandidate.update({
          where: { id: candidate.id },
          data: { promotedSourceId: source.id },
        });
        return 1;
      } catch {
        // Ссылка на доску нашлась, но сама доска не отвечает (устарела,
        // требует другого slug и т.п.) — оставляем кандидата как
        // "employer_repository" без промоушена, ошибку не считаем фатальной.
        return 0;
      }
    }

    if (result.status !== 'verified') {
      return 0;
    }

    // enabled: false — у произвольного сайта агентства нет универсального
    // способа вытянуть его вакансии (см. README про ATS/RSS-коннекторы),
    // поэтому он появляется в списке источников как подтверждённый ресурс,
    // но не участвует в скане, пока для него не настроят конкретный коннектор.
    const source = await prisma.source.create({
      data: {
        key: candidate.key,
        name: candidate.name,
        kind: candidate.kind,
        country: candidate.country,
        config: candidate.config,
        enabled: false,
        discovered: true,
      },
    });
    await prisma.sourceCandidate.update({
      where: { id: candidate.id },
      data: { promotedSourceId: source.id },
    });
    return 1;
  } catch (error) {
    const message = (error as Error).message;
    errors.push(`[${candidate.name}] ${message}`);
    await prisma.sourceCandidate.update({
      where: { id: candidate.id },
      data: { lastCheckedAt: new Date(), lastCheckOk: false, lastCheckError: message },
    });
    return 0;
  }
}
