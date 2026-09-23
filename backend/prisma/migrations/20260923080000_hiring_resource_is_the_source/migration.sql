-- Consolidate vacancy sources into HiringResource: the manual "Источники"
-- tab and its candidate-discovery pipeline (SourceCandidate/DiscoveryRun/
-- AiDiscoveryRun) are retired in favor of the confirmed HiringResource
-- catalog. Vacancies are searched anew — existing Vacancy/VacancyState/
-- NotificationLog rows (tied to the old Source table) are intentionally
-- dropped rather than migrated.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "NotificationLog";
DROP TABLE IF EXISTS "VacancyState";
DROP TABLE IF EXISTS "Vacancy";
DROP TABLE IF EXISTS "SourceCandidate";
DROP TABLE IF EXISTS "DiscoveryRun";
DROP TABLE IF EXISTS "AiDiscoveryRun";
DROP TABLE IF EXISTS "Source";

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hiringResourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "url" TEXT NOT NULL,
    "location" TEXT,
    "salaryText" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vacancy_hiringResourceId_fkey" FOREIGN KEY ("hiringResourceId") REFERENCES "HiringResource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_hiringResourceId_externalId_key" ON "Vacancy"("hiringResourceId", "externalId");

-- CreateIndex
CREATE INDEX "Vacancy_publishedAt_idx" ON "Vacancy"("publishedAt");

-- CreateTable
CREATE TABLE "VacancyState" (
    "vacancyId" TEXT NOT NULL PRIMARY KEY,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VacancyState_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "vacancyId" TEXT NOT NULL PRIMARY KEY,
    "notifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
