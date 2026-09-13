import { classifyAgencySite } from '../../src/discovery/agencyClassifier';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockHtmlFetch(pages: Record<string, string>) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname;
    const html = pages[path];
    if (html === undefined) {
      return { ok: false, status: 404, text: async () => '' } as Response;
    }
    return { ok: true, status: 200, text: async () => html } as Response;
  });
}

describe('classifyAgencySite', () => {
  it('marks a real recruiting agency as verified (positioning + service + confirmation)', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Кадровое агентство «Профи-Подбор»</h1>
        <p>Мы предлагаем подбор персонала для вашей компании в Москве и Казани.</p>
        <a href="/rabotodatelyam">Работодателям: оставить заявку на подбор</a>
      </body></html>`,
      '/rabotodatelyam': `<html><body>
        <p>Стоимость подбора и гарантия замены сотрудника в течение 3 месяцев.</p>
        <p>Наши кейсы закрытых вакансий: 200+ клиентов.</p>
        <a href="mailto:hr@profi-podbor.ru">hr@profi-podbor.ru</a>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://profi-podbor.example');

    expect(result.status).toBe('verified');
    expect(result.matchedCategories).toEqual(
      expect.arrayContaining(['direct_positioning', 'employer_services', 'request_form', 'terms', 'track_record']),
    );
    expect(result.geography).toContain('Москва');
    expect(result.employerContact).toBe('hr@profi-podbor.ru');
    expect(result.evidenceQuote).not.toBeNull();
  });

  it('rejects a direct employer careers page with only a vacancy list', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Вакансии компании Acme</h1>
        <p>Мы ищем Backend-разработчика и дизайнера в нашу команду.</p>
        <ul><li>Backend Developer</li><li>Designer</li></ul>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://acme.example');

    expect(result.status).toBe('rejected');
    expect(result.matchedCategories).toHaveLength(0);
  });

  it('flags a self-declared agency with no confirmation as needs_review', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Рекрутинговое агентство «Ромашка»</h1>
        <p>О компании: мы работаем на рынке подбора персонала.</p>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://romashka.example');

    expect(result.status).toBe('needs_review');
  });

  it('throws when every page fails to load', async () => {
    mockHtmlFetch({});

    await expect(classifyAgencySite('https://dead-site.example')).rejects.toThrow();
  });

  it('classifies a plain job board / vacancy aggregator as job_board', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Тысячи вакансий от разных работодателей</h1>
        <p>Крупнейшая база вакансий и доска объявлений. Работодатель может разместить вакансию бесплатно.</p>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://job-board.example');

    expect(result.resourceType).toBe('job_board');
    expect(result.status).toBe('rejected');
  });

  it('detects an employer vacancy repository via a Greenhouse board link', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Careers at Acme</h1>
        <a href="https://boards.greenhouse.io/acme">See open roles</a>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://acme.example');

    expect(result.resourceType).toBe('employer_repository');
    expect(result.detectedAtsBoard).toEqual({ provider: 'greenhouse', boardSlug: 'acme' });
  });

  it('detects an employer vacancy repository via a Lever board link', async () => {
    mockHtmlFetch({
      '/': `<html><body>
        <h1>Careers at Acme</h1>
        <a href="https://jobs.lever.co/acme">See open roles</a>
      </body></html>`,
    });

    const result = await classifyAgencySite('https://acme.example');

    expect(result.resourceType).toBe('employer_repository');
    expect(result.detectedAtsBoard).toEqual({ provider: 'lever', boardSlug: 'acme' });
  });
});
