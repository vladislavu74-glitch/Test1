import { genericSiteConnector } from '../../src/connectors/genericSite';
import type { ScanCriteria, SourceRecord } from '../../src/connectors/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

const source: SourceRecord = {
  id: 's1',
  key: 'acme-site',
  name: 'Acme',
  kind: 'generic_site',
  config: JSON.stringify({ connector: 'generic_site', url: 'https://acme.example' }),
};

const criteria: ScanCriteria = {
  jobTitle: 'iOS Developer',
  countries: [],
  cities: [],
};

function mockPages(pages: Record<string, string>) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const html = pages[path];
    if (html === undefined) return { ok: false, status: 404, text: async () => '' } as Response;
    return { ok: true, status: 200, text: async () => html } as Response;
  });
}

describe('genericSiteConnector', () => {
  it('extracts vacancies from schema.org JobPosting JSON-LD', async () => {
    mockPages({
      '/': `<html><head>
        <script type="application/ld+json">
        {"@type": "JobPosting", "title": "iOS Developer", "url": "https://acme.example/jobs/1", "hiringOrganization": {"name": "Acme"}, "datePosted": "2024-05-01"}
        </script>
      </head><body>Careers</body></html>`,
    });

    const result = await genericSiteConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: 'iOS Developer', company: 'Acme', url: 'https://acme.example/jobs/1' });
  });

  it('falls back to heuristic link matching when there is no structured data', async () => {
    mockPages({
      '/': `<html><body>
        <a href="/jobs/1">iOS Developer</a>
        <a href="/jobs/2">Android Developer</a>
      </body></html>`,
    });

    const result = await genericSiteConnector.search(source, criteria);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://acme.example/jobs/1');
  });

  it('throws when no page is reachable', async () => {
    mockPages({});
    await expect(genericSiteConnector.search(source, criteria)).rejects.toThrow(/недоступен/);
  });

});
