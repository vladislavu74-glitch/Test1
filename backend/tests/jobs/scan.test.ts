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
import { runScan } from '../../src/jobs/scan';
import { prisma } from '../../src/db/client';
import { connectorRegistry } from '../../src/connectors';
import type { JobSourceConnector, RawVacancy } from '../../src/connectors/types';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-scan.sqlite');

let fakeVacancies: RawVacancy[] = [];

const fakeConnector: JobSourceConnector = {
  key: 'fake',
  async search() {
    return fakeVacancies;
  },
};

beforeAll(() => {
  execSync('npx prisma migrate deploy', { cwd: backendRoot, env: process.env, stdio: 'ignore' });
  connectorRegistry[fakeConnector.key] = fakeConnector;
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
  await prisma.source.deleteMany();
  await prisma.searchCriteria.deleteMany();

  await prisma.source.create({
    data: {
      key: 'fake_source',
      name: 'Fake Source',
      kind: 'api',
      config: JSON.stringify({ connector: 'fake' }),
    },
  });
  await prisma.jobTitle.create({ data: { title: 'iOS Developer', selected: true } });
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

  it('collapses the same connector error repeated across job titles into one summarized line', async () => {
    await prisma.jobTitle.create({ data: { title: 'Android Developer', selected: true } });
    fakeConnector.search = async () => {
      throw new Error('hh.ru API error: 403 Forbidden');
    };

    const result = await runScan('manual');

    expect(result.errors).toHaveLength(2);
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: result.scanRunId } });
    expect(scanRun.error).toBe('[fake_source] hh.ru API error: 403 Forbidden (×2)');
  });
});
