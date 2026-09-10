import cron from 'node-cron';
import { config } from './config';
import { runScan } from './jobs/scan';

export function startScheduler(): void {
  // Каждый день в 10:00 по таймзоне CRON_TZ (по умолчанию Europe/Moscow).
  cron.schedule(
    '0 10 * * *',
    () => {
      runScan('cron').catch((error) => {
        console.error('Scheduled scan failed:', error);
      });
    },
    { timezone: config.cronTz },
  );

  console.log(`Scheduler started: daily scan at 10:00 (${config.cronTz})`);
}
