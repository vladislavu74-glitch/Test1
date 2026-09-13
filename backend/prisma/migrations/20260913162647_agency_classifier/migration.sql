-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SourceCandidate" (
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
    "promotedSourceId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER,
    "geography" TEXT,
    "specialization" TEXT,
    "evidenceQuote" TEXT,
    "employerContact" TEXT
);
INSERT INTO "new_SourceCandidate" ("addedAt", "config", "country", "id", "key", "kind", "lastCheckError", "lastCheckOk", "lastCheckedAt", "name", "promotedSourceId") SELECT "addedAt", "config", "country", "id", "key", "kind", "lastCheckError", "lastCheckOk", "lastCheckedAt", "name", "promotedSourceId" FROM "SourceCandidate";
DROP TABLE "SourceCandidate";
ALTER TABLE "new_SourceCandidate" RENAME TO "SourceCandidate";
CREATE UNIQUE INDEX "SourceCandidate_key_key" ON "SourceCandidate"("key");
CREATE UNIQUE INDEX "SourceCandidate_promotedSourceId_key" ON "SourceCandidate"("promotedSourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
