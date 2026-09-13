import type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';

// Универсальный коннектор "просто прочитать и распарсить сайт компании" —
// без официального API. Пользователь добавляет любой адрес сайта, а
// коннектор сам обходит несколько типовых разделов и достаёт вакансии
// двумя способами:
//   1. Структурированные данные schema.org/JobPosting в <script type=
//      "application/ld+json"> — многие карьерные страницы и ATS-платформы
//      публикуют их специально для Google for Jobs, это надёжный и
//      машиночитаемый источник без всякого API.
//   2. Если структурированных данных нет — грубая эвристика по ссылкам,
//      чей текст совпадает с искомой должностью.
interface GenericSiteConfig {
  connector: 'generic_site';
  url: string;
}

const CANDIDATE_PATHS = [
  '',
  '/vacancies',
  '/vacancy',
  '/careers',
  '/career',
  '/jobs',
  '/job',
  '/vakansii',
  '/rabota',
  '/about/careers',
];

const FETCH_TIMEOUT_MS = 8000;

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobMonitorBot/1.0)' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface JsonLdJobPosting {
  '@type'?: string | string[];
  title?: string;
  datePosted?: string;
  url?: string;
  hiringOrganization?: { name?: string } | string;
  '@graph'?: JsonLdJobPosting[];
}

function extractJsonLdJobPostings(html: string, pageUrl: string): RawVacancy[] {
  const results: RawVacancy[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const roots = Array.isArray(parsed) ? parsed : [parsed];
    for (const root of roots as JsonLdJobPosting[]) {
      const nodes = root['@graph'] ?? [root];
      for (const node of nodes) {
        const type = node['@type'];
        const isJobPosting = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
        if (!isJobPosting || !node.title) continue;
        const org = typeof node.hiringOrganization === 'string' ? node.hiringOrganization : node.hiringOrganization?.name;
        const url = node.url ?? pageUrl;
        results.push({
          externalId: url,
          title: node.title,
          company: org,
          url,
          publishedAt: node.datePosted ? new Date(node.datePosted) : new Date(),
        });
      }
    }
  }
  return results;
}

function extractHeuristicLinks(html: string, pageUrl: string, needle: string): RawVacancy[] {
  const results: RawVacancy[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return results;
  }
  while ((match = anchorRegex.exec(html))) {
    const text = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > 160 || !text.toLowerCase().includes(needle)) continue;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(match[1], base).toString();
    } catch {
      continue;
    }
    results.push({ externalId: absoluteUrl, title: text, url: absoluteUrl, publishedAt: new Date() });
  }
  return results;
}

export const genericSiteConnector: JobSourceConnector = {
  key: 'generic_site',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: GenericSiteConfig = JSON.parse(source.config);
    const base = cfg.url.replace(/\/$/, '');
    const needle = criteria.jobTitle.toLowerCase();

    const pages = (
      await Promise.all(
        CANDIDATE_PATHS.map(async (path) => {
          const url = base + path;
          const html = await fetchPage(url);
          return html ? { url, html } : null;
        }),
      )
    ).filter((p): p is { url: string; html: string } => p !== null);

    if (pages.length === 0) {
      throw new Error(`Сайт ${cfg.url} недоступен ни по одному из проверенных адресов`);
    }

    const found = new Map<string, RawVacancy>();
    for (const page of pages) {
      for (const v of extractJsonLdJobPostings(page.html, page.url)) {
        if (v.title.toLowerCase().includes(needle)) found.set(v.externalId, v);
      }
    }
    if (found.size === 0) {
      for (const page of pages) {
        for (const v of extractHeuristicLinks(page.html, page.url, needle)) {
          found.set(v.externalId, v);
        }
      }
    }

    return Array.from(found.values());
  },

  async probe(source: SourceRecord): Promise<void> {
    const cfg: GenericSiteConfig = JSON.parse(source.config);
    const html = await fetchPage(cfg.url);
    if (!html) throw new Error(`Сайт ${cfg.url} недоступен`);
  },
};
