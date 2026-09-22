import { Router } from 'express';
import { prisma } from '../../db/client';
import { startHiringResourceDiscovery } from '../../jobs/discoverHiringResources';
import type { HiringResourceRunParams } from '../../discovery/hiringResourceTypes';

export const hiringResourcesRouter = Router();

// Список ресурсов — фильтры по категории/статусу/организации, сортировка по
// баллу приоритета (раздел 9), т.к. итоговый балл отражает приоритет для
// дальнейшей работы.
hiringResourcesRouter.get('/', async (req, res) => {
  const { category, status, organizationId, minScore } = req.query as Record<string, string | undefined>;

  const resources = await prisma.hiringResource.findMany({
    where: {
      category: category || undefined,
      status: status || undefined,
      organizationId: organizationId || undefined,
      score: minScore ? { gte: Number(minScore) } : undefined,
    },
    orderBy: { score: 'desc' },
    include: { organization: true },
  });

  res.json(resources);
});

// Роуты /runs/* и /discover должны быть объявлены раньше generic '/:id' —
// иначе Express примет "runs"/"discover" за значение :id.
hiringResourcesRouter.get('/runs/list', async (_req, res) => {
  const runs = await prisma.hiringResourceRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
  res.json(runs);
});

hiringResourcesRouter.get('/runs/:id', async (req, res) => {
  const run = await prisma.hiringResourceRun.findUnique({
    where: { id: req.params.id },
    include: { resources: { orderBy: { score: 'desc' } } },
  });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(run);
});

// Запускает поиск в фоне и сразу возвращает id запуска — приложение
// показывает статус-бар, опрашивая GET /runs/:id (поля status/queriesUsed),
// а не ждёт единственного долгого HTTP-ответа.
hiringResourcesRouter.post('/discover', async (req, res) => {
  try {
    const params = req.body as Partial<HiringResourceRunParams> | undefined;
    const result = await startHiringResourceDiscovery(params ?? {});
    res.status(202).json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Для бейджа/счётчика в приложении — сколько подтверждённых или требующих
// проверки ресурсов ещё не просмотрены (тот же паттерн, что у вакансий).
hiringResourcesRouter.get('/summary', async (_req, res) => {
  const newCount = await prisma.hiringResource.count({
    where: { isNew: true, status: { not: 'excluded' } },
  });
  const staleCount = await prisma.hiringResource.count({ where: { isStale: true } });
  res.json({ newCount, staleCount });
});

// Вызывается приложением после показа списка — снимает пометку "Новое".
hiringResourcesRouter.post('/mark-all-seen', async (_req, res) => {
  await prisma.hiringResource.updateMany({ where: { isNew: true }, data: { isNew: false } });
  res.status(204).end();
});

hiringResourcesRouter.get('/:id', async (req, res) => {
  const resource = await prisma.hiringResource.findUnique({
    where: { id: req.params.id },
    include: { organization: { include: { resources: true } } },
  });
  if (!resource) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  res.json(resource);
});
