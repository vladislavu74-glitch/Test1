import type { RawVacancy } from '../connectors/types';

export interface VacancyForEmail extends RawVacancy {
  sourceName: string;
}

export function renderDigestEmail(vacancies: VacancyForEmail[]): { subject: string; html: string; text: string } {
  const sorted = [...vacancies].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const subject = `Найдено новых вакансий: ${sorted.length}`;

  const rows = sorted
    .map(
      (v) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            <a href="${escapeHtml(v.url)}" style="color:#0b5cff;text-decoration:none;font-weight:600;">${escapeHtml(v.title)}</a><br/>
            <span style="color:#555;font-size:13px;">${escapeHtml(v.company ?? '')}${v.location ? ' · ' + escapeHtml(v.location) : ''}</span><br/>
            <span style="color:#999;font-size:12px;">${escapeHtml(v.sourceName)} · ${formatDate(v.publishedAt)}${v.salaryText ? ' · ' + escapeHtml(v.salaryText) : ''}</span>
          </td>
        </tr>`,
    )
    .join('\n');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">Новые вакансии (${sorted.length})</h2>
      <p style="color:#666;margin-top:0;">Отсортированы от самых свежих к более старым.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`;

  const text = sorted
    .map((v) => `${v.title} — ${v.company ?? ''} (${v.sourceName}, ${formatDate(v.publishedAt)})\n${v.url}`)
    .join('\n\n');

  return { subject, html, text };
}

function formatDate(date: Date): string {
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
