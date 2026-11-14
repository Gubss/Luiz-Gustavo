-- Etapa 3: estudo do vídeo (origem/importação, custo, comentários).
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "costUsd" REAL;
ALTER TABLE "Generation" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "Generation" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "Generation" ADD COLUMN "videoId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Diagnosis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'app',
    "model" TEXT,
    "effort" TEXT,
    "content" TEXT,
    "metrics" TEXT,
    "markdown" TEXT,
    "usedTranscript" BOOLEAN NOT NULL DEFAULT false,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "diagnosedAt" DATETIME,
    "commentsRaw" TEXT,
    "commentsFetchedAt" DATETIME,
    "commentsAnalysis" TEXT,
    "commentsModel" TEXT,
    "commentsCostUsd" REAL,
    "commentsAnalyzedAt" DATETIME,
    "importSource" TEXT,
    "importKey" TEXT,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Diagnosis_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Diagnosis" ("commentsAnalysis", "commentsAnalyzedAt", "commentsModel", "content", "createdAt", "id", "markdown", "metrics", "model", "updatedAt", "usedTranscript", "videoId") SELECT "commentsAnalysis", "commentsAnalyzedAt", "commentsModel", "content", "createdAt", "id", "markdown", "metrics", "model", "updatedAt", "usedTranscript", "videoId" FROM "Diagnosis";
DROP TABLE "Diagnosis";
ALTER TABLE "new_Diagnosis" RENAME TO "Diagnosis";
CREATE UNIQUE INDEX "Diagnosis_videoId_key" ON "Diagnosis"("videoId");
CREATE UNIQUE INDEX "Diagnosis_importKey_key" ON "Diagnosis"("importKey");
CREATE TABLE "new_ScriptStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "isShort" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "beats" TEXT,
    "wordsPerSec" REAL,
    "avgBeatInterval" REAL,
    "maxBeatGap" REAL,
    "durationSec" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'app',
    "importKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScriptStructure_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScriptStructure" ("avgBeatInterval", "beats", "content", "createdAt", "durationSec", "id", "isShort", "maxBeatGap", "videoId", "wordsPerSec", "updatedAt") SELECT "avgBeatInterval", "beats", "content", "createdAt", "durationSec", "id", "isShort", "maxBeatGap", "videoId", "wordsPerSec", CURRENT_TIMESTAMP FROM "ScriptStructure";
DROP TABLE "ScriptStructure";
ALTER TABLE "new_ScriptStructure" RENAME TO "ScriptStructure";
CREATE UNIQUE INDEX "ScriptStructure_videoId_key" ON "ScriptStructure"("videoId");
CREATE UNIQUE INDEX "ScriptStructure_importKey_key" ON "ScriptStructure"("importKey");
CREATE TABLE "new_Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "trackKind" TEXT,
    "text" TEXT NOT NULL,
    "segments" TEXT,
    "wordCount" INTEGER,
    "importSource" TEXT,
    "importKey" TEXT,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transcript_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transcript" ("createdAt", "id", "language", "segments", "source", "text", "videoId", "updatedAt") SELECT "createdAt", "id", "language", "segments", "source", "text", "videoId", CURRENT_TIMESTAMP FROM "Transcript";
DROP TABLE "Transcript";
ALTER TABLE "new_Transcript" RENAME TO "Transcript";
CREATE UNIQUE INDEX "Transcript_videoId_key" ON "Transcript"("videoId");
CREATE UNIQUE INDEX "Transcript_importKey_key" ON "Transcript"("importKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt");
