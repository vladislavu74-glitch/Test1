import { headHunterConnector } from '../../src/connectors/headhunter';
import type { ScanCriteria, SourceRecord } from '../../src/connectors/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function pageWithState(vacancies: unknown[]): string {
  const state = { vacancySearchResult: { vacancies } };
  // Реальная страница отдаёт этот JSON HTML-экранированным — воспроизводим
  // хотя бы кавычки, чтобы тест проверял и распаковку сущностей тоже.
  const encoded = JSON.stringify(state).replace(/"/g, '&quot;');
  return `<html><body><template style="display:none" id="HH-Lux-InitialState">${encoded}</template></body></html>`;
}

function mockHtmlResponse(html: string, ok = true, status = 200, statusText = 'OK'): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    text: async () => html,
  } as unknown as Response);
}

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

  it('normalizes vacancies parsed from the embedded page state', async () => {
    mockHtmlResponse(
      pageWithState([
        {
          vacancyId: 123,
          name: 'iOS Developer',
          company: { name: 'Acme' },
          area: { name: 'Москва' },
          compensation: { from: 200000, currencyCode: 'RUR' },
          publicationTime: { $: '2024-05-01T10:00:00+0300' },
          links: { desktop: 'https://hh.ru/vacancy/123' },
        },
      ]),
    );

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
    expect(calledUrl).toBe('https://hh.ru/search/vacancy?text=iOS+Developer&order_by=publication_time&area=113');
  });

  it('falls back to a constructed URL when links.desktop is missing', async () => {
    mockHtmlResponse(
      pageWithState([{ vacancyId: 456, name: 'iOS Developer', publicationTime: { $: '2024-05-01T10:00:00+0300' } }]),
    );

    const result = await headHunterConnector.search(source, criteria);

    expect(result[0].url).toBe('https://hh.ru/vacancy/456');
  });

  it('treats noCompensation as no salary', async () => {
    mockHtmlResponse(
      pageWithState([
        {
          vacancyId: 789,
          name: 'iOS Developer',
          compensation: { noCompensation: {} },
          publicationTime: { $: '2024-05-01T10:00:00+0300' },
        },
      ]),
    );

    const result = await headHunterConnector.search(source, criteria);

    expect(result[0].salaryText).toBeUndefined();
  });

  it('filters out vacancies whose title does not actually contain the query', async () => {
    mockHtmlResponse(
      pageWithState([
        { vacancyId: 1, name: 'iOS Developer', publicationTime: { $: '2024-05-01T10:00:00+0300' } },
        { vacancyId: 2, name: 'Android Developer', publicationTime: { $: '2024-05-01T10:00:00+0300' } },
      ]),
    );

    const result = await headHunterConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('1');
  });

  it('throws on non-ok response', async () => {
    mockHtmlResponse('', false, 500, 'Internal Server Error');

    await expect(headHunterConnector.search(source, criteria)).rejects.toThrow(/hh\.ru error/);
  });

  it('throws a clear error when the page no longer contains the expected state block', async () => {
    mockHtmlResponse('<html><body>no state here</body></html>');

    await expect(headHunterConnector.search(source, criteria)).rejects.toThrow(/HH-Lux-InitialState/);
  });
});
