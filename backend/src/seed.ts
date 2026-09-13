import { prisma } from './db/client';

// Начальный набор источников. areaId для hh.ru нужно свериться с
// `GET https://api.hh.ru/areas` — значения ниже соответствуют справочнику
// hh.ru на момент написания и могут измениться.
const sources = [
  {
    key: 'hh_ru',
    name: 'hh.ru — Россия',
    kind: 'api' as const,
    country: 'RU',
    config: { connector: 'headhunter', areaId: 113 },
  },
  {
    key: 'hh_kz',
    name: 'hh.ru — Казахстан',
    kind: 'api' as const,
    country: 'KZ',
    config: { connector: 'headhunter', areaId: 40 },
  },
  {
    key: 'hh_by',
    name: 'hh.ru — Беларусь',
    kind: 'api' as const,
    country: 'BY',
    config: { connector: 'headhunter', areaId: 16 },
  },
  {
    key: 'hh_uz',
    name: 'hh.ru — Узбекистан',
    kind: 'api' as const,
    country: 'UZ',
    config: { connector: 'headhunter', areaId: 97 },
  },
  {
    key: 'hh_kg',
    name: 'hh.ru — Киргизия',
    kind: 'api' as const,
    country: 'KG',
    config: { connector: 'headhunter', areaId: 48 },
  },
  {
    key: 'superjob',
    name: 'SuperJob',
    kind: 'api' as const,
    country: null,
    config: { connector: 'superjob' },
  },
  {
    key: 'habr_career',
    name: 'Habr Career',
    kind: 'api' as const,
    country: 'RU',
    config: { connector: 'habr_career' },
  },
];

async function main() {
  for (const source of sources) {
    await prisma.source.upsert({
      where: { key: source.key },
      update: {},
      create: {
        key: source.key,
        name: source.name,
        kind: source.kind,
        country: source.country ?? undefined,
        config: JSON.stringify(source.config),
      },
    });
  }

  await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  console.log(`Seeded ${sources.length} sources and default search criteria.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
