-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HiringResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "roles" TEXT NOT NULL DEFAULT '[]',
    "organizationId" TEXT,
    "hiringGeography" TEXT,
    "agencyLocation" TEXT,
    "specialization" TEXT,
    "evidenceSummary" TEXT NOT NULL,
    "evidenceUrl" TEXT NOT NULL,
    "lastRelevantDate" DATETIME,
    "contactMethod" TEXT,
    "publicContact" TEXT,
    "status" TEXT NOT NULL,
    "exclusionReason" TEXT,
    "relatedResources" TEXT,
    "uncertainties" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreGeoSpec" INTEGER NOT NULL DEFAULT 0,
    "scoreEvidence" INTEGER NOT NULL DEFAULT 0,
    "scoreRecency" INTEGER NOT NULL DEFAULT 0,
    "scoreContact" INTEGER NOT NULL DEFAULT 0,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "runId" TEXT,
    CONSTRAINT "HiringResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HiringResource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HiringResourceRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HiringResource" ("agencyLocation", "category", "checkedAt", "contactMethod", "createdAt", "evidenceSummary", "evidenceUrl", "exclusionReason", "hiringGeography", "id", "lastRelevantDate", "name", "organizationId", "publicContact", "relatedResources", "roles", "runId", "score", "scoreContact", "scoreEvidence", "scoreGeoSpec", "scoreRecency", "specialization", "status", "uncertainties", "updatedAt", "url") SELECT "agencyLocation", "category", "checkedAt", "contactMethod", "createdAt", "evidenceSummary", "evidenceUrl", "exclusionReason", "hiringGeography", "id", "lastRelevantDate", "name", "organizationId", "publicContact", "relatedResources", "roles", "runId", "score", "scoreContact", "scoreEvidence", "scoreGeoSpec", "scoreRecency", "specialization", "status", "uncertainties", "updatedAt", "url" FROM "HiringResource";
DROP TABLE "HiringResource";
ALTER TABLE "new_HiringResource" RENAME TO "HiringResource";
CREATE UNIQUE INDEX "HiringResource_url_key" ON "HiringResource"("url");
CREATE INDEX "HiringResource_category_idx" ON "HiringResource"("category");
CREATE INDEX "HiringResource_status_idx" ON "HiringResource"("status");
CREATE INDEX "HiringResource_organizationId_idx" ON "HiringResource"("organizationId");
CREATE TABLE "new_HiringResourceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "paramsJson" TEXT NOT NULL,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "organizationCount" INTEGER NOT NULL DEFAULT 0,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "queriesUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);
INSERT INTO "new_HiringResourceRun" ("confirmedCount", "error", "excludedCount", "finishedAt", "id", "limitations", "needsReviewCount", "organizationCount", "paramsJson", "queriesUsed", "startedAt", "trigger") SELECT "confirmedCount", "error", "excludedCount", "finishedAt", "id", "limitations", "needsReviewCount", "organizationCount", "paramsJson", "queriesUsed", "startedAt", "trigger" FROM "HiringResourceRun";
DROP TABLE "HiringResourceRun";
ALTER TABLE "new_HiringResourceRun" RENAME TO "HiringResourceRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
