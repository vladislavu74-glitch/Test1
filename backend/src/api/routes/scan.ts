import { Router } from 'express';
import { prisma } from '../../db/client';
import { runScan } from '../../jobs/scan';

export const scanRouter = Router();

scanRouter.post('/run', async (_req, res) => {
  try {
    const result = await runScan('manual');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

scanRouter.get('/last', async (_req, res) => {
  const last = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });
  res.json(last);
});

scanRouter.get('/last-discovery', async (_req, res) => {
  const last = await prisma.discoveryRun.findFirst({ orderBy: { startedAt: 'desc' } });
  res.json(last);
});
