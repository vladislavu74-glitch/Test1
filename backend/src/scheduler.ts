import cron from 'node-cron';
import { config } from './config';
import { runScan } from './jobs/scan';
import { runDiscovery } from './jobs/discoverSources';

export function startScheduler(): void {
  // Каждый день в 10:00 по таймзоне CRON_TZ (по умолчанию Europe/Moscow).
  // Сначала автообнаружение новых источников (каталог кандидатов), затем
  // обычный скан вакансий — так свежепромотированные источники сразу
  // участвуют в скане того же дня.
  cron.schedule(
    '0 10 * * *',
    async () => {
      try {
        await runDiscovery('cron');
      } catch (error) {
        console.error('Scheduled discovery failed:', error);
      }
      try {
        await runScan('cron');
      } catch (error) {
        console.error('Scheduled scan failed:', error);
      }
    },
    { timezone: config.cronTz },
  );

  console.log(`Scheduler started: daily discovery + scan at 10:00 (${config.cronTz})`);
}
