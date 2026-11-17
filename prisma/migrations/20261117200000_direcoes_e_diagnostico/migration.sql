-- CreateTable
CREATE TABLE "Direction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "directionGeneral" TEXT,
    "directionScene" TEXT,
    "directionPhotography" TEXT,
    "directionSound" TEXT,
    "study" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "copiedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MyChannel" (
    "durationMinSec" INTEGER,
    "durationMaxSec" INTEGER,
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
    "examples" TEXT,
    "durationSec" INTEGER,
    "catalogFetchedAt" DATETIME,
    "analytics" TEXT,
    "analyticsAt" DATETIME,
    "profileImportedAt" DATETIME,
    "title" TEXT,
    "thumbnailUrl" TEXT,
    "subscriberCount" INTEGER,
    "uploadsPlaylistId" TEXT,
    "syncedAt" DATETIME,
    "autoDiagnose" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultDirectionId" TEXT,
    CONSTRAINT "MyChannel_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MyChannel_defaultDirectionId_fkey" FOREIGN KEY ("defaultDirectionId") REFERENCES "Direction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MyChannel" ("analytics", "analyticsAt", "audience", "autoDiagnose", "catalogFetchedAt", "characters", "concept", "createdAt", "durationMaxSec", "durationMinSec", "durationSec", "examples", "externalId", "format", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "platforms", "profileImportedAt", "rules", "status", "storyFormats", "subscriberCount", "syncedAt", "thumbnailUrl", "title", "tone", "updatedAt", "uploadsPlaylistId", "url", "visualStyle") SELECT "analytics", "analyticsAt", "audience", "autoDiagnose", "catalogFetchedAt", "characters", "concept", "createdAt", "durationMaxSec", "durationMinSec", "durationSec", "examples", "externalId", "format", "id", "name", "nicheId", "notes", "oauthConnected", "platform", "platforms", "profileImportedAt", "rules", "status", "storyFormats", "subscriberCount", "syncedAt", "thumbnailUrl", "title", "tone", "updatedAt", "uploadsPlaylistId", "url", "visualStyle" FROM "MyChannel";
DROP TABLE "MyChannel";
ALTER TABLE "new_MyChannel" RENAME TO "MyChannel";
CREATE TABLE "new_VideoFormat" (
    "directionGeneral" TEXT,
    "directionScene" TEXT,
    "directionPhotography" TEXT,
    "directionSound" TEXT,
    "narrativeRules" TEXT,
    "directionStudy" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "nicheId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "length" TEXT NOT NULL DEFAULT 'short',
    "gaps" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "directionId" TEXT,
    "reportId" TEXT,
    CONSTRAINT "VideoFormat_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VideoFormat_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "Direction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VideoFormat_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MyChannelReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VideoFormat" ("createdAt", "description", "directionGeneral", "directionPhotography", "directionScene", "directionSound", "directionStudy", "gaps", "id", "length", "name", "narrativeRules", "nicheId", "updatedAt") SELECT "createdAt", "description", "directionGeneral", "directionPhotography", "directionScene", "directionSound", "directionStudy", "gaps", "id", "length", "name", "narrativeRules", "nicheId", "updatedAt" FROM "VideoFormat";
DROP TABLE "VideoFormat";
ALTER TABLE "new_VideoFormat" RENAME TO "VideoFormat";
CREATE INDEX "VideoFormat_nicheId_idx" ON "VideoFormat"("nicheId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- DADOS v3 (idempotente; o teste tests/directions.test.ts roda este bloco de novo)
-- As 4 instruções de direção de cada formato viram uma Direção reutilizável, sem mudar o texto.
-- "Desmontando o Mundo" vira "Padrão do canal — família 3D".
INSERT INTO "Direction" ("id", "name", "description", "directionGeneral", "directionScene", "directionPhotography", "directionSound", "study", "origin", "createdAt", "updatedAt")
SELECT 'dir_' || f."id",
       CASE WHEN f."name" = 'Desmontando o Mundo' THEN 'Padrão do canal — família 3D' ELSE 'Direção do formato ' || f."name" END,
       'Veio das instruções do formato "' || f."name" || '" (migração v3, texto sem mudança).',
       f."directionGeneral", f."directionScene", f."directionPhotography", f."directionSound", f."directionStudy", 'migracao',
       CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "VideoFormat" f
WHERE f."directionId" IS NULL
  AND (COALESCE(f."directionGeneral", '') <> '' OR COALESCE(f."directionScene", '') <> '' OR COALESCE(f."directionPhotography", '') <> '' OR COALESCE(f."directionSound", '') <> '')
  AND NOT EXISTS (SELECT 1 FROM "Direction" d WHERE d."id" = 'dir_' || f."id");
-- O formato passa a apontar para a direção criada.
UPDATE "VideoFormat" SET "directionId" = 'dir_' || "id"
WHERE "directionId" IS NULL AND EXISTS (SELECT 1 FROM "Direction" d WHERE d."id" = 'dir_' || "VideoFormat"."id");
-- Padrão do canal: a direção do formato ligado ao canal (Desmontando o Mundo primeiro).
UPDATE "MyChannel" SET "defaultDirectionId" = (
  SELECT f."directionId" FROM "ChannelFormat" cf JOIN "VideoFormat" f ON f."id" = cf."formatId"
  WHERE cf."myChannelId" = "MyChannel"."id" AND f."directionId" IS NOT NULL
  ORDER BY (f."name" = 'Desmontando o Mundo') DESC, f."createdAt" LIMIT 1)
WHERE "defaultDirectionId" IS NULL;
