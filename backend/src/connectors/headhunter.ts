import { matchesJobTitle, type JobSourceConnector, type RawVacancy, type ScanCriteria, type SourceRecord } from './types';

// api.hh.ru блокирует запросы с IP этого сервера через DDoS-Guard (403 на
// любой запрос, независимо от заголовков) — сам сайт hh.ru при этом
// открывается нормально. Поэтому вместо официального API парсим страницу
// поиска: hh.ru — это React-приложение с серверным рендерингом, и все
// найденные вакансии уже лежат структурированным JSON во встроенном
// <template id="HH-Lux-InitialState"> — не нужно даже парсить HTML-вёрстку
// карточек, только вытащить и распарсить этот блок.
interface HeadHunterConfig {
  connector: 'headhunter';
  areaId?: number; // например 113 = Россия (по данным справочника hh на момент написания)
}

interface HhStateVacancy {
  vacancyId: number;
  name: string;
  company?: { name?: string };
  area?: { name?: string };
  compensation?: {
    from?: number;
    to?: number;
    currencyCode?: string;
    noCompensation?: unknown;
  };
  publicationTime?: { $?: string };
  links?: { desktop?: string };
}

interface HhInitialState {
  vacancySearchResult?: {
    vacancies?: HhStateVacancy[];
  };
}

const STATE_TEMPLATE_REGEX = /<template[^>]*id="HH-Lux-InitialState"[^>]*>([\s\S]*?)<\/template>/;

export const headHunterConnector: JobSourceConnector = {
  key: 'headhunter',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: HeadHunterConfig = JSON.parse(source.config);

    const params = new URLSearchParams({
      text: criteria.jobTitle,
      order_by: 'publication_time',
    });
    if (cfg.areaId !== undefined) params.set('area', String(cfg.areaId));

    const response = await fetch(`https://hh.ru/search/vacancy?${params.toString()}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      throw new Error(`hh.ru error: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const vacancies = extractVacancies(html);

    // hh.ru делает морфологический/нечёткий поиск, поэтому дополнительно
    // подстраховываемся клиентской проверкой названия — как и другие коннекторы.
    return vacancies
      .filter((v) => matchesJobTitle(v.name, criteria.jobTitle))
      .map((v) => ({
        externalId: String(v.vacancyId),
        title: v.name,
        company: v.company?.name,
        url: v.links?.desktop ?? `https://hh.ru/vacancy/${v.vacancyId}`,
        location: v.area?.name,
        salaryText: formatSalary(v.compensation),
        publishedAt: v.publicationTime?.$ ? new Date(v.publicationTime.$) : new Date(),
      }));
  },
};

function extractVacancies(html: string): HhStateVacancy[] {
  const match = STATE_TEMPLATE_REGEX.exec(html);
  if (!match) {
    throw new Error(
      'hh.ru: не найден блок HH-Lux-InitialState на странице поиска — вёрстка сайта могла измениться',
    );
  }
  let state: HhInitialState;
  try {
    state = JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    throw new Error('hh.ru: не удалось разобрать встроенное состояние страницы поиска');
  }
  return state.vacancySearchResult?.vacancies ?? [];
}

// hh.ru отдаёт этот JSON HTML-экранированным (внутри содержимого <template>),
// поэтому кавычки и спецсимволы закодированы как числовые/именованные
// HTML-сущности — раскодируем их перед JSON.parse.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function formatSalary(compensation?: HhStateVacancy['compensation']): string | undefined {
  if (!compensation || compensation.noCompensation !== undefined) return undefined;
  const parts: string[] = [];
  if (compensation.from) parts.push(`от ${compensation.from}`);
  if (compensation.to) parts.push(`до ${compensation.to}`);
  if (compensation.currencyCode) parts.push(compensation.currencyCode);
  return parts.length ? parts.join(' ') : undefined;
}
