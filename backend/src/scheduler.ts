import cron from 'node-cron';
import { config } from './config';
import { runScan } from './jobs/scan';

export function startScheduler(): void {
  // Каждый день в 10:00 по таймзоне CRON_TZ (по умолчанию Europe/Moscow) —
  // сканирует вакансии по уже подтверждённым HiringResource. Сам поиск
  // ресурсов найма запускается только вручную кнопкой в приложении (см.
  // discoverHiringResources.ts) — дорогая по токенам ИИ-операция, по
  // расписанию не запускается.
  cron.schedule(
    '0 10 * * *',
    async () => {
      try {
        await runScan('cron');
      } catch (error) {
        console.error('Scheduled scan failed:', error);
      }
    },
    { timezone: config.cronTz },
  );

  console.log(`Scheduler started: daily scan at 10:00 (${config.cronTz})`);
}
