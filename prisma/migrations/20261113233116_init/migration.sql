-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QuotaLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotaDay" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "unitsUsed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Niche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "country" TEXT,
    "subscriberCount" INTEGER,
    "hiddenSubscribers" BOOLEAN NOT NULL DEFAULT false,
    "videoCount" INTEGER,
    "viewCount" REAL,
    "uploadsPlaylistId" TEXT,
    "channelCreatedAt" DATETIME,
    "statsFetchedAt" DATETIME,
    "videosFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "catalogFetchedAt" DATETIME
);

-- CreateTable
CREATE TABLE "NicheChannel" (
    "nicheId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("nicheId", "channelId"),
    CONSTRAINT "NicheChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NicheChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogEntry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "channelId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "subscriberCount" INTEGER,
    "videoCount" INTEGER,
    "viewCount" REAL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MyChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "nicheId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESEARCH',
    "notes" TEXT,
    "oauthConnected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Video" (
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
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "defaultLang" TEXT,
    "statsFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoSnapshot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transcript_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metrics" TEXT,
    "markdown" TEXT,
    "usedTranscript" BOOLEAN NOT NULL DEFAULT false,
    "commentsAnalysis" TEXT,
    "commentsModel" TEXT,
    "commentsAnalyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Diagnosis_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScriptStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "isShort" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "beats" TEXT,
    "wordsPerSec" REAL,
    "avgBeatInterval" REAL,
    "maxBeatGap" REAL,
    "durationSec" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptStructure_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NichePlaybook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "stats" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "diagnosisCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NichePlaybook_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT,
    "myChannelId" TEXT,
    "format" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "justification" TEXT,
    "titles" TEXT NOT NULL,
    "chosenTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "script" TEXT,
    "scriptModel" TEXT,
    "referenceIds" TEXT,
    "structureIds" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MyVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "myChannelId" TEXT NOT NULL,
    "title" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" DATETIME,
    "durationSec" INTEGER,
    "isShort" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "statsFetchedAt" DATETIME,
    "inspiredVideoId" TEXT,
    "inspiredIdeaId" TEXT,
    "ctr" REAL,
    "impressions" INTEGER,
    "avgViewDuration" REAL,
    "avgViewPercent" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyVideo_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MyVideo_inspiredVideoId_fkey" FOREIGN KEY ("inspiredVideoId") REFERENCES "Video" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MyVideo_inspiredIdeaId_fkey" FOREIGN KEY ("inspiredIdeaId") REFERENCES "Idea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MyVideoSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "myVideoId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MyVideoSnapshot_myVideoId_fkey" FOREIGN KEY ("myVideoId") REFERENCES "MyVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MyVideoCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myVideoId" TEXT NOT NULL,
    "ageHours" INTEGER NOT NULL,
    "measuredAgeMin" INTEGER,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "stayedPct" REAL,
    "avgViewPct" REAL,
    "avgViewDuration" REAL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyVideoCheckpoint_myVideoId_fkey" FOREIGN KEY ("myVideoId") REFERENCES "MyVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuotaLog_quotaDay_idx" ON "QuotaLog"("quotaDay");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_platform_externalId_key" ON "Channel"("platform", "externalId");

-- CreateIndex
CREATE INDEX "CatalogEntry_channelId_idx" ON "CatalogEntry"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_channelId_externalId_key" ON "CatalogEntry"("channelId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSnapshot_channelId_day_key" ON "ChannelSnapshot"("channelId", "day");

-- CreateIndex
CREATE INDEX "Video_channelId_publishedAt_idx" ON "Video"("channelId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_platform_externalId_key" ON "Video"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSnapshot_videoId_day_key" ON "VideoSnapshot"("videoId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_videoId_key" ON "Favorite"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_videoId_key" ON "Transcript"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_videoId_key" ON "Diagnosis"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptStructure_videoId_key" ON "ScriptStructure"("videoId");

-- CreateIndex
CREATE INDEX "NichePlaybook_nicheId_createdAt_idx" ON "NichePlaybook"("nicheId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MyVideo_platform_externalId_key" ON "MyVideo"("platform", "externalId");

-- CreateIndex
CREATE INDEX "MyVideoSnapshot_myVideoId_capturedAt_idx" ON "MyVideoSnapshot"("myVideoId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MyVideoCheckpoint_myVideoId_ageHours_key" ON "MyVideoCheckpoint"("myVideoId", "ageHours");
