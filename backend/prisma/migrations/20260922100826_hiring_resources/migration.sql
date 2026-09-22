-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "HiringResource" (
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
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "runId" TEXT,
    CONSTRAINT "HiringResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HiringResource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HiringResourceRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HiringResourceRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "organizationCount" INTEGER NOT NULL DEFAULT 0,
    "limitations" TEXT NOT NULL DEFAULT '[]',
    "queriesUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "HiringResource_url_key" ON "HiringResource"("url");

-- CreateIndex
CREATE INDEX "HiringResource_category_idx" ON "HiringResource"("category");

-- CreateIndex
CREATE INDEX "HiringResource_status_idx" ON "HiringResource"("status");

-- CreateIndex
CREATE INDEX "HiringResource_organizationId_idx" ON "HiringResource"("organizationId");
