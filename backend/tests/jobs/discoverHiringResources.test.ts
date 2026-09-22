process.env.DATABASE_URL = 'file:./test-discover-hiring-resources.sqlite';
process.env.ANTHROPIC_API_KEY = 'test-key';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import type { HiringResourceSearchResult } from '../../src/discovery/hiringResourceTypes';

jest.mock('../../src/discovery/hiringResourceAgent', () => ({
  searchHiringResources: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { searchHiringResources } = jest.requireMock('../../src/discovery/hiringResourceAgent') as {
  searchHiringResources: jest.Mock<Promise<HiringResourceSearchResult>, unknown[]>;
};

import { startHiringResourceDiscovery } from '../../src/jobs/discoverHiringResources';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-discover-hiring-resources.sqlite');

beforeAll(() => {
  execSync('npx prisma migrate deploy', { cwd: backendRoot, env: process.env, stdio: 'ignore' });
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDbPath, { force: true });
});

beforeEach(async () => {
  await prisma.hiringResource.deleteMany();
  await prisma.hiringResourceRun.deleteMany();
  await prisma.organization.deleteMany();
  searchHiringResources.mockReset();
});

async function waitForRunDone(runId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const run = await prisma.hiringResourceRun.findUnique({ where: { id: runId } });
    if (run?.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Run did not finish in time');
}

describe('startHiringResourceDiscovery', () => {
  it('marks a resource missing from a rerun in the same category as stale, and reconfirms the other', async () => {
    // Первый запуск находит два ресурса.
    searchHiringResources.mockResolvedValueOnce({
      resources: [
        {
          name: 'Agency A', url: 'https://agency-a.example/', category: 'recruiting_agency', roles: ['sources_for_clients'],
          organizationName: null, hiringGeography: 'Москва', agencyLocation: null, specialization: null,
          evidenceSummary: 'Подбор персонала для клиентов', evidenceUrl: 'https://agency-a.example/uslugi',
          lastRelevantDate: null, contactMethod: 'Форма заявки', publicContact: null, status: 'confirmed',
          exclusionReason: null, relatedResources: [], uncertainties: null,
        },
        {
          name: 'Agency B', url: 'https://agency-b.example/', category: 'recruiting_agency', roles: ['sources_for_clients'],
          organizationName: null, hiringGeography: 'Москва', agencyLocation: null, specialization: null,
          evidenceSummary: 'Подбор персонала для клиентов', evidenceUrl: 'https://agency-b.example/uslugi',
          lastRelevantDate: null, contactMethod: 'Форма заявки', publicContact: null, status: 'confirmed',
          exclusionReason: null, relatedResources: [], uncertainties: null,
        },
      ],
      queriesUsed: 3,
      limitations: [],
    });

    const first = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(first.runId);

    const agencyA = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-a.example/' } });
    const agencyB = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-b.example/' } });
    expect(agencyA?.isNew).toBe(true);
    expect(agencyB?.isStale).toBe(false);

    // Второй запуск (та же категория) находит только A — B "перестал откликаться".
    searchHiringResources.mockResolvedValueOnce({
      resources: [
        {
          name: 'Agency A', url: 'https://agency-a.example/', category: 'recruiting_agency', roles: ['sources_for_clients'],
          organizationName: null, hiringGeography: 'Москва', agencyLocation: null, specialization: null,
          evidenceSummary: 'Подбор персонала для клиентов', evidenceUrl: 'https://agency-a.example/uslugi',
          lastRelevantDate: null, contactMethod: 'Форма заявки', publicContact: null, status: 'confirmed',
          exclusionReason: null, relatedResources: [], uncertainties: null,
        },
      ],
      queriesUsed: 2,
      limitations: [],
    });

    const second = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(second.runId);

    const agencyAAfter = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-a.example/' } });
    const agencyBAfter = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-b.example/' } });
    expect(agencyAAfter?.isStale).toBe(false);
    // Реконфирмация не сбрасывает isNew обратно в true, если он уже был снят,
    // но здесь он ещё не был отмечен просмотренным — так что isNew остаётся true.
    expect(agencyAAfter?.isNew).toBe(true);
    expect(agencyBAfter?.isStale).toBe(true);
  });

  it('does not mark excluded resources as stale even if not reconfirmed', async () => {
    await prisma.hiringResource.create({
      data: {
        name: 'Not a real agency', url: 'https://notreal.example/', category: 'recruiting_agency', status: 'excluded',
        exclusionReason: 'Только объявления "ищу работу"', evidenceSummary: 'x', evidenceUrl: 'https://notreal.example/',
      },
    });

    searchHiringResources.mockResolvedValueOnce({ resources: [], queriesUsed: 1, limitations: [] });

    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(run.runId);

    const stillExcluded = await prisma.hiringResource.findUnique({ where: { url: 'https://notreal.example/' } });
    expect(stillExcluded?.isStale).toBe(false);
    expect(stillExcluded?.status).toBe('excluded');
  });

  it('does not touch resources from categories outside this run scope', async () => {
    await prisma.hiringResource.create({
      data: {
        name: 'Some Telegram channel', url: 'https://t.me/some_channel', category: 'telegram', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://t.me/some_channel/1',
      },
    });

    searchHiringResources.mockResolvedValueOnce({ resources: [], queriesUsed: 1, limitations: [] });

    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(run.runId);

    const untouched = await prisma.hiringResource.findUnique({ where: { url: 'https://t.me/some_channel' } });
    expect(untouched?.isStale).toBe(false);
  });
});
