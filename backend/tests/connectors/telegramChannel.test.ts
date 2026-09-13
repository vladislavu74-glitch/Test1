import { telegramChannelConnector } from '../../src/connectors/telegramChannel';
import type { ScanCriteria, SourceRecord } from '../../src/connectors/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

const source: SourceRecord = {
  id: 's1',
  key: 'jobs-channel',
  name: 'Jobs Channel',
  kind: 'telegram_channel',
  config: JSON.stringify({ connector: 'telegram_channel', channelUsername: 'jobschannel' }),
};

const criteria: ScanCriteria = {
  jobTitle: 'iOS Developer',
  countries: [],
  cities: [],
};

function previewHtml(): string {
  return `<html><body>
    <div class="tgme_widget_message" data-post="jobschannel/101">
      <div class="tgme_widget_message_text js-message_text">Ищем iOS Developer в команду, удалённо.</div>
      <time datetime="2024-05-01T10:00:00+00:00"></time>
    </div>
    <div class="tgme_widget_message" data-post="jobschannel/102">
      <div class="tgme_widget_message_text js-message_text">Ищем Android Developer.</div>
      <time datetime="2024-05-02T10:00:00+00:00"></time>
    </div>
  </body></html>`;
}

describe('telegramChannelConnector', () => {
  it('parses public preview messages and filters by job title', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => previewHtml() } as Response);

    const result = await telegramChannelConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('101');
    expect(result[0].url).toBe('https://t.me/jobschannel/101');
    expect(result[0].publishedAt).toEqual(new Date('2024-05-01T10:00:00+00:00'));
  });

  it('throws when the channel preview is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(telegramChannelConnector.search(source, criteria)).rejects.toThrow(/недоступен/);
  });
});
