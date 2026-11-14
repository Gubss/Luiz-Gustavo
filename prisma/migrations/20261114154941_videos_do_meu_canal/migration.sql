-- AlterTable
ALTER TABLE "MyChannel" ADD COLUMN "catalogFetchedAt" DATETIME;

-- CreateTable
CREATE TABLE "MyChannelVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myChannelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "durationSec" INTEGER,
    "isShort" BOOLEAN,
    "viewCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannelVideo_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MyChannelVideo_myChannelId_publishedAt_idx" ON "MyChannelVideo"("myChannelId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MyChannelVideo_myChannelId_externalId_key" ON "MyChannelVideo"("myChannelId", "externalId");
