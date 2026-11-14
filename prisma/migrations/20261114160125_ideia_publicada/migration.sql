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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_myChannelId_fkey" FOREIGN KEY ("myChannelId") REFERENCES "MyChannel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Idea_publishedVideoId_fkey" FOREIGN KEY ("publishedVideoId") REFERENCES "MyChannelVideo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Idea" ("chosenTitle", "createdAt", "format", "id", "ideaCostUsd", "ideaData", "justification", "myChannelId", "nicheId", "notes", "playbookId", "referenceIds", "script", "scriptCostUsd", "scriptData", "scriptModel", "status", "structureIds", "theme", "titles", "updatedAt") SELECT "chosenTitle", "createdAt", "format", "id", "ideaCostUsd", "ideaData", "justification", "myChannelId", "nicheId", "notes", "playbookId", "referenceIds", "script", "scriptCostUsd", "scriptData", "scriptModel", "status", "structureIds", "theme", "titles", "updatedAt" FROM "Idea";
DROP TABLE "Idea";
ALTER TABLE "new_Idea" RENAME TO "Idea";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
