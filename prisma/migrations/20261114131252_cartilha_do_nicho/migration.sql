-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NichePlaybook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'short',
    "model" TEXT NOT NULL,
    "stats" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "markdown" TEXT,
    "diagnosisCount" INTEGER NOT NULL,
    "studyIds" TEXT NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NichePlaybook_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NichePlaybook" ("content", "createdAt", "diagnosisCount", "id", "model", "nicheId", "stats") SELECT "content", "createdAt", "diagnosisCount", "id", "model", "nicheId", "stats" FROM "NichePlaybook";
DROP TABLE "NichePlaybook";
ALTER TABLE "new_NichePlaybook" RENAME TO "NichePlaybook";
CREATE INDEX "NichePlaybook_nicheId_createdAt_idx" ON "NichePlaybook"("nicheId", "createdAt");
CREATE INDEX "NichePlaybook_nicheId_format_createdAt_idx" ON "NichePlaybook"("nicheId", "format", "createdAt");
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "durationSec" INTEGER,
    "isShort" BOOLEAN NOT NULL DEFAULT false,
    "shortSource" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "defaultLang" TEXT,
    "statsFetchedAt" DATETIME,
    "studyNicheId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Video_studyNicheId_fkey" FOREIGN KEY ("studyNicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("channelId", "commentCount", "createdAt", "defaultLang", "description", "durationSec", "externalId", "id", "isShort", "likeCount", "platform", "publishedAt", "shortSource", "statsFetchedAt", "tags", "thumbnailUrl", "title", "updatedAt", "viewCount") SELECT "channelId", "commentCount", "createdAt", "defaultLang", "description", "durationSec", "externalId", "id", "isShort", "likeCount", "platform", "publishedAt", "shortSource", "statsFetchedAt", "tags", "thumbnailUrl", "title", "updatedAt", "viewCount" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE INDEX "Video_channelId_publishedAt_idx" ON "Video"("channelId", "publishedAt");
CREATE UNIQUE INDEX "Video_platform_externalId_key" ON "Video"("platform", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
