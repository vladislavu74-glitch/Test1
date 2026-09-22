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
  // Используется агентом веб-поиска источников вакансий (см.
  // src/discovery/aiSourceSearchAgent.ts) — без ключа этот функционал
  // просто недоступен, остальной backend работает как обычно.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Без верифицированного домена в Resend отправлять с этого адреса можно
  // только на email, на который зарегистрирован сам аккаунт Resend — см.
  // src/mail/mailer.ts и backend/README.md.
  mailFrom: process.env.MAIL_FROM ?? 'Job Monitor <onboarding@resend.dev>',
  mailTo: process.env.MAIL_TO ?? 'vladislav.u74@gmail.com',
  cronTz: process.env.CRON_TZ ?? 'Europe/Moscow',
};
