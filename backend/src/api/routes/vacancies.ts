import { Router } from 'express';
import { prisma } from '../../db/client';

export const vacanciesRouter = Router();

type Filter = 'active' | 'hidden' | 'all';

vacanciesRouter.get('/', async (req, res) => {
  const filter = (req.query.filter as Filter | undefined) ?? 'active';

  const where =
    filter === 'all'
      ? {}
      : filter === 'hidden'
        ? { state: { hidden: true } }
        : { OR: [{ state: null }, { state: { hidden: false } }] };

  const vacancies = await prisma.vacancy.findMany({
    where,
    include: { source: true, state: true },
    orderBy: { publishedAt: 'desc' },
  });

  res.json(
    vacancies.map((v) => ({
      id: v.id,
      title: v.title,
      company: v.company,
      url: v.url,
      location: v.location,
      salaryText: v.salaryText,
      publishedAt: v.publishedAt,
      sourceName: v.source.name,
      hidden: v.state?.hidden ?? false,
    })),
  );
});

vacanciesRouter.post('/:id/hide', (req, res) => setHidden(req.params.id, true, res));
vacanciesRouter.post('/:id/unhide', (req, res) => setHidden(req.params.id, false, res));

async function setHidden(vacancyId: string, hidden: boolean, res: import('express').Response) {
  const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy) {
    res.status(404).json({ error: 'Vacancy not found' });
    return;
  }

  await prisma.vacancyState.upsert({
    where: { vacancyId },
    update: { hidden },
    create: { vacancyId, hidden },
  });

  res.status(204).end();
}
