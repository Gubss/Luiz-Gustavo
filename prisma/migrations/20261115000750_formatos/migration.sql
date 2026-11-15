-- CreateTable
CREATE TABLE "VideoFormat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "length" TEXT NOT NULL DEFAULT 'short',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoFormat_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormatVideo" (
    "formatId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("formatId", "videoId"),
    CONSTRAINT "FormatVideo_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormatVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormatRecipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formatId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "stats" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "markdown" TEXT,
    "voice" TEXT NOT NULL DEFAULT '[]',
    "videoIds" TEXT NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormatRecipe_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NicheRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "length" TEXT NOT NULL DEFAULT 'short',
    "version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "recipeIds" TEXT NOT NULL,
    "formatNames" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "markdown" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NicheRule_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelFormat" (
    "myChannelId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "howText" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("myChannelId", "formatId"),
    CONSTRAINT "ChannelFormat_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelFormat_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myChannelId" TEXT NOT NULL,
    "ideaId" TEXT,
    "formatId" TEXT,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'devolucao',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelLesson_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelLesson_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChannelLesson_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Idea" (
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
    "playbookId" TEXT,
    "ideaData" TEXT,
    "scriptData" TEXT,
    "ideaCostUsd" REAL,
    "scriptCostUsd" REAL,
    "publishedVideoId" TEXT,
    "formatId" TEXT,
    "recipeId" TEXT,
    "ruleId" TEXT,
    "returnNotes" TEXT,
    "returnedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_publishedVideoId_fkey" FOREIGN KEY ("publishedVideoId") REFERENCES "MyChannelVideo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Idea" ("chosenTitle", "createdAt", "format", "id", "ideaCostUsd", "ideaData", "justification", "myChannelId", "nicheId", "notes", "playbookId", "publishedVideoId", "referenceIds", "script", "scriptCostUsd", "scriptData", "scriptModel", "status", "structureIds", "theme", "titles", "updatedAt") SELECT "chosenTitle", "createdAt", "format", "id", "ideaCostUsd", "ideaData", "justification", "myChannelId", "nicheId", "notes", "playbookId", "publishedVideoId", "referenceIds", "script", "scriptCostUsd", "scriptData", "scriptModel", "status", "structureIds", "theme", "titles", "updatedAt" FROM "Idea";
DROP TABLE "Idea";
ALTER TABLE "new_Idea" RENAME TO "Idea";
CREATE TABLE "new_MyChannelScript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "myChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "script" TEXT NOT NULL,
    "views" INTEGER,
    "notes" TEXT,
    "formatId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MyChannelScript_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MyChannelScript_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "VideoFormat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MyChannelScript" ("createdAt", "id", "myChannelId", "notes", "script", "title", "updatedAt", "url", "views") SELECT "createdAt", "id", "myChannelId", "notes", "script", "title", "updatedAt", "url", "views" FROM "MyChannelScript";
DROP TABLE "MyChannelScript";
ALTER TABLE "new_MyChannelScript" RENAME TO "MyChannelScript";
CREATE INDEX "MyChannelScript_myChannelId_idx" ON "MyChannelScript"("myChannelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VideoFormat_nicheId_idx" ON "VideoFormat"("nicheId");

-- CreateIndex
CREATE UNIQUE INDEX "FormatVideo_nicheId_videoId_key" ON "FormatVideo"("nicheId", "videoId");

-- CreateIndex
CREATE INDEX "FormatRecipe_formatId_createdAt_idx" ON "FormatRecipe"("formatId", "createdAt");

-- CreateIndex
CREATE INDEX "NicheRule_nicheId_length_createdAt_idx" ON "NicheRule"("nicheId", "length", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelLesson_myChannelId_createdAt_idx" ON "ChannelLesson"("myChannelId", "createdAt");
