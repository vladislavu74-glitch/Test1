/*
  Warnings:

  - You are about to drop the column `employmentType` on the `SearchCriteria` table. All the data in the column will be lost.
  - You are about to drop the column `regions` on the `SearchCriteria` table. All the data in the column will be lost.
  - You are about to drop the column `remoteOnly` on the `SearchCriteria` table. All the data in the column will be lost.
  - You are about to drop the column `salaryMin` on the `SearchCriteria` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SearchCriteria" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "countries" TEXT NOT NULL DEFAULT '[]',
    "cities" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SearchCriteria" ("cities", "countries", "id", "updatedAt") SELECT "cities", "countries", "id", "updatedAt" FROM "SearchCriteria";
DROP TABLE "SearchCriteria";
ALTER TABLE "new_SearchCriteria" RENAME TO "SearchCriteria";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
