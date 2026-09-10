process.env.DATABASE_URL = 'file:./test-api.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/api/app';
import { prisma } from '../../src/db/client';
import { connectorRegistry } from '../../src/connectors';
import type { JobSourceConnector } from '../../src/connectors/types';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-api.sqlite');
const app = createApp();
const authHeader = { Authorization: 'Bearer test-token' };

let probeShouldSucceed = true;
const fakeDiscoveryConnector: JobSourceConnector = {
  key: 'fake_discovery',
  async search() {
    return [];
  },
  async probe() {
    if (!probeShouldSucceed) throw new Error('probe failed');
  },
};

beforeAll(() => {
  execSync('npx prisma migrate deploy', { cwd: backendRoot, env: process.env, stdio: 'ignore' });
  connectorRegistry[fakeDiscoveryConnector.key] = fakeDiscoveryConnector;
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDbPath, { force: true });
});

beforeEach(async () => {
  probeShouldSucceed = true;
  await prisma.notificationLog.deleteMany();
  await prisma.vacancyState.deleteMany();
  await prisma.vacancy.deleteMany();
  await prisma.sourceCandidate.deleteMany();
  await prisma.source.deleteMany();
  await prisma.jobTitle.deleteMany();
  await prisma.searchCriteria.deleteMany();
});

describe('auth', () => {
  it('rejects requests without a bearer token', async () => {
    await request(app).get('/api/sources').expect(401);
  });

  it('rejects requests with a wrong token', async () => {
    await request(app).get('/api/sources').set('Authorization', 'Bearer wrong').expect(401);
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

describe('sources', () => {
  it('toggles a source on and off', async () => {
    const source = await prisma.source.create({
      data: { key: 'hh_ru', name: 'hh.ru', kind: 'api', config: '{}' },
    });

    await request(app).patch(`/api/sources/${source.id}`).set(authHeader).send({ enabled: false }).expect(200);

    const list = await request(app).get('/api/sources').set(authHeader).expect(200);
    expect(list.body[0].enabled).toBe(false);
  });
});

describe('vacancies', () => {
  it('sorts by freshness and supports hide/unhide filtering', async () => {
    const source = await prisma.source.create({
      data: { key: 'hh_ru', name: 'hh.ru', kind: 'api', config: '{}' },
    });
    const older = await prisma.vacancy.create({
      data: {
        sourceId: source.id,
        externalId: 'old',
        title: 'Old vacancy',
        url: 'https://example.com/old',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false } },
      },
    });
    const newer = await prisma.vacancy.create({
      data: {
        sourceId: source.id,
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

  it('flags unseen vacancies as new, exposes a count, and mark-all-seen clears it', async () => {
    const source = await prisma.source.create({
      data: { key: 'hh_ru', name: 'hh.ru', kind: 'api', config: '{}' },
    });
    const vacancy = await prisma.vacancy.create({
      data: {
        sourceId: source.id,
        externalId: 'v1',
        title: 'iOS Developer',
        url: 'https://example.com/v1',
        publishedAt: new Date('2024-01-01'),
        state: { create: { hidden: false } },
      },
    });

    const list = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(list.body[0].isNew).toBe(true);

    const summary = await request(app).get('/api/vacancies/summary').set(authHeader).expect(200);
    expect(summary.body.newCount).toBe(1);

    await request(app).post('/api/vacancies/mark-all-seen').set(authHeader).expect(204);

    const summaryAfter = await request(app).get('/api/vacancies/summary').set(authHeader).expect(200);
    expect(summaryAfter.body.newCount).toBe(0);

    const listAfter = await request(app).get('/api/vacancies?filter=active').set(authHeader).expect(200);
    expect(listAfter.body.find((v: { id: string }) => v.id === vacancy.id).isNew).toBe(false);
  });
});

describe('source candidates and discovery', () => {
  it('creates a greenhouse candidate and rejects a duplicate', async () => {
    await request(app)
      .post('/api/source-candidates')
      .set(authHeader)
      .send({ name: 'Acme', type: 'greenhouse', boardSlug: 'acme' })
      .expect(201);

    await request(app)
      .post('/api/source-candidates')
      .set(authHeader)
      .send({ name: 'Acme again', type: 'greenhouse', boardSlug: 'acme' })
      .expect(409);
  });

  it('promotes a valid candidate to an active, discovered source', async () => {
    await prisma.sourceCandidate.create({
      data: {
        key: 'fake:1',
        name: 'Fake Agency',
        kind: 'ats',
        config: JSON.stringify({ connector: 'fake_discovery' }),
      },
    });

    const result = await request(app).post('/api/source-candidates/discover').set(authHeader).expect(200);
    expect(result.body.checked).toBe(1);
    expect(result.body.promoted).toBe(1);

    const sources = await request(app).get('/api/sources').set(authHeader).expect(200);
    expect(sources.body).toHaveLength(1);
    expect(sources.body[0].discovered).toBe(true);
    expect(sources.body[0].enabled).toBe(true);

    const candidates = await request(app).get('/api/source-candidates').set(authHeader).expect(200);
    expect(candidates.body[0].promotedSourceId).toBe(sources.body[0].id);
  });

  it('leaves a failing candidate unpromoted and records the error', async () => {
    probeShouldSucceed = false;
    await prisma.sourceCandidate.create({
      data: {
        key: 'fake:2',
        name: 'Broken Agency',
        kind: 'ats',
        config: JSON.stringify({ connector: 'fake_discovery' }),
      },
    });

    const result = await request(app).post('/api/source-candidates/discover').set(authHeader).expect(200);
    expect(result.body.promoted).toBe(0);
    expect(result.body.errors).toHaveLength(1);

    const sources = await request(app).get('/api/sources').set(authHeader).expect(200);
    expect(sources.body).toHaveLength(0);

    const candidates = await request(app).get('/api/source-candidates').set(authHeader).expect(200);
    expect(candidates.body[0].lastCheckOk).toBe(false);
    expect(candidates.body[0].promotedSourceId).toBeNull();
  });

  it('deletes a candidate', async () => {
    const created = await request(app)
      .post('/api/source-candidates')
      .set(authHeader)
      .send({ name: 'Some Feed', type: 'rss', feedUrl: 'https://example.com/jobs.rss' })
      .expect(201);

    await request(app).delete(`/api/source-candidates/${created.body.id}`).set(authHeader).expect(204);
    const list = await request(app).get('/api/source-candidates').set(authHeader).expect(200);
    expect(list.body).toHaveLength(0);
  });
});
