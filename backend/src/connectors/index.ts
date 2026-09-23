import { genericSiteConnector } from './genericSite';
import { telegramChannelConnector } from './telegramChannel';
import type { JobSourceConnector, SourceRecord } from './types';

const registry: Record<string, JobSourceConnector> = {
  [genericSiteConnector.key]: genericSiteConnector,
  [telegramChannelConnector.key]: telegramChannelConnector,
};

// SourceRecord.config — JSON с полем "connector", называющим один из ключей
// выше. SourceRecord строится на лету из HiringResource в src/jobs/scan.ts
// (generic_site для сайтов, telegram_channel для Telegram-каналов).
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
