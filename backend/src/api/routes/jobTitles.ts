import { Router } from 'express';
import { prisma } from '../../db/client';

export const jobTitlesRouter = Router();

jobTitlesRouter.get('/', async (_req, res) => {
  const jobTitles = await prisma.jobTitle.findMany({ orderBy: { title: 'asc' } });
  res.json(jobTitles);
});

jobTitlesRouter.post('/', async (req, res) => {
  const { title } = req.body as { title?: string };
  if (!title || !title.trim()) {
    res.status(400).json({ error: '"title" is required' });
    return;
  }

  try {
    const jobTitle = await prisma.jobTitle.create({ data: { title: title.trim() } });
    res.status(201).json(jobTitle);
  } catch {
    res.status(409).json({ error: 'This job title already exists' });
  }
});

jobTitlesRouter.patch('/:id', async (req, res) => {
  const { selected } = req.body as { selected?: boolean };
  if (typeof selected !== 'boolean') {
    res.status(400).json({ error: '"selected" must be a boolean' });
    return;
  }

  try {
    const jobTitle = await prisma.jobTitle.update({
      where: { id: req.params.id },
      data: { selected },
    });
    res.json(jobTitle);
  } catch {
    res.status(404).json({ error: 'Job title not found' });
  }
});

jobTitlesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.jobTitle.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Job title not found' });
  }
});
