-- AlterTable
ALTER TABLE "MyVideo" ADD COLUMN "analytics" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "analyticsError" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "analyticsFetchedAt" DATETIME;
ALTER TABLE "MyVideo" ADD COLUMN "dailyViews" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "description" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "retention" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "scriptText" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "shortSource" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "studioNotes" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "trafficSources" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "transcriptSegments" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "transcriptSource" TEXT;
ALTER TABLE "MyVideo" ADD COLUMN "transcriptText" TEXT;

-- AlterTable
ALTER TABLE "MyVideoCheckpoint" ADD COLUMN "ctr" REAL;
ALTER TABLE "MyVideoCheckpoint" ADD COLUMN "impressions" INTEGER;

-- CreateTable
CREATE TABLE "MyVideoDiagnosis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myVideoId" TEXT NOT NULL,
    "ageHours" REAL NOT NULL,
    "milestone" INTEGER,
    "trigger" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputs" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "markdown" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MyVideoDiagnosis_myVideoId_fkey" FOREIGN KEY ("myVideoId") REFERENCES "MyVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MyChannelReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myChannelId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputs" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "markdown" TEXT,
    "videoCount" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MyChannelReport_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoogleAuth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelExternalId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "title" TEXT,
    "thumbnailUrl" TEXT,
    "subscriberCount" INTEGER,
    "uploadsPlaylistId" TEXT,
    "syncedAt" DATETIME,
    "autoDiagnose" BOOLEAN NOT NULL DEFAULT false,
    "analyticsNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MyChannel" ("audience", "characters", "concept", "createdAt", "durationSec", "externalId", "format", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "platforms", "rules", "status", "storyFormats", "tone", "updatedAt", "url", "visualStyle") SELECT "audience", "characters", "concept", "createdAt", "durationSec", "externalId", "format", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "platforms", "rules", "status", "storyFormats", "tone", "updatedAt", "url", "visualStyle" FROM "MyChannel";
DROP TABLE "MyChannel";
ALTER TABLE "new_MyChannel" RENAME TO "MyChannel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MyVideoDiagnosis_myVideoId_createdAt_idx" ON "MyVideoDiagnosis"("myVideoId", "createdAt");

-- CreateIndex
CREATE INDEX "MyChannelReport_myChannelId_createdAt_idx" ON "MyChannelReport"("myChannelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAuth_channelExternalId_key" ON "GoogleAuth"("channelExternalId");

-- CreateIndex
CREATE INDEX "MyVideo_myChannelId_publishedAt_idx" ON "MyVideo"("myChannelId", "publishedAt");

