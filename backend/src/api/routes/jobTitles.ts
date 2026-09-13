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
  const { selected, title } = req.body as { selected?: boolean; title?: string };
  if (selected === undefined && title === undefined) {
    res.status(400).json({ error: 'Provide "selected" and/or "title" to update' });
    return;
  }
  if (title !== undefined && !title.trim()) {
    res.status(400).json({ error: '"title" cannot be empty' });
    return;
  }

  try {
    const jobTitle = await prisma.jobTitle.update({
      where: { id: req.params.id },
      data: {
        ...(selected !== undefined ? { selected } : {}),
        ...(title !== undefined ? { title: title.trim() } : {}),
      },
    });
    res.json(jobTitle);
  } catch {
    res.status(404).json({ error: 'Job title not found or new title already exists' });
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
