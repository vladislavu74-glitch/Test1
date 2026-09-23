import { Router } from 'express';
import { prisma } from '../../db/client';
import { startScan } from '../../jobs/scan';

export const scanRouter = Router();

// Асинхронно: сам скан может идти несколько минут (последовательно обходит
// каждое название должности × каждый источник), поэтому отвечаем сразу id
// запуска, а не ждём завершения — приложение опрашивает GET /runs/:id (см.
// startScan в src/jobs/scan.ts).
scanRouter.post('/run', async (_req, res) => {
  const { scanRunId } = await startScan('manual');
  res.status(202).json({ scanRunId });
});

scanRouter.get('/runs/:id', async (req, res) => {
  const run = await prisma.scanRun.findUnique({ where: { id: req.params.id } });
  if (!run) {
    res.status(404).json({ error: 'Scan run not found' });
    return;
  }
  res.json(run);
});

scanRouter.get('/last', async (_req, res) => {
  const last = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });
  res.json(last);
});
