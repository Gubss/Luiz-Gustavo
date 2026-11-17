CREATE TABLE "DirectionRun" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "versionId" TEXT NOT NULL,
 "sourceHash" TEXT NOT NULL,
 "study" TEXT NOT NULL,
 "reference" TEXT NOT NULL,
 "scene" TEXT,
 "photography" TEXT,
 "sound" TEXT,
 "integration" TEXT,
 "runningStage" TEXT,
 "error" TEXT,
 "costUsd" REAL NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "DirectionRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ScriptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DirectionRun_versionId_key" ON "DirectionRun"("versionId");
