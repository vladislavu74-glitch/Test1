import type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';

// Публичный API hh.ru (https://api.hh.ru/vacancies, документация:
// https://github.com/hhru/api/blob/master/docs/vacancies.md).
// hh.ru обслуживает не только Россию: дерево регионов (`GET /areas`) включает
// Казахстан, Беларусь, Узбекистан, Киргизию и другие страны СНГ в виде
// отдельных поддеревьев area. Перед боевым использованием стоит свериться с
// `GET https://api.hh.ru/areas` и подставить актуальные areaId в конфиг
// соответствующего Source (см. prisma seed) — они могут меняться.
interface HeadHunterConfig {
  connector: 'headhunter';
  areaId?: number; // например 113 = Россия (по данным справочника hh на момент написания)
}

interface HhVacancyResponse {
  items: Array<{
    id: string;
    name: string;
    alternate_url: string;
    published_at: string;
    employer?: { name?: string };
    area?: { name?: string };
    salary?: { from?: number | null; to?: number | null; currency?: string | null } | null;
  }>;
}

export const headHunterConnector: JobSourceConnector = {
  key: 'headhunter',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: HeadHunterConfig = JSON.parse(source.config);

    const params = new URLSearchParams({
      text: criteria.jobTitle,
      // Без этого hh.ru ищет совпадения ещё и в описании/названии компании —
      // тогда в выдаче попадаются вакансии, чьё название вообще не похоже
      // на запрошенное. Ограничиваем поиск полем "название вакансии".
      search_field: 'name',
      per_page: '50',
      order_by: 'publication_time',
    });
    if (cfg.areaId !== undefined) params.set('area', String(cfg.areaId));

    const response = await fetch(`https://api.hh.ru/vacancies?${params.toString()}`, {
      headers: { 'User-Agent': 'JobMonitorApp/1.0 (personal use)' },
    });
    if (!response.ok) {
      throw new Error(`hh.ru API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as HhVacancyResponse;

    // hh.ru даже с search_field=name делает морфологический/нечёткий поиск
    // (склонения, синонимы), поэтому дополнительно подстраховываемся
    // клиентской проверкой, что название вакансии реально содержит
    // запрошенную фразу — как это уже делает коннектор ats_board.
    const needle = criteria.jobTitle.toLowerCase();
    return data.items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .map((item) => ({
        externalId: item.id,
        title: item.name,
        company: item.employer?.name,
        url: item.alternate_url,
        location: item.area?.name,
        salaryText: formatSalary(item.salary),
        publishedAt: new Date(item.published_at),
      }));
  },
};

function formatSalary(salary: HhVacancyResponse['items'][number]['salary']): string | undefined {
  if (!salary) return undefined;
  const parts: string[] = [];
  if (salary.from) parts.push(`от ${salary.from}`);
  if (salary.to) parts.push(`до ${salary.to}`);
  if (salary.currency) parts.push(salary.currency);
  return parts.length ? parts.join(' ') : undefined;
}
