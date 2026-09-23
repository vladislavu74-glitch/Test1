// ИИ-агент поиска и верификации РЕСУРСОВ НАЙМА (не вакансий) — см. требование
// пользователя, воспроизведённое в комментариях ниже по разделам. Использует
// Claude со встроенными server-side инструментами web_search (найти кандидатов)
// и web_fetch (открыть и правда прочитать саму страницу, а не только сниппет
// поисковой выдачи — раздел 3 требует именно это перед подтверждением ресурса).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { createAnthropicClient } from './anthropicClient';
import {
  CATEGORY_LABELS,
  type HiringResourceCandidate,
  type HiringResourceRunParams,
  type HiringResourceSearchResult,
} from './hiringResourceTypes';

const MODEL = 'claude-sonnet-5';
const MAX_SEARCHES = 40;
const MAX_FETCHES = 40;
// Каждая продолжающаяся (pause_turn) итерация — отдельный запрос к API;
// ограничиваем, чтобы аномально долгий агентный прогон не тянул счёт бесконечно.
const MAX_LOOP_ITERATIONS = 20;

const REPORT_TOOL_NAME = 'report_hiring_resources';

const reportTool: Anthropic.Tool = {
  name: REPORT_TOOL_NAME,
  description:
    'Сообщить итоговый список найденных и проверенных ресурсов найма. Вызови этот инструмент ровно один раз, когда закончишь поиск — при достижении нужного числа подтверждённых ресурсов, бюджета запросов или когда источники по заданным критериям исчерпаны.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      resources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Название ресурса или организации' },
            url: { type: 'string', description: 'Основной адрес сайта, канала или страницы' },
            category: {
              type: 'string',
              enum: ['recruiting_agency', 'hr_agency', 'direct_employer', 'telegram', 'community', 'social', 'job_board'],
            },
            roles: {
              type: 'array',
              items: { type: 'string', enum: ['hires_own', 'sources_for_clients', 'distributes_vacancies'] },
              description: 'Одна или несколько ролей ресурса в найме',
            },
            organizationName: {
              type: ['string', 'null'],
              description: 'Владелец ресурса, если установлен — используется для группировки дублей одной организации',
            },
            hiringGeography: {
              type: ['string', 'null'],
              description: 'Где ищут сотрудников (НЕ местонахождение агентства). "Не найдено", если не удалось установить',
            },
            agencyLocation: { type: ['string', 'null'], description: 'Местонахождение самой организации/агентства, если применимо' },
            specialization: { type: ['string', 'null'], description: 'Отрасли/профессии' },
            evidenceSummary: { type: 'string', description: 'Краткое описание обнаруженного признака найма/подбора/публикации вакансий' },
            evidenceUrl: { type: 'string', description: 'Прямая ссылка на страницу услуги, вакансии или конкретную публикацию — не на выдачу поиска' },
            lastRelevantDate: {
              type: ['string', 'null'],
              description: 'ISO-дата (YYYY-MM-DD) вакансии/публикации, если реально найдена на странице. Иначе null — не придумывать.',
            },
            contactMethod: { type: ['string', 'null'], description: 'Форма отклика, размещения вакансии или заказа подбора' },
            publicContact: { type: ['string', 'null'], description: 'Только явно опубликованный на странице контакт по вопросу найма' },
            status: {
              type: 'string',
              enum: ['confirmed', 'needs_review', 'excluded'],
              description: 'confirmed — все обязательные условия отбора выполнены; needs_review — страницу не удалось полностью проверить; excluded — не подходит',
            },
            exclusionReason: { type: ['string', 'null'], description: 'Обязательно при status="excluded" — короткая причина' },
            relatedResources: {
              type: 'array',
              items: { type: 'string' },
              description: 'URL других найденных ресурсов (сайт/соцсети/канал) той же организации',
            },
            uncertainties: { type: ['string', 'null'], description: 'Что не удалось установить по этому ресурсу' },
          },
          required: [
            'name', 'url', 'category', 'roles', 'organizationName', 'hiringGeography', 'agencyLocation',
            'specialization', 'evidenceSummary', 'evidenceUrl', 'lastRelevantDate', 'contactMethod',
            'publicContact', 'status', 'exclusionReason', 'relatedResources', 'uncertainties',
          ],
          additionalProperties: false,
        },
      },
      limitations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Категории или условия из задания, которые не удалось покрыть в рамках бюджета запросов — не заполнять список нерелевантными результатами вместо этого',
      },
    },
    required: ['resources', 'limitations'],
    additionalProperties: false,
  },
};

