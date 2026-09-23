process.env.DATABASE_URL = 'file:./test-api.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/api/app';
import { prisma } from '../../src/db/client';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-api.sqlite');
const app = createApp();
const authHeader = { Authorization: 'Bearer test-token' };

beforeAll(() => {
  execSync('npx prisma migrate deploy', { cwd: backendRoot, env: process.env, stdio: 'ignore' });
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDbPath, { force: true });
});

beforeEach(async () => {
  await prisma.notificationLog.deleteMany();
  await prisma.vacancyState.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.hiringResource.deleteMany();
  await prisma.jobTitle.deleteMany();
  await prisma.searchCriteria.deleteMany();
});

// Вакансии теперь ссылаются на HiringResource напрямую (см. schema.prisma) —
// эта функция создаёт минимальный подтверждённый ресурс для тестов вакансий,
// где сам ресурс не является предметом проверки.
async function createHiringResource(name: string) {
  return prisma.hiringResource.create({
    data: {
      name,
      url: `https://${name.toLowerCase().replace(/\s+/g, '-')}.example/`,
      category: 'direct_employer',
      status: 'confirmed',
      evidenceSummary: 'x',
      evidenceUrl: `https://${name.toLowerCase().replace(/\s+/g, '-')}.example/careers`,
    },
  });
}

describe('auth', () => {
  it('rejects requests without a bearer token', async () => {
    await request(app).get('/api/vacancies').expect(401);
  });

  it('rejects requests with a wrong token', async () => {
    await request(app).get('/api/vacancies').set('Authorization', 'Bearer wrong').expect(401);
  });

  it('allows /api/health without auth', async () => {
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });
});

describe('job titles', () => {
  it('creates, selects and deletes a job title', async () => {
    const created = await request(app)
      .post('/api/job-titles')
      .set(authHeader)
      .send({ title: 'iOS Developer' })
      .expect(201);
    expect(created.body.selected).toBe(false);

    await request(app)
      .patch(`/api/job-titles/${created.body.id}`)
      .set(authHeader)
      .send({ selected: true })
      .expect(200);

    const list = await request(app).get('/api/job-titles').set(authHeader).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].selected).toBe(true);

    await request(app).delete(`/api/job-titles/${created.body.id}`).set(authHeader).expect(204);
    const afterDelete = await request(app).get('/api/job-titles').set(authHeader).expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('rejects duplicate titles', async () => {
    await request(app).post('/api/job-titles').set(authHeader).send({ title: 'iOS Developer' }).expect(201);
    await request(app).post('/api/job-titles').set(authHeader).send({ title: 'iOS Developer' }).expect(409);
  });
});

