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
    include: { hiringResource: true, state: true },
    orderBy: { publishedAt: 'desc' },
  });

  // Непросмотренные ("Новое") всегда наверху списка, а не просто вакансии
  // с более свежей датой публикации — иначе новая для нас вакансия с
  // более старой датой публикации на сайте-источнике тонет среди уже
  // просмотренных, но недавно опубликованных.
  const withIsNew = vacancies.map((v) => ({ v, isNew: !(v.state?.seen ?? false) }));
  withIsNew.sort((a, b) => Number(b.isNew) - Number(a.isNew));

  res.json(
    withIsNew.map(({ v, isNew }) => ({
      id: v.id,
      title: v.title,
      company: v.company,
      url: v.url,
      location: v.location,
      salaryText: v.salaryText,
      publishedAt: v.publishedAt,
      sourceName: v.hiringResource.name,
      hidden: v.state?.hidden ?? false,
      isNew,
    })),
  );
});

// Полная очистка накопленных вакансий — например, после смены критериев
// поиска или коннекторов, чтобы не держать старые нерелевантные результаты.
vacanciesRouter.delete('/', async (_req, res) => {
  await prisma.notificationLog.deleteMany();
  await prisma.vacancyState.deleteMany();
  await prisma.vacancy.deleteMany();
  res.status(204).end();
});

// Для бейджа/счётчика в приложении: сколько активных (не скрытых) вакансий
// пользователь ещё не видел.
vacanciesRouter.get('/summary', async (_req, res) => {
  const newCount = await prisma.vacancy.count({
    where: {
      OR: [{ state: null }, { state: { hidden: false, seen: false } }],
    },
  });
  res.json({ newCount });
});

// Вызывается приложением, когда пользователь открывает конкретную вакансию
// (тап по названию/кнопке "Посмотреть вакансию") — снимает значок "Новое"
// именно с неё, а не со всего показанного списка.
vacanciesRouter.post('/:id/seen', async (req, res) => {
  const vacancy = await prisma.vacancy.findUnique({ where: { id: req.params.id } });
  if (!vacancy) {
    res.status(404).json({ error: 'Vacancy not found' });
    return;
  }
  await prisma.vacancyState.upsert({
    where: { vacancyId: vacancy.id },
    update: { seen: true },
    create: { vacancyId: vacancy.id, seen: true },
  });
  res.status(204).end();
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
