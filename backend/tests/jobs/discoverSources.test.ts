process.env.DATABASE_URL = 'file:./test-discover.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';
process.env.RESEND_API_KEY = 'test-resend-key';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { runDiscovery } from '../../src/jobs/discoverSources';
import { prisma } from '../../src/db/client';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-discover.sqlite');

beforeAll(() => {
  execSync('npx prisma migrate deploy', { cwd: backendRoot, env: process.env, stdio: 'ignore' });
});

const originalFetch = global.fetch;

afterAll(async () => {
  global.fetch = originalFetch;
  await prisma.$disconnect();
  fs.rmSync(testDbPath, { force: true });
});

beforeEach(async () => {
  await prisma.sourceCandidate.deleteMany();
  await prisma.source.deleteMany();
  await prisma.discoveryRun.deleteMany();
});

function mockPages(pages: Record<string, string>) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    const parsed = new URL(url);
    const key = `${parsed.host}${parsed.pathname}`;
    for (const [pattern, html] of Object.entries(pages)) {
      if (key.includes(pattern)) {
        return { ok: true, status: 200, json: async () => JSON.parse(html || '{}'), text: async () => html } as Response;
      }
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) } as Response;
  });
}

describe('runDiscovery — recruiting agency candidates', () => {
  it('promotes a verified agency candidate as a disabled Source (no generic connector to scan it)', async () => {
    await prisma.sourceCandidate.create({
      data: {
        key: 'agency:https://profi-podbor.example',
        name: 'Профи-Подбор',
        kind: 'recruiting_agency',
        config: JSON.stringify({ url: 'https://profi-podbor.example' }),
      },
    });

    mockPages({
      'profi-podbor.example/': `<html><body>
        <h1>Кадровое агентство</h1>
        <p>Подбор персонала для вашей компании.</p>
        <a href="/rabotodatelyam">Оставить заявку на подбор</a>
        <p>Гарантия замены сотрудника, стоимость подбора по договору.</p>
      </body></html>`,
    });

    const result = await runDiscovery('manual');

    expect(result.promoted).toBe(1);
    const candidate = await prisma.sourceCandidate.findFirstOrThrow();
    expect(candidate.verificationStatus).toBe('verified');
    expect(candidate.promotedSourceId).not.toBeNull();

    const source = await prisma.source.findUniqueOrThrow({ where: { id: candidate.promotedSourceId! } });
    expect(source.enabled).toBe(false);
  });

  it('leaves a needs_review candidate unpromoted but records the classification', async () => {
    await prisma.sourceCandidate.create({
      data: {
        key: 'agency:https://romashka.example',
        name: 'Ромашка',
        kind: 'recruiting_agency',
        config: JSON.stringify({ url: 'https://romashka.example' }),
      },
    });

    mockPages({
      'romashka.example/': `<html><body>
        <h1>Рекрутинговое агентство «Ромашка»</h1>
        <p>Работаем на рынке подбора персонала.</p>
      </body></html>`,
    });

    const result = await runDiscovery('manual');

    expect(result.promoted).toBe(0);
    const candidate = await prisma.sourceCandidate.findFirstOrThrow();
    expect(candidate.verificationStatus).toBe('needs_review');
    expect(candidate.promotedSourceId).toBeNull();
  });

  it('auto-promotes an employer vacancy repository detected via a Greenhouse link, enabled for scanning', async () => {
    await prisma.sourceCandidate.create({
      data: {
        key: 'agency:https://acme.example',
        name: 'Acme Careers',
        kind: 'recruiting_agency',
        config: JSON.stringify({ url: 'https://acme.example' }),
      },
    });

    mockPages({
      'acme.example/': `<html><body>
        <h1>Careers at Acme</h1>
        <a href="https://boards.greenhouse.io/acme">Open roles</a>
      </body></html>`,
      'boards-api.greenhouse.io/v1/boards/acme/jobs': JSON.stringify({ jobs: [] }),
    });

    const result = await runDiscovery('manual');

    expect(result.promoted).toBe(1);
    const candidate = await prisma.sourceCandidate.findFirstOrThrow();
    expect(candidate.resourceType).toBe('employer_repository');
    expect(candidate.promotedSourceId).not.toBeNull();

    const source = await prisma.source.findUniqueOrThrow({ where: { id: candidate.promotedSourceId! } });
    expect(source.enabled).toBe(true);
    expect(JSON.parse(source.config)).toEqual({ connector: 'ats_board', provider: 'greenhouse', boardSlug: 'acme' });
  });
});