function buildSystemPrompt(): string {
  return [
    'Ты — агент поиска и проверки РЕСУРСОВ НАЙМА. Единица результата — ресурс (сайт, карьерный раздел, канал, группа, сообщество, публичная профессиональная страница), а не отдельная вакансия. Вакансии используй только как доказательство деятельности ресурса.',
    '',
    'Ресурс подходит, если он: (а) подбирает сотрудников для других организаций; (б) нанимает сотрудников в собственную компанию; (в) публикует вакансии и даёт площадку для взаимодействия работодателей с кандидатами.',
    '',
    '## Обязательные условия отбора (раздел 3)',
    '- Ты должен через web_search НАЙТИ страницу, а затем через web_fetch реально ОТКРЫТЬ и прочитать её — description/сниппет из выдачи поиска НЕ считается проверкой.',
    '- Нужно прямое доказательство подбора персонала или публикации вакансий на самой странице.',
    '- Ресурс должен соответствовать заданной географии и специализации, либо они явно обозначены в задании как неизвестные/любые.',
    '- Определи категорию и роль(и) ресурса.',
    '- Сохрани ссылку на доказательство (evidenceUrl — прямая страница, не поисковая выдача), краткое обоснование (evidenceSummary) и статус.',
    '- Если страницу невозможно открыть/проверить — ставь status="needs_review", а не отбрасывай ресурс молча.',
    '',
    '## Категории и признаки включения (раздел 2)',
    '- recruiting_agency — явное предложение подбора персонала для работодателей (описание услуги, процесса, проектов).',
    '- hr_agency — подтверждённая услуга поиска сотрудников; только кадровый документооборот/обучение/HR-консалтинг не подходит.',
    '- direct_employer — карьерный раздел или публикация с конкретной вакансией и способом отклика.',
    '- telegram — канал/группа с регулярными публикациями вакансий или предложений подбора.',
    '- community — профессиональное сообщество с разделом вакансий либо повторяющимися публикациями о найме.',
    '- social — публичная страница компании/рекрутера/сообщества с подтверждённой деятельностью по подбору.',
    '- job_board — работный сайт/агрегатор; включай ТОЛЬКО если он явно разрешён в списке запрошенных категорий.',
    '',
    '## Проверка актуальности (раздел 4)',
    '- Агентства: действующая страница услуг подтверждает профиль деятельности, но сама по себе не доказывает наличие текущих заказов.',
    '- Работодатели: проверяй конкретные вакансии, доступность отклика, отсутствие пометки "закрыто". Общий призыв "присылайте резюме" — это кадровый резерв, отметь это в uncertainties.',
    '- Каналы/сообщества: по умолчанию нужно не менее 3 релевантных публикаций за заданное окно актуальности (для узких профессий порог можно снизить — отметь это в uncertainties).',
    '- Соцстраницы рекрутеров: нужно подтверждение услуг подбора или текущих запросов на кандидатов; должность "HR" в описании профиля недостаточна.',
    '- lastRelevantDate — дата вакансии/публикации, НЕ дата твоей проверки. Если реальной даты нет — верни null, никогда не выдумывай дату.',
    '',
    '## Критерии исключения (раздел 6) — используй status="excluded" с exclusionReason',
    '- Сайты только с резюме/объявлениями "ищу работу".',
    '- Статьи/новости о рынке труда без собственной деятельности по найму.',
    '- HR-обучение, кадровый учёт, карьерные консультации без услуги подбора.',
    '- Сообщества без подтверждённых публикаций о найме.',
    '- Страницы только с закрытыми вакансиями.',
    '- Ресурсы, относящиеся к делу только по названию/фрагменту выдачи/предположению — без реальной проверки страницы.',
    '',
    '## Стратегия поиска (раздел 5)',
    'Формулируй запросы как сочетания: тип ресурса + действие по найму + профессия/отрасль + география. Используй синонимы: "подбор сотрудников", "кадровое агентство", "поиск специалистов", "присоединяйтесь к команде", careers, hiring, recruitment, staffing. Примеры: "подбор персонала" "логистика" "Казань"; "рекрутинговое агентство" "инженеры"; site:t.me "ищем" "разработчик"; site:vk.com "вакансии" "строительство".',
    'НЕ предлагай общие агрегаторы вакансий (hh.ru, LinkedIn, Indeed, SuperJob и т.п.), если они не входят в разрешённые категории задания.',
    '',
    '## Приоритизация (раздел 9) — не выставляй числовой балл сам, это делает код после тебя',
    '',
    'Не придумывай контакты, специализацию, географию, даты — используй null/"Не найдено", когда не удалось установить.',
    `Когда закончишь (достигнут targetCount подтверждённых ресурсов, либо бюджет запросов исчерпан, либо источники исчерпаны) — вызови ${REPORT_TOOL_NAME} РОВНО ОДИН РАЗ со всем итоговым списком (включая needs_review и excluded, которые ты явно проверял) и списком limitations — что не удалось покрыть.`,
  ].join('\n');
}

