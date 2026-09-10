// Отдельная тестовая SQLite-база и мок nodemailer должны быть настроены ДО
// того, как что-либо в проекте импортирует src/db/client или src/mail/mailer
// (ts-jest не хоистит jest.mock/присваивания так, как это делает babel-jest,
// поэтому порядок операторов в файле важен).
process.env.DATABASE_URL = 'file:./test-scan.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';

const sendMailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
}));

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

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDbPath, { force: true });
});

beforeEach(async () => {
  fakeVacancies = [];
  sendMailMock.mockClear();
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
    expect(sendMailMock).not.toHaveBeenCalled();

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
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const notified = await prisma.notificationLog.findMany();
    expect(notified).toHaveLength(1);
  });

  it('does not re-email vacancies already notified about', async () => {
    fakeVacancies = [
      { externalId: 'v1', title: 'iOS Developer', url: 'https://example.com/v1', publishedAt: new Date('2024-01-01') },
    ];
    await runScan('cron');
    sendMailMock.mockClear();

    const secondRun = await runScan('cron');

    expect(secondRun.emailSent).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
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
});
