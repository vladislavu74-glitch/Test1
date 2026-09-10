import type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';

// Многие компании публикуют свои вакансии через типовые ATS (системы
// подбора персонала), у которых есть публичные read-only JSON API,
// предназначенные именно для встраивания списка вакансий на сайт компании.
// Это легальный и стабильный способ покрыть "сайты компаний, которые
// размещают вакансии у себя" без парсинга произвольного HTML.
// Пользователь добавляет источник этого типа из приложения, указывая
// provider + boardSlug/companyId (их видно в адресной строке карьерной
// страницы компании, например career.greenhouse.io/<slug> или
// jobs.lever.co/<company>).
interface AtsBoardConfig {
  connector: 'ats_board';
  provider: 'greenhouse' | 'lever';
  boardSlug: string; // slug/company id в системе провайдера
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  location?: { name?: string };
}

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number; // epoch ms
  categories?: { location?: string };
}

export const atsBoardConnector: JobSourceConnector = {
  key: 'ats_board',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: AtsBoardConfig = JSON.parse(source.config);
    const all =
      cfg.provider === 'greenhouse'
        ? await fetchGreenhouse(cfg.boardSlug)
        : await fetchLever(cfg.boardSlug);

    const needle = criteria.jobTitle.toLowerCase();
    return all.filter((vacancy) => vacancy.title.toLowerCase().includes(needle));
  },

  // Для автообнаружения: просто убеждаемся, что доска существует и отдаёт
  // корректный ответ (пустой список вакансий — это тоже валидный ответ).
  async probe(source: SourceRecord): Promise<void> {
    const cfg: AtsBoardConfig = JSON.parse(source.config);
    if (cfg.provider === 'greenhouse') {
      await fetchGreenhouse(cfg.boardSlug);
    } else {
      await fetchLever(cfg.boardSlug);
    }
  },
};

async function fetchGreenhouse(boardSlug: string): Promise<RawVacancy[]> {
  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardSlug)}/jobs?content=true`,
  );
  if (!response.ok) {
    throw new Error(`Greenhouse board "${boardSlug}" error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { jobs: GreenhouseJob[] };
  return data.jobs.map((job) => ({
    externalId: String(job.id),
    title: job.title,
    url: job.absolute_url,
    location: job.location?.name,
    // Greenhouse не отдаёт дату первой публикации в этом эндпоинте — используем
    // дату последнего обновления как приближение "свежести".
    publishedAt: new Date(job.updated_at),
  }));
}

async function fetchLever(companySlug: string): Promise<RawVacancy[]> {
  const response = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`,
  );
  if (!response.ok) {
    throw new Error(`Lever board "${companySlug}" error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as LeverPosting[];
  return data.map((posting) => ({
    externalId: posting.id,
    title: posting.text,
    url: posting.hostedUrl,
    location: posting.categories?.location,
    publishedAt: new Date(posting.createdAt),
  }));
}