function buildUserPrompt(params: HiringResourceRunParams, assumptions: string[]): string {
  const lines: string[] = [];

  const geoParts: string[] = [];
  if (params.geography.countries.length) geoParts.push(`страны: ${params.geography.countries.join(', ')}`);
  if (params.geography.cities.length) geoParts.push(`города: ${params.geography.cities.join(', ')}`);
  if (params.geography.remote) geoParts.push('включая удалённую работу без привязки к городу');
  lines.push(`География найма: ${geoParts.length ? geoParts.join('; ') : 'не ограничена — допущение: искать по всем странам/регионам'}.`);

  lines.push(`Специализация: ${params.specialization.length ? params.specialization.join(', ') : 'любые (не ограничено)'}.`);

  lines.push(`Категории ресурсов: ${params.categories.map((c) => CATEGORY_LABELS[c]).join(', ')}.`);

  lines.push(`Языки поиска и публикаций: ${params.languages.length ? params.languages.join(', ') : 'без ограничения по языку'}.`);

  lines.push(`Окно актуальности: публикации/вакансии за последние ${params.recencyDays} дней.`);

  lines.push(`Требуемое число подтверждённых уникальных ресурсов: ${params.targetCount}.`);
  if (params.categoryDistribution && Object.keys(params.categoryDistribution).length) {
    const dist = Object.entries(params.categoryDistribution)
      .map(([cat, n]) => `${CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}: ${n}`)
      .join(', ');
    lines.push(`Желаемое распределение по категориям: ${dist}.`);
  }

  lines.push(`Исключения: ${params.exclusions.length ? params.exclusions.join(', ') : 'стандартные из инструкции'}.`);

  if (assumptions.length) {
    lines.push('', 'Незаданные параметры и принятые по умолчанию допущения (зафиксируй их и в своём отчёте, если понадобится):', ...assumptions.map((a) => `- ${a}`));
  }

  lines.push('', 'Найди и проверь ресурсы найма по этим параметрам, как описано в инструкции.');
  return lines.join('\n');
}

export async function searchHiringResources(
  params: HiringResourceRunParams,
  assumptions: string[],
  onProgress?: (queriesUsed: number) => void | Promise<void>,
): Promise<HiringResourceSearchResult> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY не настроен — поиск ресурсов найма недоступен');
  }

  const client = createAnthropicClient();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserPrompt(params, assumptions) },
  ];

  let queriesUsed = 0;

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(),
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_FETCHES },
        reportTool,
      ],
      messages,
    });

    for (const block of response.content) {
      if (block.type === 'server_tool_use' && (block.name === 'web_search' || block.name === 'web_fetch')) {
        queriesUsed += 1;
      }
    }
    // Отчёт о прогрессе после каждой итерации агентного цикла — приложение
    // опрашивает HiringResourceRun.queriesUsed, чтобы показать статус-бар
    // во время долгого поиска (одиночный HTTP-ответ пришёл бы только в конце).
    await onProgress?.(queriesUsed);

    if (response.stop_reason === 'refusal') {
      throw new Error('Запрос отклонён моделью (refusal)');
    }

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === REPORT_TOOL_NAME,
    );
    if (toolUse) {
      const input = toolUse.input as { resources: HiringResourceCandidate[]; limitations: string[] };
      return { resources: input.resources ?? [], queriesUsed, limitations: input.limitations ?? [] };
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return { resources: [], queriesUsed, limitations: [], rawText: textBlock?.text };
  }

  throw new Error('Превышено число итераций поиска — слишком долгий агентный прогон');
}
