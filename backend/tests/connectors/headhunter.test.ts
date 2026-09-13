import { headHunterConnector } from '../../src/connectors/headhunter';
import type { ScanCriteria, SourceRecord } from '../../src/connectors/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('headHunterConnector', () => {
  const source: SourceRecord = {
    id: 's1',
    key: 'hh_ru',
    name: 'hh.ru — Россия',
    kind: 'api',
    config: JSON.stringify({ connector: 'headhunter', areaId: 113 }),
  };

  const criteria: ScanCriteria = {
    jobTitle: 'iOS Developer',
    countries: [],
    cities: [],
  };

  it('normalizes vacancies with real URLs and dates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        items: [
          {
            id: '123',
            name: 'iOS Developer',
            alternate_url: 'https://hh.ru/vacancy/123',
            published_at: '2024-05-01T10:00:00+0300',
            employer: { name: 'Acme' },
            area: { name: 'Москва' },
            salary: { from: 200000, to: null, currency: 'RUR' },
          },
        ],
      }),
    } as Response);

    const result = await headHunterConnector.search(source, criteria);

    expect(result).toEqual([
      {
        externalId: '123',
        title: 'iOS Developer',
        company: 'Acme',
        url: 'https://hh.ru/vacancy/123',
        location: 'Москва',
        salaryText: 'от 200000 RUR',
        publishedAt: new Date('2024-05-01T10:00:00+0300'),
      },
    ]);

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('text=iOS+Developer');
    expect(calledUrl).toContain('area=113');
  });

  it('filters out vacancies whose title does not actually contain the query (hh.ru search is fuzzy)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        items: [
          {
            id: '1',
            name: 'iOS Developer',
            alternate_url: 'https://hh.ru/vacancy/1',
            published_at: '2024-05-01T10:00:00+0300',
          },
          {
            id: '2',
            name: 'Android Developer',
            alternate_url: 'https://hh.ru/vacancy/2',
            published_at: '2024-05-01T10:00:00+0300',
          },
        ],
      }),
    } as Response);

    const result = await headHunterConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('1');

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('search_field=name');
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(headHunterConnector.search(source, criteria)).rejects.toThrow(/hh.ru API error/);
  });
});
