// Отдельная тестовая SQLite-база должна быть настроена ДО того, как
// что-либо в проекте импортирует src/db/client (ts-jest не хоистит
// jest.mock/присваивания так, как это делает babel-jest, поэтому порядок
// операторов в файле важен).
process.env.DATABASE_URL = 'file:./test-scan.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';
process.env.RESEND_API_KEY = 'test-resend-key';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { runScan, startScan } from '../../src/jobs/scan';
import { prisma } from '../../src/db/client';
import { genericSiteConnector } from '../../src/connectors/genericSite';
import type { RawVacancy } from '../../src/connectors/types';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-scan.sqlite');

let fakeVacancies: RawVacancy[] = [];
let searchSpy: jest.SpyInstance;

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
  fakeVacancies = [];
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);
  await prisma.notificationLog.deleteMany();
  await prisma.vacancyState.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.scanRun.deleteMany();
  await prisma.jobTitle.deleteMany();
  await prisma.hiringResource.deleteMany();
  await prisma.searchCriteria.deleteMany();

  // Любой confirmed HiringResource без category="telegram" сканируется через
  // genericSiteConnector (см. toSourceRecord в src/jobs/scan.ts) — подменяем
  // его search(), а не регистрируем отдельный фейковый коннектор, так как
  // выбор коннектора теперь целиком определяется категорией, а не хранимым конфигом.
  searchSpy = jest.spyOn(genericSiteConnector, 'search').mockImplementation(async () => fakeVacancies);

  await prisma.hiringResource.create({
    data: {
      name: 'Fake Resource',
      url: 'https://fake-resource.example/',
      category: 'direct_employer',
      status: 'confirmed',
      evidenceSummary: 'x',
      evidenceUrl: 'https://fake-resource.example/careers',
    },
  });
  await prisma.jobTitle.create({ data: { title: 'iOS Developer', selected: true } });
});

afterEach(() => {
  searchSpy.mockRestore();
});

describe('runScan', () => {
  it('inserts new vacancies and records the count on a manual run without emailing', async () => {
    fakeVacancies = [
      {
        externalId: 'v1',
        title: 'iOS Developer',
        url: 'https://example.com/v1',
        publishedAt: new Date('2024-01-01'),
      },
    ];

    const result = await runScan('manual');

    expect(result.newVacancyCount).toBe(1);
    expect(result.emailSent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();

    const vacancy = await prisma.vacancy.findFirst({ include: { state: true } });
    expect(vacancy?.state?.hidden).toBe(false);
  });

  it('does not scan resources outside the scannable categories (e.g. recruiting agencies)', async () => {
    await prisma.hiringResource.create({
      data: {
        name: 'Some Agency', url: 'https://agency.example/', category: 'recruiting_agency', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://agency.example/uslugi',
      },
    });
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];

    await runScan('manual');

    // genericSiteConnector.search должен был вызваться только для
    // "Fake Resource" (direct_employer), не для агентства.
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate vacancies already seen on a later scan', async () => {
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];
    await runScan('manual');

    const secondRun = await runScan('manual');

    expect(secondRun.newVacancyCount).toBe(0);
    const count = await prisma.vacancy.count();
    expect(count).toBe(1);
  });

  it('emails a digest for new, non-hidden vacancies only on the cron trigger', async () => {
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];

    const result = await runScan('cron');

    expect(result.emailSent).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );

    const notified = await prisma.notificationLog.findMany();
    expect(notified).toHaveLength(1);
  });

  it('does not re-email vacancies already notified about', async () => {
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];
    await runScan('cron');
    (global.fetch as jest.Mock).mockClear();

    const secondRun = await runScan('cron');

    expect(secondRun.emailSent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps a hidden vacancy hidden across scans and excludes it from notification', async () => {
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];
    await runScan('manual');
    const vacancy = await prisma.vacancy.findFirstOrThrow();
    await prisma.vacancyState.update({ where: { vacancyId: vacancy.id }, data: { hidden: true } });

    // Тот же источник снова возвращает ту же вакансию — она не новая, но
    // проверим, что состояние "скрыта" сохраняется независимо от скана.
    const result = await runScan('cron');

    expect(result.newVacancyCount).toBe(0);
    const state = await prisma.vacancyState.findUnique({ where: { vacancyId: vacancy.id } });
    expect(state?.hidden).toBe(true);
  });

  it('filters out vacancies whose location does not match the configured countries/cities', async () => {
    await prisma.searchCriteria.create({
      data: { id: 'singleton', cities: JSON.stringify(['Алматы']) },
    });
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', location: 'Москва', publishedAt: new Date('2024-01-01') },
      { externalId: 'v2', title: 'iOS Developer', url: 'https://example.com/v2', location: 'Алматы', publishedAt: new Date('2024-01-02') },
    ];

    const result = await runScan('manual');

    expect(result.newVacancyCount).toBe(1);
    const vacancy = await prisma.vacancy.findFirstOrThrow();
    expect(vacancy.location).toBe('Алматы');
  });

  it('keeps vacancies whose location is not stated at all, even with a geography filter set', async () => {
    await prisma.searchCriteria.create({
      data: { id: 'singleton', cities: JSON.stringify(['Алматы']) },
    });
    fakeVacancies = [
      // Многие источники (Telegram-каналы и т.п.) вообще не отдают location —
      // такие вакансии не должны отбрасываться фильтром по географии, иначе
      // он тихо обнулял бы результаты именно там, где сам неприменим.
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];

    const result = await runScan('manual');

    expect(result.newVacancyCount).toBe(1);
  });

  it('collapses the same connector error repeated across job titles into one summarized line', async () => {
    await prisma.jobTitle.create({ data: { title: 'Android Developer', selected: true } });
    searchSpy.mockImplementation(async () => {
      throw new Error('Сайт example.com недоступен');
    });

    const result = await runScan('manual');

    expect(result.errors).toHaveLength(2);
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: result.scanRunId } });
    expect(scanRun.error).toBe('[Fake Resource] Сайт example.com недоступен (×2)');
  });
});

describe('startScan', () => {
  it('returns immediately with a run id while the scan keeps going in the background', async () => {
    let resolveSearch: (v: RawVacancy[]) => void = () => {};
    const searchStarted = new Promise<void>((resolve) => {
      searchSpy.mockImplementation(() => {
        resolve();
        return new Promise<RawVacancy[]>((res) => { resolveSearch = res; });
      });
    });

    const { scanRunId } = await startScan('manual');
    await searchStarted;

    const midRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: scanRunId } });
    expect(midRun.finishedAt).toBeNull();

    resolveSearch([]);
    for (let i = 0; i < 40; i++) {
      const run = await prisma.scanRun.findUniqueOrThrow({ where: { id: scanRunId } });
      if (run.finishedAt) {
        expect(run.newVacancies).toBe(0);
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('Scan did not finish in time');
  });
});
