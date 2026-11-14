-- AlterTable
ALTER TABLE "Idea" ADD COLUMN "ideaCostUsd" REAL;
ALTER TABLE "Idea" ADD COLUMN "ideaData" TEXT;
ALTER TABLE "Idea" ADD COLUMN "playbookId" TEXT;
ALTER TABLE "Idea" ADD COLUMN "scriptCostUsd" REAL;
ALTER TABLE "Idea" ADD COLUMN "scriptData" TEXT;

-- CreateTable
CREATE TABLE "MyChannelScript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "script" TEXT NOT NULL,
    "views" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannelScript_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MyChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "nicheId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESEARCH',
    "notes" TEXT,
    "oauthConnected" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL DEFAULT 'short',
    "platforms" TEXT,
    "concept" TEXT,
    "characters" TEXT,
    "visualStyle" TEXT,
    "tone" TEXT,
    "storyFormats" TEXT,
    "audience" TEXT,
    "rules" TEXT,
    "durationSec" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MyChannel" ("createdAt", "externalId", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "status", "updatedAt", "url") SELECT "createdAt", "externalId", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "status", "updatedAt", "url" FROM "MyChannel";
DROP TABLE "MyChannel";
ALTER TABLE "new_MyChannel" RENAME TO "MyChannel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MyChannelScript_myChannelId_idx" ON "MyChannelScript"("myChannelId");
