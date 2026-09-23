process.env.DATABASE_URL = 'file:./test-discover-hiring-resources.sqlite';
process.env.ANTHROPIC_API_KEY = 'test-key';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/db/client';
import type { HiringResourceCandidate, HiringResourceSearchOutcome } from '../../src/discovery/hiringResourceTypes';

jest.mock('../../src/discovery/hiringResourceAgent', () => ({
  searchHiringResources: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { searchHiringResources } = jest.requireMock('../../src/discovery/hiringResourceAgent') as {
  searchHiringResources: jest.Mock<
    Promise<HiringResourceSearchOutcome>,
    [unknown, unknown, (r: HiringResourceCandidate) => Promise<void>, () => Promise<boolean>]
  >;
};

import { startHiringResourceDiscovery, requestStopHiringResourceDiscovery } from '../../src/jobs/discoverHiringResources';

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

function agency(name: string, url: string): HiringResourceCandidate {
  return {
    name, url, category: 'recruiting_agency', roles: ['sources_for_clients'],
    organizationName: null, hiringGeography: 'Москва', agencyLocation: null, specialization: null,
    evidenceSummary: 'Подбор персонала для клиентов', evidenceUrl: `${url}uslugi`,
    lastRelevantDate: null, contactMethod: 'Форма заявки', publicContact: null, status: 'confirmed',
    exclusionReason: null, relatedResources: [], uncertainties: null,
  };
}

// Имитирует реальный агент: сообщает каждый ресурс через onResource по
// очереди, проверяя shouldStop() между ними — так же, как это делает
// searchHiringResources в src/discovery/hiringResourceAgent.ts.
function mockAgentReporting(resources: HiringResourceCandidate[], limitations: string[] = []) {
  searchHiringResources.mockImplementationOnce(async (_params, _assumptions, onResource, shouldStop) => {
    for (const resource of resources) {
      await onResource(resource);
      if (await shouldStop()) {
        return { queriesUsed: resources.length, foundCount: resources.length, limitations: [], stoppedByUser: true };
      }
    }
    return { queriesUsed: resources.length, foundCount: resources.length, limitations, stoppedByUser: false };
  });
}

describe('startHiringResourceDiscovery', () => {
  it('marks a resource missing from a rerun in the same category as stale, and reconfirms the other', async () => {
    mockAgentReporting([agency('Agency A', 'https://agency-a.example/'), agency('Agency B', 'https://agency-b.example/')]);

    const first = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(first.runId);

    const agencyA = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-a.example/' } });
    const agencyB = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-b.example/' } });
    expect(agencyA?.isNew).toBe(true);
    expect(agencyB?.isStale).toBe(false);

    // Второй запуск (та же категория) находит только A — B "перестал откликаться".
    mockAgentReporting([agency('Agency A', 'https://agency-a.example/')]);

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

    mockAgentReporting([]);

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

    mockAgentReporting([]);

    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(run.runId);

    const untouched = await prisma.hiringResource.findUnique({ where: { url: 'https://t.me/some_channel' } });
    expect(untouched?.isStale).toBe(false);
  });

  it('persists each resource as soon as it is reported, before the run finishes', async () => {
    let resolveSecond: () => void = () => {};
    const secondReported = new Promise<void>((resolve) => { resolveSecond = resolve; });

    searchHiringResources.mockImplementationOnce(async (_params, _assumptions, onResource) => {
      await onResource(agency('Agency A', 'https://agency-a.example/'));
      // В этот момент первый ресурс уже должен быть виден в БД, хотя сам
      // "поиск" ещё не завершён — это и есть промежуточный результат.
      const midRun = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-a.example/' } });
      expect(midRun).not.toBeNull();
      resolveSecond();
      await onResource(agency('Agency B', 'https://agency-b.example/'));
      return { queriesUsed: 2, foundCount: 2, limitations: [], stoppedByUser: false };
    });

    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await secondReported;
    await waitForRunDone(run.runId);
  });

  it('stops after the current resource once a stop is requested, keeping what was already found', async () => {
    let requestedStop = false;

    searchHiringResources.mockImplementationOnce(async (_params, _assumptions, onResource, shouldStop) => {
      await onResource(agency('Agency A', 'https://agency-a.example/'));
      requestedStop = await requestStopHiringResourceDiscovery((await prisma.hiringResourceRun.findFirstOrThrow()).id);
      if (await shouldStop()) {
        return { queriesUsed: 1, foundCount: 1, limitations: [], stoppedByUser: true };
      }
      await onResource(agency('Agency B', 'https://agency-b.example/'));
      return { queriesUsed: 2, foundCount: 2, limitations: [], stoppedByUser: false };
    });

    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(run.runId);

    expect(requestedStop).toBe(true);
    const finished = await prisma.hiringResourceRun.findUniqueOrThrow({ where: { id: run.runId } });
    expect(finished.status).toBe('stopped');

    const agencyA = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-a.example/' } });
    const agencyB = await prisma.hiringResource.findUnique({ where: { url: 'https://agency-b.example/' } });
    expect(agencyA).not.toBeNull();
    expect(agencyB).toBeNull();
  });

  it('rejects a stop request for a run that is not running', async () => {
    mockAgentReporting([]);
    const run = await startHiringResourceDiscovery({ categories: ['recruiting_agency'] });
    await waitForRunDone(run.runId);

    const stopped = await requestStopHiringResourceDiscovery(run.runId);
    expect(stopped).toBe(false);
  });
});
