import { prisma } from './db/client';

// Источники вакансий больше не хардкодятся сидом — они находятся ИИ-агентом
// поиска ресурсов найма (вкладка "Ресурсы найма" в приложении) и сканируются
// автоматически, как только подтверждены (см. src/jobs/scan.ts). Здесь
// заводится только дефолтная запись критериев поиска.
async function main() {
  await prisma.searchCriteria.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  console.log('Seeded default search criteria.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
