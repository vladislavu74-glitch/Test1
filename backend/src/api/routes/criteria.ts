import { Router } from 'express';
import { prisma } from '../../db/client';

export const criteriaRouter = Router();

function toResponse(criteria: { countries: string; cities: string; updatedAt: Date }) {
  return {
    countries: JSON.parse(criteria.countries) as string[],
    cities: JSON.parse(criteria.cities) as string[],
    updatedAt: criteria.updatedAt,
  };
}

criteriaRouter.get('/', async (_req, res) => {
  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  res.json(toResponse(criteria));
});

criteriaRouter.put('/', async (req, res) => {
  const { countries, cities } = req.body as { countries?: string[]; cities?: string[] };

  const data = {
    countries: JSON.stringify(countries ?? []),
    cities: JSON.stringify(cities ?? []),
  };

  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  res.json(toResponse(criteria));
});
