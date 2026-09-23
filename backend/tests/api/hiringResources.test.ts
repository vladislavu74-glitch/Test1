process.env.DATABASE_URL = 'file:./test-hiring-resources.sqlite';
process.env.API_AUTH_TOKEN = 'test-token';
process.env.ANTHROPIC_API_KEY = '';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/api/app';
import { prisma } from '../../src/db/client';

const backendRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(backendRoot, 'test-hiring-resources.sqlite');
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
  await prisma.hiringResource.deleteMany();
  await prisma.hiringResourceRun.deleteMany();
  await prisma.organization.deleteMany();
});

describe('GET /api/hiring-resources', () => {
  it('rejects requests without a bearer token', async () => {
    await request(app).get('/api/hiring-resources').expect(401);
  });

  it('returns an empty list on a fresh database', async () => {
    const res = await request(app).get('/api/hiring-resources').set(authHeader).expect(200);
    expect(res.body).toEqual([]);
  });

  it('filters by category, status and minScore, sorted by score desc', async () => {
    const org = await prisma.organization.create({ data: { name: 'Acme' } });
    await prisma.hiringResource.create({
      data: {
        name: 'Acme Careers', url: 'https://acme.example/', category: 'direct_employer', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://acme.example/careers', score: 80, organizationId: org.id,
      },
    });
    await prisma.hiringResource.create({
      data: {
        name: 'Acme Telegram', url: 'https://t.me/acme_jobs', category: 'telegram', status: 'needs_review',
        evidenceSummary: 'x', evidenceUrl: 'https://t.me/acme_jobs/12', score: 40, organizationId: org.id,
      },
    });

    const confirmedOnly = await request(app)
      .get('/api/hiring-resources?status=confirmed')
      .set(authHeader)
      .expect(200);
    expect(confirmedOnly.body).toHaveLength(1);
    expect(confirmedOnly.body[0].name).toBe('Acme Careers');

    const highScoreOnly = await request(app)
      .get('/api/hiring-resources?minScore=50')
      .set(authHeader)
      .expect(200);
    expect(highScoreOnly.body).toHaveLength(1);
    expect(highScoreOnly.body[0].score).toBe(80);

    const all = await request(app).get('/api/hiring-resources').set(authHeader).expect(200);
    expect(all.body.map((r: { score: number }) => r.score)).toEqual([80, 40]);
  });
});

describe('GET /api/hiring-resources/:id', () => {
  it('includes sibling resources of the same organization', async () => {
    const org = await prisma.organization.create({ data: { name: 'Acme' } });
    const site = await prisma.hiringResource.create({
      data: {
        name: 'Acme Careers', url: 'https://acme.example/', category: 'direct_employer', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://acme.example/careers', organizationId: org.id,
      },
    });
    await prisma.hiringResource.create({
      data: {
        name: 'Acme Telegram', url: 'https://t.me/acme_jobs', category: 'telegram', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://t.me/acme_jobs/12', organizationId: org.id,
      },
    });

    const res = await request(app).get(`/api/hiring-resources/${site.id}`).set(authHeader).expect(200);
    expect(res.body.organization.resources).toHaveLength(2);
  });

  it('returns 404 for an unknown id', async () => {
    await request(app).get('/api/hiring-resources/does-not-exist').set(authHeader).expect(404);
  });
});

describe('POST /api/hiring-resources/discover', () => {
  it('starts the run in the background and returns its id immediately (202)', async () => {
    const res = await request(app).post('/api/hiring-resources/discover').set(authHeader).send({}).expect(202);
    expect(res.body.runId).toBeTruthy();

    const run = await prisma.hiringResourceRun.findUnique({ where: { id: res.body.runId } });
    expect(run).not.toBeNull();
    expect(run!.trigger).toBe('manual');
  });

  it('surfaces a missing ANTHROPIC_API_KEY as a run-level error, not an HTTP failure', async () => {
    const started = await request(app).post('/api/hiring-resources/discover').set(authHeader).send({}).expect(202);

    // Фоновая обработка запускается без await — ждём, пока processRun
    // отметит запуск завершённым с ошибкой (проверка ключа — первое, что
    // делает searchHiringResources, поэтому это происходит почти сразу).
    let run = await prisma.hiringResourceRun.findUnique({ where: { id: started.body.runId } });
    for (let i = 0; i < 20 && run?.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 25));
      run = await prisma.hiringResourceRun.findUnique({ where: { id: started.body.runId } });
    }

    expect(run?.status).toBe('error');
    expect(run?.error).toMatch(/ANTHROPIC_API_KEY/);

    const viaApi = await request(app).get(`/api/hiring-resources/runs/${started.body.runId}`).set(authHeader).expect(200);
    expect(viaApi.body.status).toBe('error');
  });
});