describe('vacancies', () => {
  it('sorts by freshness and supports hide/unhide filtering', async () => {
    const resource = await createHiringResource('hh.ru');
    const older = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'old',
        title: 'Old vacancy',
        url: 'https://example.com/old',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false } },
      },
    });
    const newer = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'new',
        title: 'New vacancy',
        url: 'https://example.com/new',
        publishedAt: new Date('2024-06-01'),
        state: { create: { hidden: false } },
      },
    });

    const active = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(active.body.map((v: { id: string }) => v.id)).toEqual([newer.id, older.id]);

    await request(app).post(`/api/vacancies/${older.id}/hide`).set(authHeader).expect(204);

    const activeAfterHide = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(activeAfterHide.body.map((v: { id: string }) => v.id)).toEqual([newer.id]);

    const hidden = await request(app).get('/api/vacancies?filter=hidden').set(authHeader).expect(200);
    expect(hidden.body.map((v: { id: string }) => v.id)).toEqual([older.id]);

    await request(app).post(`/api/vacancies/${older.id}/unhide`).set(authHeader).expect(204);
    const activeAfterUnhide = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(activeAfterUnhide.body).toHaveLength(2);
  });

  it('flags unseen vacancies as new, exposes a count, and marking one seen only clears that one', async () => {
    const resource = await createHiringResource('hh.ru');
    const vacancy = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'v1',
        title: 'iOS Developer',
        url: 'https://example.com/v1',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false } },
      },
    });
    const otherVacancy = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'v2',
        title: 'Android Developer',
        url: 'https://example.com/v2',
        publishedAt: new Date('2024-01-02'),
        state: { create: { hidden: false } },
      },
    });

    const list = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(list.body[0].isNew).toBe(true);

    const summary = await request(app).get('/api/vacancies/summary').set(authHeader).expect(200);
    expect(summary.body.newCount).toBe(2);

    await request(app).post(`/api/vacancies/${vacancy.id}/seen`).set(authHeader).expect(204);

    const summaryAfter = await request(app).get('/api/vacancies/summary').set(authHeader).expect(200);
    expect(summaryAfter.body.newCount).toBe(1);

    const listAfter = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(listAfter.body.find((v: { id: string }) => v.id === vacancy.id).isNew).toBe(false);
    expect(listAfter.body.find((v: { id: string }) => v.id === otherVacancy.id).isNew).toBe(true);
  });

  it('returns 404 when marking an unknown vacancy as seen', async () => {
    await request(app).post('/api/vacancies/does-not-exist/seen').set(authHeader).expect(404);
  });

  it('puts unseen ("new") vacancies above already-seen ones regardless of publish date', async () => {
    const resource = await createHiringResource('hh.ru');
    const olderButNew = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'old-new',
        title: 'Older but unseen',
        url: 'https://example.com/old-new',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false, seen: false } },
      },
    });
    const newerButSeen = await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'new-seen',
        title: 'Newer but already seen',
        url: 'https://example.com/new-seen',
        publishedAt: new Date('2024-06-01'),
        state: { create: { hidden: false, seen: true } },
      },
    });

    const list = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(list.body.map((v: { id: string }) => v.id)).toEqual([olderButNew.id, newerButSeen.id]);
  });

  it('clears all accumulated vacancies', async () => {
    const resource = await createHiringResource('hh.ru');
    await prisma.vacancy.create({
      data: {
        hiringResourceId: resource.id,
        externalId: 'v1',
        title: 'iOS Developer',
        url: 'https://example.com/v1',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false } },
      },
    });

    await request(app).delete('/api/vacancies').set(authHeader).expect(204);

    const list = await request(app).get('/api/vacancies?filter=all').set(authHeader).expect(200);
    expect(list.body).toHaveLength(0);
  });
});

describe('job title rename', () => {
  it('renames a job title without losing its id/selected state', async () => {
    const created = await request(app)
      .post('/api/job-titles')
      .set(authHeader)
      .send({ title: 'iOS Developer' })
      .expect(201);
    await request(app)
      .patch(`/api/job-titles/${created.body.id}`)
      .set(authHeader)
      .send({ selected: true })
      .expect(200);

    const renamed = await request(app)
      .patch(`/api/job-titles/${created.body.id}`)
      .set(authHeader)
      .send({ title: 'Senior iOS Developer' })
      .expect(200);
    expect(renamed.body.id).toBe(created.body.id);
    expect(renamed.body.title).toBe('Senior iOS Developer');
    expect(renamed.body.selected).toBe(true);
  });
});

describe('search criteria', () => {
  it('defaults to empty geography lists and round-trips a PUT', async () => {
    const initial = await request(app).get('/api/criteria').set(authHeader).expect(200);
    expect(initial.body).toMatchObject({ countries: [], cities: [] });

    const updated = await request(app)
      .put('/api/criteria')
      .set(authHeader)
      .send({ countries: ['Россия', 'Казахстан'], cities: ['Москва', 'Алматы'] })
      .expect(200);
    expect(updated.body.countries).toEqual(['Россия', 'Казахстан']);
    expect(updated.body.cities).toEqual(['Москва', 'Алматы']);

    const fetched = await request(app).get('/api/criteria').set(authHeader).expect(200);
    expect(fetched.body.cities).toEqual(['Москва', 'Алматы']);
  });
});
