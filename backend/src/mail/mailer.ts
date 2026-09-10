import nodemailer from 'nodemailer';
import { config } from '../config';
import { renderDigestEmail, type VacancyForEmail } from './template';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendVacancyDigest(vacancies: VacancyForEmail[]): Promise<void> {
  if (vacancies.length === 0) return;

  const { subject, html, text } = renderDigestEmail(vacancies);

  await getTransporter().sendMail({
    from: config.mailFrom,
    to: config.mailTo,
    subject,
    html,
    text,
  });
}
