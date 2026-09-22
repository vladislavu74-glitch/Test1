-- AlterTable
ALTER TABLE "SourceCandidate" ADD COLUMN "foundByAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiDiscoveryRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "jobTitles" TEXT NOT NULL DEFAULT '[]',
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);
