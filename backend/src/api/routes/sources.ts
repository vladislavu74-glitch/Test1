import { Router } from 'express';
import { prisma } from '../../db/client';

export const sourcesRouter = Router();

sourcesRouter.get('/', async (_req, res) => {
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });
  res.json(sources);
});

sourcesRouter.patch('/:id', async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: '"enabled" must be a boolean' });
    return;
  }

  try {
    const source = await prisma.source.update({
      where: { id: req.params.id },
      data: { enabled },
    });
    res.json(source);
  } catch {
    res.status(404).json({ error: 'Source not found' });
  }
});
