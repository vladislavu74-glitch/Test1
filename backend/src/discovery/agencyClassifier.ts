// Эвристическая проверка "является ли сайт кадровым агентством" — по
// критериям, которые пользователь сформулировал вручную: одного раздела
// "Вакансии" недостаточно (он есть и у обычных работодателей), поэтому
// ищем явные признаки того, что компания предлагает РАБОТОДАТЕЛЯМ подбор
// сотрудников для их бизнеса, плюс хотя бы одно подтверждение (форма
// заявки, условия услуги, кейсы).
//
// Это не полноценный веб-поиск (для реальных запросов вида `"кадровое
// агентство" Казань` нужен внешний Search API — сюда не подключён, т.к. нет
// ключа), а классификатор конкретного URL, который пользователь или
// ежедневное обнаружение уже нашли.

export type VerificationStatus = 'verified' | 'needs_review' | 'rejected';
export type ResourceType = 'recruiting_agency' | 'job_board' | 'employer_repository' | 'unclear';

export interface DetectedAtsBoard {
  provider: 'greenhouse' | 'lever';
  boardSlug: string;
}

export interface AgencyClassification {
  status: VerificationStatus;
  resourceType: ResourceType;
  score: number;
  matchedCategories: string[];
  geography: string | null;
  specialization: string | null;
  evidenceQuote: string | null;
  employerContact: string | null;
  // Заполняется, если на странице найдена ссылка на публичную доску
  // Greenhouse/Lever — тогда это "репозиторий вакансий на сайте
  // работодателя", который реально можно сканировать существующим
  // коннектором ats_board, а не просто каталогизировать как найденный сайт.
  detectedAtsBoard: DetectedAtsBoard | null;
}

interface Category {
  key: string;
  weight: number; // Высокая=3, Средняя=2, Дополнительная=1
  patterns: RegExp[];
}

// Таблица критериев из требования пользователя.
const CATEGORIES: Category[] = [
  {
    key: 'direct_positioning',
    weight: 3,
    patterns: [
      /кадров(ое|ого|ых)?\s*агентств/i,
      /рекрутингов(ое|ого|ых)?\s*агентств/i,
      /агентств[оа]\s*по\s*подбору\s*персонала/i,
    ],
  },
  {
    key: 'employer_services',
    weight: 3,
    patterns: [
      /подбор[ауе]?\s*(сотрудников|персонала|специалистов)\s*для\s*(вашей|вашего)?\s*(компании|бизнеса)/i,
      /закрыти[ея]\s*вакансий/i,
      /поиск\s*специалистов\s*для/i,
      /подбор\s*персонала\s*для\s*работодателей/i,
    ],
  },
  {
    key: 'request_form',
    weight: 3,
    patterns: [
      /оставить\s*заявку\s*на\s*подбор/i,
      /найти\s*сотрудника/i,
      /заявка\s*на\s*подбор/i,
      /бриф\s*для\s*работодател/i,
    ],
  },
  {
    key: 'terms',
    weight: 3,
    patterns: [
      /стоимост[ьи]\s*подбора/i,
      /оплата\s*за\s*результат/i,
      /гарантия\s*замены/i,
      /договор[а-я]*\s*на\s*подбор/i,
    ],
  },
  {
    key: 'process',
    weight: 2,
    patterns: [/снятие\s*заявки/i, /поиск\s*кандидатов/i, /представлени[ея]\s*кандидат/i],
  },
  {
    key: 'track_record',
    weight: 2,
    patterns: [
      /кейс(ы|ов)?\s*закрытых\s*вакансий/i,
      /отзывы\s*компан/i,
      /наши\s*клиенты/i,
      /список\s*клиентов/i,
    ],
  },
  {
    key: 'specialization',
    weight: 2,
    patterns: [
      /it[\s-]?подбор/i,
      /массов(ый|ого)\s*подбор/i,
      /поиск\s*руководителей/i,
      /executive\s*search/i,
      /подбор\s*рабочих\s*специальностей/i,
    ],
  },
  {
    key: 'multi_client_vacancies',
    weight: 1,
    patterns: [/для\s*нашего\s*клиента/i, /в\s*компанию\s*заказчика/i],
  },
];

// Признаки того, что это агрегатор вакансий/доска объявлений, а не само
// агентство (пользователь просил отдельно исключать такие ресурсы).
const AGGREGATOR_HINTS = [
  /разместить\s*резюме/i,
  /войти\s*как\s*соискател/i,
  /личный\s*кабинет\s*соискател/i,
];

// Доски объявлений/базы вакансий — самостоятельный тип ресурса (не
// агентство и не сайт конкретного работодателя): публикуют вакансии
// множества разных компаний без подбора персонала под заказ.
const JOB_BOARD_HINTS = [
  /доска\s*объявлений/i,
  /база\s*вакансий/i,
  /агрегатор\s*вакансий/i,
  /вакансии\s*от\s*разных\s*работодателей/i,
  /разместить\s*вакансию/i,
  /тысячи\s*вакансий/i,
];

