-- CreateTable
CREATE TABLE "SourceCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "country" TEXT,
    "config" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" DATETIME,
    "lastCheckOk" BOOLEAN,
    "lastCheckError" TEXT,
    "promotedSourceId" TEXT
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "promoted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "country" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "discovered" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Source" ("config", "country", "createdAt", "enabled", "id", "key", "kind", "name", "updatedAt") SELECT "config", "country", "createdAt", "enabled", "id", "key", "kind", "name", "updatedAt" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE UNIQUE INDEX "Source_key_key" ON "Source"("key");
CREATE TABLE "new_VacancyState" (
    "vacancyId" TEXT NOT NULL PRIMARY KEY,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VacancyState_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VacancyState" ("hidden", "updatedAt", "vacancyId") SELECT "hidden", "updatedAt", "vacancyId" FROM "VacancyState";
DROP TABLE "VacancyState";
ALTER TABLE "new_VacancyState" RENAME TO "VacancyState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SourceCandidate_key_key" ON "SourceCandidate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCandidate_promotedSourceId_key" ON "SourceCandidate"("promotedSourceId");
