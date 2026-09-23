import Parser from 'rss-parser';
import { matchesJobTitle, type JobSourceConnector, type RawVacancy, type ScanCriteria, type SourceRecord } from './types';

// Habr Career (career.habr.com) не предоставляет официального публичного
// поискового API. Этот коннектор использует их RSS-ленту вакансий по
// поисковому запросу. ВАЖНО: формат URL и параметров ленты может измениться
// без предупреждения — перед боевым использованием проверьте вручную, что
// `https://career.habr.com/vacancies/rss?q=<запрос>&type=all` отдаёт RSS с
// актуальными вакансиями, и при необходимости поправьте `buildFeedUrl`.
// Это менее надёжный источник, чем hh.ru/SuperJob, поэтому ошибки здесь не
// должны останавливать остальной скан (пайплайн уже изолирует коннекторы).
const parser = new Parser();

function buildFeedUrl(jobTitle: string): string {
  const params = new URLSearchParams({ q: jobTitle, type: 'all' });
  return `https://career.habr.com/vacancies/rss?${params.toString()}`;
}

export const habrCareerConnector: JobSourceConnector = {
  key: 'habr_career',

  async search(_source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const feed = await parser.parseURL(buildFeedUrl(criteria.jobTitle));

    // RSS-поиск Habr Career ищет по всей вакансии (в т.ч. описание/навыки),
    // не только по названию — без этой проверки в выдаче попадаются
    // вакансии, чьё название вообще не похоже на запрошенное.
    return (feed.items ?? [])
      .filter((item) => item.link && item.title && matchesJobTitle(item.title, criteria.jobTitle))
      .map((item) => ({
        externalId: item.guid ?? item.link!,
        title: item.title ?? criteria.jobTitle,
        // Habr Career публикует название компании в <dc:creator>, которое
        // rss-parser разбирает в item.creator.
        company: item.creator || undefined,
        url: item.link!,
        location: undefined,
        salaryText: undefined,
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      }));
  },
};
