import { prisma } from './db/client';

// Дефолтные источники со стабильным публичным API — заводятся сидом сразу
// как подтверждённые HiringResource (а не отдельной таблицей), чтобы
// участвовать в скане вакансий без предварительного ИИ-поиска. areaId для
// hh.ru нужно свериться с `GET https://api.hh.ru/areas` при необходимости.
const defaultResources = [
  {
    key: 'hh_ru',
    name: 'hh.ru — Россия',
    url: 'https://hh.ru/',
    hiringGeography: 'Россия',
    scanConfig: { connector: 'headhunter', areaId: 113 },
  },
  {
    key: 'hh_kz',
    name: 'hh.ru — Казахстан',
    url: 'https://hh.kz/',
    hiringGeography: 'Казахстан',
    scanConfig: { connector: 'headhunter', areaId: 40 },
  },
  {
    key: 'hh_by',
    name: 'hh.ru — Беларусь',
    url: 'https://hh.by/',
    hiringGeography: 'Беларусь',
    scanConfig: { connector: 'headhunter', areaId: 16 },
  },
  {
    key: 'hh_uz',
    name: 'hh.ru — Узбекистан',
    url: 'https://hh.uz/',
    hiringGeography: 'Узбекистан',
    scanConfig: { connector: 'headhunter', areaId: 97 },
  },
  {
    key: 'hh_kg',
    name: 'hh.ru — Киргизия',
    url: 'https://hh.kg/',
    hiringGeography: 'Киргизия',
    scanConfig: { connector: 'headhunter', areaId: 48 },
  },
  {
    key: 'superjob',
    name: 'SuperJob',
    url: 'https://superjob.ru/',
    hiringGeography: 'Россия',
    scanConfig: { connector: 'superjob' },
  },
  {
    key: 'habr_career',
    name: 'Habr Career',
    url: 'https://career.habr.com/',
    hiringGeography: 'Россия',
    scanConfig: { connector: 'habr_career' },
  },
];

async function main() {
  for (const resource of defaultResources) {
    await prisma.hiringResource.upsert({
      where: { url: resource.url },
      update: {},
      create: {
        name: resource.name,
        url: resource.url,
        category: 'job_board',
        roles: JSON.stringify(['distributes_vacancies']),
        hiringGeography: resource.hiringGeography,
        evidenceSummary: 'Официальный публичный работный сайт — заведён по умолчанию, не через ИИ-поиск.',
        evidenceUrl: resource.url,
        status: 'confirmed',
        scanConfig: JSON.stringify(resource.scanConfig),
        score: 100,
      },
    });
  }

  await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  console.log(`Seeded ${defaultResources.length} default hiring resources and default search criteria.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
