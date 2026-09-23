import { atsBoardConnector } from '../../src/connectors/atsBoard';
import type { SourceRecord, ScanCriteria } from '../../src/connectors/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => body,
  } as Response;
}

describe('atsBoardConnector', () => {
  const criteria: ScanCriteria = {
    jobTitle: 'Backend',
    countries: [],
    cities: [],
  };

  it('fetches and filters Greenhouse jobs by title', async () => {
    const source: SourceRecord = {
      id: 's1',
      key: 'acme_greenhouse',
      name: 'Acme (Greenhouse)',
      kind: 'ats',
      config: JSON.stringify({ connector: 'ats_board', provider: 'greenhouse', boardSlug: 'acme' }),
    };

    global.fetch = jest.fn().mockResolvedValue(
      mockJsonResponse({
        jobs: [
          { id: 1, title: 'Senior Backend Engineer', absolute_url: 'https://x/1', updated_at: '2024-01-02T00:00:00Z' },
          { id: 2, title: 'Frontend Engineer', absolute_url: 'https://x/2', updated_at: '2024-01-01T00:00:00Z' },
        ],
      }),
    );

    const result = await atsBoardConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('1');
    expect(result[0].url).toBe('https://x/1');
  });

  it('fetches and filters Lever postings by title', async () => {
    const source: SourceRecord = {
      id: 's2',
      key: 'acme_lever',
      name: 'Acme (Lever)',
      kind: 'ats',
      config: JSON.stringify({ connector: 'ats_board', provider: 'lever', boardSlug: 'acme' }),
    };

    global.fetch = jest.fn().mockResolvedValue(
      mockJsonResponse([
        { id: 'a', text: 'Backend Developer', hostedUrl: 'https://y/a', createdAt: 1704153600000 },
        { id: 'b', text: 'Designer', hostedUrl: 'https://y/b', createdAt: 1704067200000 },
      ]),
    );

    const result = await atsBoardConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('a');
  });

  it('throws when the board request fails', async () => {
    const source: SourceRecord = {
      id: 's3',
      key: 'acme_greenhouse',
      name: 'Acme (Greenhouse)',
      kind: 'ats',
      config: JSON.stringify({ connector: 'ats_board', provider: 'greenhouse', boardSlug: 'acme' }),
    };

    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse({}, false));

    await expect(atsBoardConnector.search(source, criteria)).rejects.toThrow(/error: 500/);
  });
});
