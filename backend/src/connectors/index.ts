import { headHunterConnector } from './headhunter';
import { superJobConnector } from './superjob';
import { habrCareerConnector } from './habrCareer';
import { atsBoardConnector } from './atsBoard';
import { rssFeedConnector } from './rssFeed';
import { genericSiteConnector } from './genericSite';
import { telegramChannelConnector } from './telegramChannel';
import type { JobSourceConnector, SourceRecord } from './types';

const registry: Record<string, JobSourceConnector> = {
  [headHunterConnector.key]: headHunterConnector,
  [superJobConnector.key]: superJobConnector,
  [habrCareerConnector.key]: habrCareerConnector,
  [atsBoardConnector.key]: atsBoardConnector,
  [rssFeedConnector.key]: rssFeedConnector,
  [genericSiteConnector.key]: genericSiteConnector,
  [telegramChannelConnector.key]: telegramChannelConnector,
};

// Каждый Source.config — это JSON с полем "connector", называющим один из
// ключей выше (см. src/seed.ts для примеров). Так один и тот же коннектор
// (например headhunter) может обслуживать несколько Source-записей с
// разными странами/areaId.
export function resolveConnector(source: SourceRecord): JobSourceConnector {
  const cfg = JSON.parse(source.config) as { connector?: string };
  const connector = cfg.connector ? registry[cfg.connector] : undefined;
  if (!connector) {
    throw new Error(`Source "${source.key}" has no valid "connector" in its config`);
  }
  return connector;
}

export { registry as connectorRegistry };
export type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';
