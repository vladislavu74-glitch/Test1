-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HiringResourceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "paramsJson" TEXT NOT NULL,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "organizationCount" INTEGER NOT NULL DEFAULT 0,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "queriesUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);
INSERT INTO "new_HiringResourceRun" ("confirmedCount", "error", "excludedCount", "finishedAt", "id", "limitations", "needsReviewCount", "organizationCount", "paramsJson", "queriesUsed", "startedAt", "status", "trigger") SELECT "confirmedCount", "error", "excludedCount", "finishedAt", "id", "limitations", "needsReviewCount", "organizationCount", "paramsJson", "queriesUsed", "startedAt", "status", "trigger" FROM "HiringResourceRun";
DROP TABLE "HiringResourceRun";
ALTER TABLE "new_HiringResourceRun" RENAME TO "HiringResourceRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
