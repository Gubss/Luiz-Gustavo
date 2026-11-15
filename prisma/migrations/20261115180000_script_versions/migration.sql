ALTER TABLE "MyChannelScript" ADD COLUMN "integrity" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Idea" ADD COLUMN "projectCode" TEXT;
ALTER TABLE "Idea" ADD COLUMN "currentVersionId" TEXT REFERENCES "ScriptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD COLUMN "approvedVersionId" TEXT REFERENCES "ScriptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Generation" ADD COLUMN "scriptVersionId" TEXT REFERENCES "ScriptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ScriptVersion" (
 "id" TEXT NOT NULL PRIMARY KEY, "ideaId" TEXT NOT NULL, "number" INTEGER NOT NULL,
 "baseVersionId" TEXT, "content" TEXT NOT NULL, "markdown" TEXT NOT NULL,
 "request" TEXT, "category" TEXT NOT NULL, "origin" TEXT NOT NULL, "author" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("baseVersionId") REFERENCES "ScriptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScriptVersion_ideaId_number_key" ON "ScriptVersion"("ideaId", "number");
CREATE UNIQUE INDEX "Idea_myChannelId_projectCode_key" ON "Idea"("myChannelId", "projectCode");
CREATE UNIQUE INDEX "Idea_currentVersionId_key" ON "Idea"("currentVersionId");
CREATE UNIQUE INDEX "Idea_approvedVersionId_key" ON "Idea"("approvedVersionId");
