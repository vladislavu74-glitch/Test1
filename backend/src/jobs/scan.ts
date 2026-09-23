import { prisma } from '../db/client';
import { resolveConnector } from '../connectors';
import type { RawVacancy, ScanCriteria, SourceRecord } from '../connectors/types';
import { sendVacancyDigest } from '../mail/mailer';
import type { VacancyForEmail } from '../mail/template';

export type ScanTrigger = 'cron' | 'manual';

export interface ScanResult {
  scanRunId: string;
  newVacancyCount: number;
  emailSent: boolean;
  errors: string[];
}

// Категории HiringResource, которые реально можно просканировать без
// хранимой технической конфигурации — просто по адресу страницы. Агентства
// (recruiting_agency/hr_agency) работают под заказ для клиентов и не имеют
// обобщённо парсибельного списка вакансий на своём сайте, поэтому автоматически
// не сканируются (можно будет открыть их вручную по ссылке из карточки).
const SCANNABLE_CATEGORIES = ['direct_employer', 'job_board', 'community', 'social', 'telegram'];

export async function runScan(trigger: ScanTrigger): Promise<ScanResult> {
  const scanRun = await prisma.scanRun.create({ data: { trigger } });
  const errors: string[] = [];

  try {
    const [resources, jobTitles, criteria] = await Promise.all([
      prisma.hiringResource.findMany({
        where: { status: 'confirmed', category: { in: SCANNABLE_CATEGORIES } },
      }),
      prisma.jobTitle.findMany({ where: { selected: true } }),
      prisma.searchCriteria.findUnique({ where: { id: 'singleton' } }),
    ]);

    const newlyInsertedVacancyIds: string[] = [];

    const countries = criteria ? (JSON.parse(criteria.countries) as string[]) : [];
    const cities = criteria ? (JSON.parse(criteria.cities) as string[]) : [];
    const geography = [...countries, ...cities];

    for (const jobTitle of jobTitles) {
      const scanCriteria: ScanCriteria = {
        jobTitle: jobTitle.title,
        countries,
        cities,
      };

      for (const resource of resources) {
        const record = toSourceRecord(resource);
        if (!record) continue; // категория без понятного способа сканирования (не должно случаться из-за фильтра выше)

        try {
          const raw = await resolveConnector(record).search(record, scanCriteria);
          // Ни один коннектор не умеет сам фильтровать по произвольному
          // списку стран/регионов/городов — делаем это здесь, единообразно
          // для всех источников, по полю location, которое они возвращают.
          const filtered = filterByGeography(raw, geography);
          const insertedIds = await upsertVacancies(resource.id, filtered);
          newlyInsertedVacancyIds.push(...insertedIds);
        } catch (error) {
          const message = `[${resource.name} / "${jobTitle.title}"] ${(error as Error).message}`;
          errors.push(message);
          console.error(message);
        }
      }
    }

    let emailSent = false;
    if (trigger === 'cron' && newlyInsertedVacancyIds.length > 0) {
      emailSent = await notifyNewVacancies(newlyInsertedVacancyIds);
    }

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        finishedAt: new Date(),
        newVacancies: newlyInsertedVacancyIds.length,
        emailSent,
        error: errors.length ? summarizeErrors(errors) : undefined,
      },
    });

    return {
      scanRunId: scanRun.id,
      newVacancyCount: newlyInsertedVacancyIds.length,
      emailSent,
      errors,
    };
  } catch (error) {
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: { finishedAt: new Date(), error: (error as Error).message },
    });
    throw error;
  }
}

// Одна и та же ошибка коннектора (например, сайт временно недоступен)
// повторяется для каждого выбранного названия должности — без группировки
// пользователь видит один и тот же текст по 5-10 раз подряд. Схлопываем
// одинаковые сообщения одного источника в одну строку со счётчиком.
function summarizeErrors(errors: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of errors) {
    const match = raw.match(/^\[([^/]+) \/ "[^"]*"\] (.*)$/s);
    const key = match ? `[${match[1].trim()}] ${match[2]}` : raw;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([message, count]) => (count > 1 ? `${message} (×${count})` : message))
    .join('\n');
}

