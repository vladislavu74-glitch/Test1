import Parser from 'rss-parser';
import { matchesJobTitle, type JobSourceConnector, type RawVacancy, type ScanCriteria, type SourceRecord } from './types';

// Универсальный коннектор для любой RSS/Atom-ленты вакансий. Позволяет
// пользователю добавить произвольный региональный агрегатор или доску,
// публикующую фид, без изменения кода backend'а — достаточно указать
// feedUrl. Т.к. большинство фидов не поддерживают поиск по ключевому слову,
// фильтрация по названию должности выполняется на стороне коннектора.
interface RssFeedConfig {
  connector: 'rss_feed';
  feedUrl: string;
}

const parser = new Parser();

export const rssFeedConnector: JobSourceConnector = {
  key: 'rss_feed',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: RssFeedConfig = JSON.parse(source.config);
    const feed = await parser.parseURL(cfg.feedUrl);

    return (feed.items ?? [])
      .filter((item) => item.link && matchesJobTitle(item.title ?? '', criteria.jobTitle))
      .map((item) => ({
        externalId: item.guid ?? item.link!,
        title: item.title!,
        company: item.creator || undefined,
        url: item.link!,
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      }));
  },

  // Для автообнаружения: лента должна как минимум успешно распарситься.
  async probe(source: SourceRecord): Promise<void> {
    const cfg: RssFeedConfig = JSON.parse(source.config);
    await parser.parseURL(cfg.feedUrl);
  },
};
