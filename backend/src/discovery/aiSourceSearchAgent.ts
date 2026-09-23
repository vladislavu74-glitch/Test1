// ИИ-агент веб-поиска источников вакансий: в отличие от остальных
// коннекторов (которые читают/парсят конкретный уже известный адрес),
// этот модуль сам ищет, ЧТО добавить в каталог — через Claude с
// подключённым веб-поиском (server tool web_search), под текущие
// выбранные названия должностей и географию. Найденные сайты/каналы не
// сканируются напрямую: они попадают в SourceCandidate и дальше проходят
// обычную проверку (см. src/jobs/discoverSources.ts), прежде чем стать
// активным источником.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { createAnthropicClient } from './anthropicClient';

export interface AiFoundSource {
  name: string;
  type: 'site' | 'telegram';
  url: string | null;
  channelUsername: string | null;
  country: string | null;
  reason: string;
}

export interface AiSearchResult {
  sources: AiFoundSource[];
  // Заполняется, если модель закончила, ни разу не вызвав report_sources —
  // для диагностики в логе запуска (см. AiDiscoveryRun.error).
  rawText?: string;
}

// Выбрана пользователем: заметно дешевле Opus при достаточном качестве для
// классификации сайтов/каналов по текстовым признакам.
const MODEL = 'claude-sonnet-5';
const MAX_SEARCHES = 8;
// Каждая продолжающаяяся (pause_turn) итерация — это отдельный запрос к API;
// ограничиваем, чтобы аномально долгий агентный прогон не тянул счёт бесконечно.
const MAX_LOOP_ITERATIONS = 6;

const REPORT_TOOL_NAME = 'report_sources';

const reportTool: Anthropic.Tool = {
  name: REPORT_TOOL_NAME,
  description:
    'Сообщить итоговый список найденных источников вакансий. Вызови этот инструмент ровно один раз, когда закончишь поиск — даже если ничего подходящего не нашлось (тогда передай пустой список).',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Название компании/агентства/канала' },
            type: { type: 'string', enum: ['site', 'telegram'] },
            url: {
              type: ['string', 'null'],
              description: 'Обязательно при type="site" — адрес сайта. Иначе null.',
            },
            channelUsername: {
              type: ['string', 'null'],
              description: 'Обязательно при type="telegram" — имя канала без @. Иначе null.',
            },
            country: { type: ['string', 'null'], description: 'Страна ресурса, если понятна' },
            reason: {
              type: 'string',
              description: 'Одно предложение: что именно там найдено и почему это подходит под запрос',
            },
          },
          required: ['name', 'type', 'url', 'channelUsername', 'country', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['sources'],
    additionalProperties: false,
  },
};

function buildSystemPrompt(): string {
  return [
    'Ты помогаешь искать РЕАЛЬНЫЕ, действующие сейчас интернет-ресурсы, где публикуются вакансии по заданным профессиям и географии.',
    'Пользуйся инструментом web_search, чтобы находить:',
    '1) карьерные страницы/сайты конкретных компаний, которые сами публикуют вакансии по этим профессиям;',
    '2) публичные Telegram-каналы с вакансиями по этим профессиям и/или регионам;',
    '3) сайты кадровых агентств, которые закрывают такие вакансии для своих клиентов.',
    'НЕ предлагай общие агрегаторы (hh.ru, LinkedIn, Indeed, SuperJob, Habr Career и т.п.) — они уже используются отдельно, и они не нужны в этом списке.',
    'Для каждого кандидата прежде чем включать его в ответ убедись через поиск, что ресурс живой и реально связан с вакансиями (а не просто случайное упоминание в статье).',
    'Верни разумное число ресурсов (обычно 3-15) — лучше меньше, но подтверждённых, чем длинный список с сомнительными пунктами.',
    `Когда закончишь искать, вызови инструмент ${REPORT_TOOL_NAME} РОВНО ОДИН РАЗ со всем итоговым списком. Если ничего подходящего не нашлось — вызови его с пустым списком sources.`,
  ].join('\n');
}

function buildUserPrompt(jobTitles: string[], countries: string[], cities: string[]): string {
  const lines = [`Названия должностей для поиска: ${jobTitles.join(', ')}.`];
  if (countries.length > 0 || cities.length > 0) {
    const geo = [...countries, ...cities].join(', ');
    lines.push(`География (если не найдёшь точного совпадения по гео — не отбрасывай ресурс, если он в остальном подходит): ${geo}.`);
  } else {
    lines.push('География не ограничена — ищи по всем странам/регионам.');
  }
  lines.push('Найди источники вакансий под эти профессии, как описано в инструкции.');
  return lines.join('\n');
}

const CACHE_CONTROL: Anthropic.CacheControlEphemeral = { type: 'ephemeral' };

// Кэширование промпта: system/tools одинаковы на каждой итерации цикла
// pause_turn, а history только растёт — без cache_control длинный агентный
// прогон (много web_search) заново оплачивал бы системный промпт и всю
// накопленную историю на каждой продолжающейся итерации.
function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
  // thinking/redacted_thinking блоки не поддерживают cache_control — ищем
  // последний блок, который его поддерживает.
  let index = -1;
  for (let j = blocks.length - 1; j >= 0; j--) {
    if (blocks[j].type !== 'thinking' && blocks[j].type !== 'redacted_thinking') { index = j; break; }
  }
  if (index === -1) return messages;
  blocks[index] = { ...blocks[index], cache_control: CACHE_CONTROL } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

export async function searchForVacancySources(params: {
  jobTitles: string[];
  countries: string[];
  cities: string[];
}): Promise<AiSearchResult> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY не настроен — ИИ-поиск источников недоступен');
  }

  const client = createAnthropicClient();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserPrompt(params.jobTitles, params.countries, params.cities) },
  ];

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: buildSystemPrompt(), cache_control: CACHE_CONTROL }],
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES },
        { ...reportTool, cache_control: CACHE_CONTROL },
      ],
      messages: withCacheBreakpoint(messages),
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Запрос отклонён моделью (refusal)');
    }

    if (response.stop_reason === 'pause_turn') {
      // Долгий агентный прогон (много веб-поисков) — продолжаем с того же места.
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === REPORT_TOOL_NAME,
    );
    if (toolUse) {
      const input = toolUse.input as { sources: AiFoundSource[] };
      return { sources: input.sources ?? [] };
    }

    // Модель закончила (end_turn/max_tokens), ни разу не вызвав report_sources —
    // считаем результат пустым, но сохраняем текст для диагностики.
    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    return { sources: [], rawText: textBlock?.text };
  }

  throw new Error('Превышено число итераций поиска — слишком долгий агентный прогон');
}
