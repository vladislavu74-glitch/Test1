import { Router } from 'express';
import { prisma } from '../../db/client';

export const criteriaRouter = Router();

function toGeographyResponse(criteria: {
  countries: string;
  regions: string;
  cities: string;
  employmentType: string | null;
  salaryMin: number | null;
  remoteOnly: boolean;
  updatedAt: Date;
}) {
  return {
    countries: JSON.parse(criteria.countries) as string[],
    regions: JSON.parse(criteria.regions) as string[],
    cities: JSON.parse(criteria.cities) as string[],
    employmentType: criteria.employmentType,
    salaryMin: criteria.salaryMin,
    remoteOnly: criteria.remoteOnly,
    updatedAt: criteria.updatedAt,
  };
}

criteriaRouter.get('/', async (_req, res) => {
  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  res.json(toGeographyResponse(criteria));
});

criteriaRouter.put('/', async (req, res) => {
  const { countries, regions, cities, employmentType, salaryMin, remoteOnly } = req.body as {
    countries?: string[];
    regions?: string[];
    cities?: string[];
    employmentType?: string | null;
    salaryMin?: number | null;
    remoteOnly?: boolean;
  };

  const data = {
    countries: JSON.stringify(countries ?? []),
    regions: JSON.stringify(regions ?? []),
    cities: JSON.stringify(cities ?? []),
    employmentType,
    salaryMin,
    remoteOnly,
  };

  const criteria = await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  res.json(toGeographyResponse(criteria));
});
