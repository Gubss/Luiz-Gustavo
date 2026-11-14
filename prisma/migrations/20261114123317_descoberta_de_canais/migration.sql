-- CreateTable
CREATE TABLE "DiscoverySearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "query" TEXT,
    "format" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "unitsUsed" INTEGER NOT NULL,
    "videosFound" INTEGER NOT NULL DEFAULT 0,
    "newChannels" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoverySearch_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveredChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "thumbnailUrl" TEXT,
    "country" TEXT,
    "subscriberCount" INTEGER,
    "hiddenSubscribers" BOOLEAN NOT NULL DEFAULT false,
    "videoCount" INTEGER,
    "viewCount" REAL,
    "channelCreatedAt" DATETIME,
    "matchedVideos" TEXT NOT NULL DEFAULT '[]',
    "shortHits" INTEGER NOT NULL DEFAULT 0,
    "longHits" INTEGER NOT NULL DEFAULT 0,
    "bestViews" INTEGER NOT NULL DEFAULT 0,
    "bestRatio" REAL,
    "score" REAL NOT NULL DEFAULT 0,
    "queries" TEXT NOT NULL DEFAULT '[]',
    "featuredBy" TEXT NOT NULL DEFAULT '[]',
    "analysis" TEXT,
    "analyzedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'new',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveredChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiscoverySearch_nicheId_createdAt_idx" ON "DiscoverySearch"("nicheId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscoveredChannel_nicheId_status_idx" ON "DiscoveredChannel"("nicheId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredChannel_nicheId_platform_externalId_key" ON "DiscoveredChannel"("nicheId", "platform", "externalId");
