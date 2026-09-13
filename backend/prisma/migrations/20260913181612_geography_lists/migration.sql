/*
  Warnings:

  - You are about to drop the column `location` on the `SearchCriteria` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SearchCriteria" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "countries" TEXT NOT NULL DEFAULT '[]',
    "regions" TEXT NOT NULL DEFAULT '[]',
    "cities" TEXT NOT NULL DEFAULT '[]',
    "employmentType" TEXT,
    "salaryMin" INTEGER,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SearchCriteria" ("employmentType", "id", "remoteOnly", "salaryMin", "updatedAt") SELECT "employmentType", "id", "remoteOnly", "salaryMin", "updatedAt" FROM "SearchCriteria";
DROP TABLE "SearchCriteria";
ALTER TABLE "new_SearchCriteria" RENAME TO "SearchCriteria";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
