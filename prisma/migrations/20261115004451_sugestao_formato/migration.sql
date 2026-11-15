-- AlterTable
ALTER TABLE "VideoFormat" ADD COLUMN "gaps" TEXT;

-- CreateTable
CREATE TABLE "FormatSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "formatId" TEXT,
    "reason" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "costUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "chosen" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormatSuggestion_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormatSuggestion_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormatSuggestion_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FormatSuggestion_nicheId_status_idx" ON "FormatSuggestion"("nicheId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FormatSuggestion_videoId_nicheId_key" ON "FormatSuggestion"("videoId", "nicheId");
