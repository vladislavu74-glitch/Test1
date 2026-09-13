import type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';

// Публичная веб-версия Telegram (t.me/s/<channel>) отдаёт HTML-превью
// последних постов канала без какой-либо авторизации или API — подходит
// для каналов с вакансиями, на которые пользователь укажет вручную.
// Каналы в мессенджере MAX сюда не входят: в отличие от Telegram, у MAX
// нет публичной веб-версии канала, которую можно было бы прочитать без
// входа в аккаунт, поэтому для него аналогичный коннектор технически
// нечем реализовать без официального API.
interface TelegramChannelConfig {
  connector: 'telegram_channel';
  channelUsername: string; // без @, например "myjobschannel"
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchPreview(username: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://t.me/s/${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobMonitorBot/1.0)' },
    });
    if (!response.ok) {
      throw new Error(`Telegram-канал @${username} недоступен: ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

interface TelegramMessage {
  id: string;
  text: string;
  url: string;
  publishedAt: Date;
}

// Каждое сообщение в HTML начинается с блока, у которого атрибут
// data-post="<channel>/<id>" — используем эти границы, чтобы не собрать
// одним регулярным выражением сразу весь документ.
function parseMessages(html: string): TelegramMessage[] {
  const posts: Array<{ index: number; channel: string; id: string }> = [];
  const postRegex = /data-post="([^"/]+)\/(\d+)"/g;
  let postMatch: RegExpExecArray | null;
  while ((postMatch = postRegex.exec(html))) {
    posts.push({ index: postMatch.index, channel: postMatch[1], id: postMatch[2] });
  }

  const messages: TelegramMessage[] = [];
  for (let i = 0; i < posts.length; i++) {
    const start = posts[i].index;
    const end = i + 1 < posts.length ? posts[i + 1].index : html.length;
    const block = html.slice(start, end);

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;
    const text = textMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (!text) continue;

    const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
    const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

    messages.push({
      id: posts[i].id,
      text,
      url: `https://t.me/${posts[i].channel}/${posts[i].id}`,
      publishedAt,
    });
  }
  return messages;
}

export const telegramChannelConnector: JobSourceConnector = {
  key: 'telegram_channel',

  async search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    const cfg: TelegramChannelConfig = JSON.parse(source.config);
    const html = await fetchPreview(cfg.channelUsername);
    const needle = criteria.jobTitle.toLowerCase();

    return parseMessages(html)
      .filter((m) => m.text.toLowerCase().includes(needle))
      .map((m) => ({
        externalId: m.id,
        title: m.text.split('\n')[0].slice(0, 200),
        url: m.url,
        publishedAt: m.publishedAt,
      }));
  },

  async probe(source: SourceRecord): Promise<void> {
    const cfg: TelegramChannelConfig = JSON.parse(source.config);
    await fetchPreview(cfg.channelUsername);
  },
};
