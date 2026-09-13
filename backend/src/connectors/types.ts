// Критерии, с которыми запускается скан: одно выбранное название должности
// плюс общие фильтры. Пайплайн скана вызывает коннектор один раз на каждое
// выбранное название (см. src/jobs/scan.ts).
export interface ScanCriteria {
  jobTitle: string;
  countries: string[];
  regions: string[];
  cities: string[];
  employmentType?: string | null;
  salaryMin?: number | null;
  remoteOnly: boolean;
}

// Нормализованная вакансия, которую возвращает любой коннектор.
export interface RawVacancy {
  externalId: string;
  title: string;
  company?: string;
  url: string;
  location?: string;
  salaryText?: string;
  publishedAt: Date;
}

export interface SourceRecord {
  id: string;
  key: string;
  name: string;
  kind: 'api' | 'ats' | 'rss';
  country?: string | null;
  config: string;
}

export interface JobSourceConnector {
  key: string;
  search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]>;
  // Необязательная лёгкая проверка "жив ли ресурс и правда ли отдаёт вакансии",
  // без фильтрации по названию должности. Используется при автообнаружении
  // источников (см. src/jobs/discoverSources.ts) — коннекторы вакансионных
  // API (hh.ru/SuperJob/Habr) его не реализуют, т.к. не участвуют в каталоге
  // кандидатов (они и так уже в списке источников).
  probe?(source: SourceRecord): Promise<void>;
}