describe('GET /api/hiring-resources/summary and mark-all-seen', () => {
  it('counts new non-excluded resources and clears the flag on mark-all-seen', async () => {
    await prisma.hiringResource.create({
      data: {
        name: 'New Agency', url: 'https://agency.example/', category: 'recruiting_agency', status: 'confirmed',
        evidenceSummary: 'x', evidenceUrl: 'https://agency.example/uslugi', isNew: true,
      },
    });
    await prisma.hiringResource.create({
      data: {
        name: 'Old excluded', url: 'https://excluded.example/', category: 'recruiting_agency', status: 'excluded',
        evidenceSummary: 'x', evidenceUrl: 'https://excluded.example/', isNew: true,
      },
    });

    const summary = await request(app).get('/api/hiring-resources/summary').set(authHeader).expect(200);
    expect(summary.body.newCount).toBe(1);

    await request(app).post('/api/hiring-resources/mark-all-seen').set(authHeader).expect(204);

    const after = await request(app).get('/api/hiring-resources/summary').set(authHeader).expect(200);
    expect(after.body.newCount).toBe(0);
  });
});

describe('GET /api/hiring-resources/export and POST /import', () => {
  it('exports the full catalog and re-imports it into an empty database unchanged', async () => {
    const org = await prisma.organization.create({ data: { name: 'Acme' } });
    await prisma.hiringResource.create({
      data: {
        name: 'Acme Careers', url: 'https://acme.example/careers', category: 'direct_employer', status: 'confirmed',
        evidenceSummary: 'Публикует вакансии', evidenceUrl: 'https://acme.example/careers/1',
        organizationId: org.id, hiringGeography: 'Москва', score: 90,
      },
    });

    const exported = await request(app).get('/api/hiring-resources/export').set(authHeader).expect(200);
    expect(exported.body.format).toBe('jobmonitor.hiring-resources');
    expect(exported.body.resources).toHaveLength(1);
    expect(exported.body.resources[0].organizationName).toBe('Acme');

    await prisma.hiringResource.deleteMany();
    await prisma.organization.deleteMany();

    const imported = await request(app)
      .post('/api/hiring-resources/import')
      .set(authHeader)
      .send(exported.body)
      .expect(200);
    expect(imported.body).toMatchObject({ total: 1, created: 1, updated: 0, errors: [] });

    const list = await request(app).get('/api/hiring-resources').set(authHeader).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Acme Careers');
    expect(list.body[0].organization.name).toBe('Acme');
    expect(list.body[0].isNew).toBe(true);
  });

  it('re-importing the same resource updates it in place instead of duplicating', async () => {
    const payload = {
      format: 'jobmonitor.hiring-resources',
      version: 1,
      resources: [
        {
          name: 'Acme Careers', url: 'https://acme.example/careers', category: 'direct_employer',
          roles: ['hires_own'], organizationName: null, hiringGeography: null, agencyLocation: null,
          specialization: null, evidenceSummary: 'x', evidenceUrl: 'https://acme.example/careers',
          lastRelevantDate: null, contactMethod: null, publicContact: null, status: 'confirmed',
          exclusionReason: null, relatedResources: [], uncertainties: null,
          score: 50, scoreGeoSpec: 10, scoreEvidence: 10, scoreRecency: 10, scoreContact: 10,
          checkedAt: new Date().toISOString(), firstSeenAt: new Date().toISOString(),
        },
      ],
    };

    await request(app).post('/api/hiring-resources/import').set(authHeader).send(payload).expect(200);
    const second = await request(app).post('/api/hiring-resources/import').set(authHeader).send(payload).expect(200);

    expect(second.body).toMatchObject({ total: 1, created: 0, updated: 1 });
    const count = await prisma.hiringResource.count();
    expect(count).toBe(1);
  });

  it('accepts a bare array of resources as well as the full export shape', async () => {
    const bareArray = [
      {
        name: 'Bare Resource', url: 'https://bare.example/', category: 'job_board',
        roles: [], organizationName: null, hiringGeography: null, agencyLocation: null,
        specialization: null, evidenceSummary: 'x', evidenceUrl: 'https://bare.example/',
        lastRelevantDate: null, contactMethod: null, publicContact: null, status: 'confirmed',
        exclusionReason: null, relatedResources: [], uncertainties: null,
        score: 0, scoreGeoSpec: 0, scoreEvidence: 0, scoreRecency: 0, scoreContact: 0,
        checkedAt: new Date().toISOString(), firstSeenAt: new Date().toISOString(),
      },
    ];

    const result = await request(app).post('/api/hiring-resources/import').set(authHeader).send(bareArray).expect(200);
    expect(result.body).toMatchObject({ total: 1, created: 1 });
  });

  it('rejects a payload that is neither an export file nor an array', async () => {
    await request(app).post('/api/hiring-resources/import').set(authHeader).send({ nonsense: true }).expect(400);
  });
});
