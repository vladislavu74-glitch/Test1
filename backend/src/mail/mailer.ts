import { config } from '../config';
import { renderDigestEmail, type VacancyForEmail } from './template';

// Отправка через Resend (https://resend.com) поверх HTTPS вместо прямого
// SMTP: многие бюджетные VPS (в т.ч. наш) по умолчанию блокируют исходящие
// SMTP-порты 25/465/587 как антиспам-меру, а порт 443 не блокируется
// практически никогда. Без верификации своего домена в Resend можно
// отправлять только с адреса onboarding@resend.dev, но КУДА угодно —
// этого достаточно для личного дайджеста на один и тот же адрес.
export async function sendVacancyDigest(vacancies: VacancyForEmail[]): Promise<void> {
  if (vacancies.length === 0) return;
  if (!config.resendApiKey) {
    throw new Error('RESEND_API_KEY не задан — зарегистрируйтесь на resend.com и получите ключ');
  }

  const { subject, html, text } = renderDigestEmail(vacancies);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [config.mailTo],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error: ${response.status} ${body}`);
  }
}
