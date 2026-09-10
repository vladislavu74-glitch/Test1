import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiAuthToken: required('API_AUTH_TOKEN', 'dev-only-token'),
  superJobApiKey: process.env.SUPERJOB_API_KEY ?? '',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
  mailFrom: process.env.MAIL_FROM ?? 'Job Monitor <no-reply@example.com>',
  mailTo: process.env.MAIL_TO ?? 'V_utkin@castleduck.com',
  cronTz: process.env.CRON_TZ ?? 'Europe/Moscow',
};