// Ссылка на публичную доску Greenhouse/Lever на странице работодателя —
// значит вакансии реально можно забирать существующим коннектором ats_board,
// а не просто каталогизировать сайт как найденный ресурс.
const GREENHOUSE_LINK = /(?:boards|job-boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i;
const LEVER_LINK = /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i;

const CITY_NAMES = [
  'Москва', 'Санкт-Петербург', 'Екатеринбург', 'Новосибирск', 'Казань',
  'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
  'Уфа', 'Красноярск', 'Пермь', 'Воронеж', 'Волгоград', 'Краснодар',
  'Минск', 'Гомель', 'Витебск',
  'Алматы', 'Астана', 'Нур-Султан', 'Шымкент',
  'Ташкент', 'Бишкек', 'Душанбе',
];

const SPECIALIZATION_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /it[\s-]?подбор/i, label: 'IT-подбор' },
  { pattern: /массов(ый|ого)\s*подбор/i, label: 'массовый подбор' },
  { pattern: /поиск\s*руководителей|executive\s*search/i, label: 'поиск руководителей (executive search)' },
  { pattern: /подбор\s*рабочих\s*специальностей/i, label: 'подбор рабочих специальностей' },
];

const CANDIDATE_PATHS = [
  '',
  '/rabotodatelyam',
  '/dlya-rabotodateley',
  '/employers',
  '/uslugi',
  '/services',
  '/podbor-personala',
  '/stoimost',
  '/keysy',
  '/cases',
  '/o-kompanii',
  '/about',
];

const FETCH_TIMEOUT_MS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

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

function extractEvidenceQuote(text: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(text.length, matchIndex + 80);
  return text.slice(start, end).trim();
}

export async function classifyAgencySite(baseUrl: string): Promise<AgencyClassification> {
  const normalizedBase = baseUrl.replace(/\/$/, '');

  const pages = await Promise.all(
    CANDIDATE_PATHS.map(async (path) => {
      const html = await fetchPage(normalizedBase + path);
      return html ? { rawHtml: html, text: stripHtml(html) } : null;
    }),
  );

  const successfulPages = pages.filter((p): p is { rawHtml: string; text: string } => p !== null);
  if (successfulPages.length === 0) {
    throw new Error(`Не удалось загрузить ни одной страницы ${normalizedBase}`);
  }

  const combinedText = successfulPages.map((p) => p.text).join(' \n ');
  const combinedHtml = successfulPages.map((p) => p.rawHtml).join(' \n ');

  const matchedCategories: string[] = [];
  let score = 0;
  let evidenceQuote: string | null = null;

  for (const category of CATEGORIES) {
    for (const pattern of category.patterns) {
      const match = combinedText.match(pattern);
      if (match && match.index !== undefined) {
        if (!matchedCategories.includes(category.key)) {
          matchedCategories.push(category.key);
          score += category.weight;
        }
        if (
          !evidenceQuote &&
          ['direct_positioning', 'employer_services', 'request_form'].includes(category.key)
        ) {
          evidenceQuote = extractEvidenceQuote(combinedText, match.index);
        }
        break;
      }
    }
  }

  const offersForEmployers =
    matchedCategories.includes('direct_positioning') || matchedCategories.includes('employer_services');
  const hasConfirmation =
    matchedCategories.includes('request_form') ||
    matchedCategories.includes('terms') ||
    matchedCategories.includes('track_record');

  let status: VerificationStatus;
  if (offersForEmployers && hasConfirmation) {
    status = 'verified';
  } else if (offersForEmployers) {
    status = 'needs_review';
  } else {
    status = 'rejected';
  }

  // Практическое правило пользователя: если сигналы агрегатора вакансий
  // сильны, а подтверждения подбора нет — не считать подтверждённым, даже
  // если формально сработала одна из категорий.
  if (status === 'verified') {
    const aggregatorHits = AGGREGATOR_HINTS.filter((p) => p.test(combinedText)).length;
    if (aggregatorHits >= 2 && !matchedCategories.includes('terms')) {
      status = 'needs_review';
    }
  }

  // Названия городов склоняются (Москва/Москве/Москвы) — сравниваем по
  // основе слова (без последней буквы), без учёта регистра, вместо точного
  // совпадения именительного падежа.
  const lowerText = combinedText.toLowerCase();
  const geography = CITY_NAMES.filter((city) => {
    const stem = city.length > 4 ? city.slice(0, -1) : city;
    return lowerText.includes(stem.toLowerCase());
  });
  const specialization = SPECIALIZATION_LABELS.filter((s) => s.pattern.test(combinedText)).map((s) => s.label);

  const emailMatch = combinedHtml.match(/[\w.+-]+@[\w-]+\.[a-zA-Z.]{2,}/);

  // Репозиторий вакансий на сайте работодателя (Greenhouse/Lever) —
  // проверяем в первую очередь: если найден, ресурс реально можно сканировать
  // существующим коннектором, это самый ценный случай "базы вакансий у
  // работодателя", который просил проверять пользователь.
  const greenhouseMatch = combinedHtml.match(GREENHOUSE_LINK);
  const leverMatch = combinedHtml.match(LEVER_LINK);
  const detectedAtsBoard: DetectedAtsBoard | null = greenhouseMatch
    ? { provider: 'greenhouse', boardSlug: greenhouseMatch[1] }
    : leverMatch
      ? { provider: 'lever', boardSlug: leverMatch[1] }
      : null;

  let resourceType: ResourceType;
  if (detectedAtsBoard) {
    resourceType = 'employer_repository';
  } else if (status === 'verified' || status === 'needs_review') {
    resourceType = 'recruiting_agency';
  } else if (JOB_BOARD_HINTS.some((p) => p.test(combinedText))) {
    resourceType = 'job_board';
  } else {
    resourceType = 'unclear';
  }

  return {
    status,
    resourceType,
    score,
    matchedCategories,
    geography: geography.length ? geography.slice(0, 3).join(', ') : null,
    specialization: specialization.length ? specialization.join(', ') : null,
    evidenceQuote,
    employerContact: emailMatch ? emailMatch[0] : null,
    detectedAtsBoard,
  };
}
