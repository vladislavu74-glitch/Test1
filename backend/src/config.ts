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
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  // Без верифицированного домена в Resend отправлять можно только с этого
  // адреса — куда угодно. См. src/mail/mailer.ts.
  mailFrom: process.env.MAIL_FROM ?? 'Job Monitor <onboarding@resend.dev>',
  mailTo: process.env.MAIL_TO ?? 'V_utkin@castleduck.com',
  cronTz: process.env.CRON_TZ ?? 'Europe/Moscow',
};
