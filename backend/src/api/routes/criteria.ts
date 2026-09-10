import { Router } from 'express';
import { prisma } from '../../db/client';

export const criteriaRouter = Router();

criteriaRouter.get('/', async (_req, res) => {
  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  res.json(criteria);
});

criteriaRouter.put('/', async (req, res) => {
  const { location, employmentType, salaryMin, remoteOnly } = req.body as {
    location?: string | null;
    employmentType?: string | null;
    salaryMin?: number | null;
    remoteOnly?: boolean;
  };

  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: { location, employmentType, salaryMin, remoteOnly },
    create: { id: 'singleton', location, employmentType, salaryMin, remoteOnly },
  });
  res.json(criteria);
});
