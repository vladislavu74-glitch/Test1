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

export async function runScan(trigger: ScanTrigger): Promise<ScanResult> {
  const scanRun = await prisma.scanRun.create({ data: { trigger } });
  const errors: string[] = [];

  try {
    const [sources, jobTitles, criteria] = await Promise.all([
      prisma.source.findMany({ where: { enabled: true } }),
      prisma.jobTitle.findMany({ where: { selected: true } }),
      prisma.searchCriteria.findUnique({ where: { id: 'singleton' } }),
    ]);

    const newlyInsertedVacancyIds: string[] = [];

    const geography = [
      ...(criteria ? (JSON.parse(criteria.countries) as string[]) : []),
      ...(criteria ? (JSON.parse(criteria.regions) as string[]) : []),
      ...(criteria ? (JSON.parse(criteria.cities) as string[]) : []),
    ];

    for (const jobTitle of jobTitles) {
      const scanCriteria: ScanCriteria = {
        jobTitle: jobTitle.title,
        countries: criteria ? (JSON.parse(criteria.countries) as string[]) : [],
        regions: criteria ? (JSON.parse(criteria.regions) as string[]) : [],
        cities: criteria ? (JSON.parse(criteria.cities) as string[]) : [],
        employmentType: criteria?.employmentType ?? null,
        salaryMin: criteria?.salaryMin ?? null,
        remoteOnly: criteria?.remoteOnly ?? false,
      };

      for (const source of sources) {
        try {
          const raw = await resolveConnector(toSourceRecord(source)).search(
            toSourceRecord(source),
            scanCriteria,
          );
          // Ни один коннектор не умеет сам фильтровать по произвольному
          // списку стран/регионов/городов — делаем это здесь, единообразно
          // для всех источников, по полю location, которое они возвращают.
          const filtered = filterByGeography(raw, geography);
          const insertedIds = await upsertVacancies(source.id, filtered);
          newlyInsertedVacancyIds.push(...insertedIds);
        } catch (error) {
          const message = `[${source.key} / "${jobTitle.title}"] ${(error as Error).message}`;
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

// Одна и та же ошибка коннектора (например, hh.ru временно недоступен)
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
// географии" — так было и раньше, до этого поля. Если список задан,
// оставляем только вакансии, чьё location (как его вернул коннектор)
// содержит хотя бы одно из значений (без учёта регистра).
function filterByGeography(vacancies: RawVacancy[], geography: string[]): RawVacancy[] {
  if (geography.length === 0) return vacancies;
  const needles = geography.map((g) => g.toLowerCase());
  return vacancies.filter((v) => {
    if (!v.location) return false;
    const loc = v.location.toLowerCase();
    return needles.some((needle) => loc.includes(needle));
  });
}

function toSourceRecord(source: {
  id: string;
  key: string;
  name: string;
  kind: string;
  country: string | null;
  config: string;
}): SourceRecord {
  return {
    id: source.id,
    key: source.key,
    name: source.name,
    kind: source.kind as SourceRecord['kind'],
    country: source.country,
    config: source.config,
  };
}

// Возвращает id вакансий, которые были ВСТАВЛЕНЫ впервые (а не просто
// увидены повторно) — именно они считаются "новыми" для email-уведомления.
async function upsertVacancies(sourceId: string, raw: RawVacancy[]): Promise<string[]> {
  const insertedIds: string[] = [];

  for (const vacancy of raw) {
    const existing = await prisma.vacancy.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: vacancy.externalId } },
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
        sourceId,
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
    include: { source: true },
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
    sourceName: v.source.name,
  }));

  await sendVacancyDigest(forEmail);

  await prisma.notificationLog.createMany({
    data: vacancies.map((v) => ({ vacancyId: v.id })),
  });

  return true;
}