// Пустой список стран/регионов/городов означает "без ограничения по
// географии". Если список задан, оставляем только вакансии, чьё location
// (как его вернул коннектор) содержит хотя бы одно из значений (без учёта регистра).
function filterByGeography(vacancies: RawVacancy[], geography: string[]): RawVacancy[] {
  if (geography.length === 0) return vacancies;
  const needles = geography.map((g) => g.toLowerCase());
  return vacancies.filter((v) => {
    // Многие источники (Telegram-каналы и т.п.) вообще не отдают location —
    // в этом случае нет оснований считать вакансию несовпадающей, и
    // отбрасывать её означало бы тихо обнулять результаты именно там,
    // где фильтр неприменим, а не там, где город реально не совпал.
    if (!v.location) return true;
    const loc = v.location.toLowerCase();
    return needles.some((needle) => loc.includes(needle));
  });
}

// Telegram-ссылки встречаются в двух видах: https://t.me/username и
// https://t.me/s/username (веб-превью) — канал в обоих случаях последний
// сегмент пути, кроме служебного "s".
function extractTelegramUsername(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)t\.me$/i.test(parsed.hostname)) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const username = segments[0] === 's' ? segments[1] : segments[0];
    return username || null;
  } catch {
    return null;
  }
}

// Строит SourceRecord для коннектора на лету из подтверждённого
// HiringResource — никакой отдельной технической записи не хранится.
function toSourceRecord(resource: { id: string; name: string; url: string; category: string }): SourceRecord | null {
  if (resource.category === 'telegram') {
    const channelUsername = extractTelegramUsername(resource.url);
    if (!channelUsername) return null;
    return {
      id: resource.id,
      key: resource.id,
      name: resource.name,
      kind: 'telegram_channel',
      config: JSON.stringify({ connector: 'telegram_channel', channelUsername }),
    };
  }

  return {
    id: resource.id,
    key: resource.id,
    name: resource.name,
    kind: 'generic_site',
    config: JSON.stringify({ connector: 'generic_site', url: resource.url }),
  };
}

// Возвращает id вакансий, которые были ВСТАВЛЕНЫ впервые (а не просто
// увидены повторно) — именно они считаются "новыми" для email-уведомления.
async function upsertVacancies(hiringResourceId: string, raw: RawVacancy[]): Promise<string[]> {
  const insertedIds: string[] = [];

  for (const vacancy of raw) {
    const existing = await prisma.vacancy.findUnique({
      where: { hiringResourceId_externalId: { hiringResourceId, externalId: vacancy.externalId } },
    });

    if (existing) {
      await prisma.vacancy.update({
        where: { id: existing.id },
        data: {
          title: vacancy.title,
          company: vacancy.company,
          url: vacancy.url,
          location: vacancy.location,
          salaryText: vacancy.salaryText,
          publishedAt: vacancy.publishedAt,
          lastSeenAt: new Date(),
        },
      });
      continue;
    }

    const created = await prisma.vacancy.create({
      data: {
        hiringResourceId,
        externalId: vacancy.externalId,
        title: vacancy.title,
        company: vacancy.company,
        url: vacancy.url,
        location: vacancy.location,
        salaryText: vacancy.salaryText,
        publishedAt: vacancy.publishedAt,
        state: { create: { hidden: false } },
      },
    });
    insertedIds.push(created.id);
  }

  return insertedIds;
}

// Отправляет письмо по вакансиям, которые ещё не скрыты и по которым ещё не
// отправлялось уведомление, и помечает их в NotificationLog.
async function notifyNewVacancies(vacancyIds: string[]): Promise<boolean> {
  const vacancies = await prisma.vacancy.findMany({
    where: {
      id: { in: vacancyIds },
      state: { hidden: false },
      notificationLog: null,
    },
    include: { hiringResource: true },
  });

  if (vacancies.length === 0) return false;

  const forEmail: VacancyForEmail[] = vacancies.map((v) => ({
    externalId: v.externalId,
    title: v.title,
    company: v.company ?? undefined,
    url: v.url,
    location: v.location ?? undefined,
    salaryText: v.salaryText ?? undefined,
    publishedAt: v.publishedAt,
    sourceName: v.hiringResource.name,
  }));

  await sendVacancyDigest(forEmail);

  await prisma.notificationLog.createMany({
    data: vacancies.map((v) => ({ vacancyId: v.id })),
  });

  return true;
}
