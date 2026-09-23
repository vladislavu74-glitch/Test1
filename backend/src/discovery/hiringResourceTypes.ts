// Типы для поиска и верификации ресурсов найма (см. HiringResource в schema.prisma).
// Единица результата — ресурс (сайт/канал/сообщество/страница), а не вакансия;
// отдельные вакансии используются только как доказательство деятельности ресурса.

export type ResourceCategory =
  | 'recruiting_agency'
  | 'hr_agency'
  | 'direct_employer'
  | 'telegram'
  | 'community'
  | 'social'
  | 'job_board';

export type ResourceRole = 'hires_own' | 'sources_for_clients' | 'distributes_vacancies';

export type ResourceStatus = 'confirmed' | 'needs_review' | 'excluded';

// Входные параметры запуска (раздел 1 требования). Каждое поле, оставленное
// пустым/не заданным пользователем, агент обязан явно зафиксировать как
// допущение в HiringResourceRun.paramsJson.assumptions — а не подставлять
// молча дефолт без объяснения.
export interface HiringResourceRunParams {
  geography: {
    countries: string[];
    cities: string[];
    remote: boolean; // включать ли ресурсы, ищущие удалённых сотрудников без привязки к городу
  };
  // Отрасли/профессии/уровни; пустой массив = "любые" (должно быть зафиксировано как допущение).
  specialization: string[];
  categories: ResourceCategory[];
  languages: string[];
  recencyDays: number; // по умолчанию 90 (раздел 4)
  targetCount: number; // требуемое число уникальных подтверждённых ресурсов
  // Желаемое распределение по категориям, ключ = ResourceCategory. Необязательно.
  categoryDistribution?: Partial<Record<ResourceCategory, number>>;
  exclusions: string[]; // например: "агрегаторы вакансий", "кадровый учёт", "обучение"
}

export interface HiringResourceCandidate {
  name: string;
  url: string;
  category: ResourceCategory;
  roles: ResourceRole[];
  organizationName: string | null;
  hiringGeography: string | null;
  agencyLocation: string | null;
  specialization: string | null;
  evidenceSummary: string;
  evidenceUrl: string;
  lastRelevantDate: string | null; // ISO date, если найдена реальная дата публикации/вакансии
  contactMethod: string | null;
  publicContact: string | null;
  status: ResourceStatus;
  exclusionReason: string | null;
  relatedResources: string[];
  uncertainties: string | null;
}

// Итог поиска — сами ресурсы больше не собираются в массив и не возвращаются
// одним пакетом: каждый передаётся вызывающему коду сразу через колбэк
// onResource (см. searchHiringResources), как только модель его находит, —
// это и даёт промежуточные результаты и возможность остановить поиск между
// находками, а не только после того, как модель решит закончить сама.
export interface HiringResourceSearchOutcome {
  queriesUsed: number;
  foundCount: number;
  limitations: string[]; // категории/условия, которые не удалось покрыть
  stoppedByUser: boolean; // остановлено пользователем, а не естественным завершением
  rawText?: string;
}

export const DEFAULT_RECENCY_DAYS = 90;

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  recruiting_agency: 'Рекрутинговое/кадровое агентство',
  hr_agency: 'HR-агентство',
  direct_employer: 'Прямой работодатель',
  telegram: 'Telegram-канал/группа',
  community: 'Профессиональное сообщество',
  social: 'Социальная сеть',
  job_board: 'Работный сайт/агрегатор',
};
