-- Escopo da lição: "canal" vale em todos os formatos; "formato" (padrão das lições antigas) só no formato de origem.
ALTER TABLE "ChannelLesson" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'formato';
