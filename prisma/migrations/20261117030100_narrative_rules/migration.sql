ALTER TABLE "VideoFormat" ADD COLUMN "narrativeRules" TEXT;
ALTER TABLE "MyChannel" ADD COLUMN "durationMinSec" INTEGER;
ALTER TABLE "MyChannel" ADD COLUMN "durationMaxSec" INTEGER;
UPDATE "MyChannel" SET "durationMinSec"=60,"durationMaxSec"=180,"durationSec"=NULL WHERE "id"='cmwib6qdk000lfs6kkweb4a98';
