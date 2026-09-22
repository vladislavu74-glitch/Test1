// Нормализация адресов и группировка по организациям (раздел 8 требования):
// рекламные метки/редиректы не должны создавать мнимые дубли, а сайт
// агентства и его Telegram-канал остаются разными ресурсами, но связываются
// с одной организацией — итоги считают ресурсы и организации отдельно.
import { prisma } from '../db/client';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'yclid', 'ref', 'ref_src', 'from',
];

export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim().replace(/\/+$/, '').toLowerCase();
  }

  url.hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }
  // Сортируем оставшиеся параметры, чтобы разный порядок не считался разным URL.
  url.searchParams.sort();

  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname === '') pathname = '/';

  const search = url.searchParams.toString();
  const protocol = 'https:'; // http/https одного и того же ресурса — тот же ресурс
  return `${protocol}//${url.hostname}${pathname}${search ? '?' + search : ''}`.toLowerCase();
}

// Находит организацию по точному совпадению имени без учёта регистра, либо
// создаёт новую. Резюме нарочно простое: сложное сопоставление синонимов
// названий компаний — отдельная задача, не относящаяся к дедупликации URL.
export async function resolveOrganizationId(organizationName: string | null): Promise<string | null> {
  if (!organizationName?.trim()) return null;
  const name = organizationName.trim();

  // SQLite + Prisma: сравнение без учёта регистра делаем вручную, т.к.
  // `mode: 'insensitive'` недоступен для sqlite-провайдера.
  const all = await prisma.organization.findMany({ select: { id: true, name: true } });
  const matched = all.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (matched) return matched.id;

  const created = await prisma.organization.create({ data: { name } });
  return created.id;
}
