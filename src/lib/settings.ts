import { prisma } from "./db";

export type Settings = {
  youtubeApiKey: string;
  anthropicApiKey: string;
  windowDays: number;
  avgN: number;
  shortMaxSec: number;
  multiplier: number;
  minViews: number;
  smallChannelMaxSubs: number;
  smallChannelMinRatio: number;
  modelFast: string;
  modelDeep: string;
  dailyQuota: number;
};

export const DEFAULT_SETTINGS: Settings = {
  youtubeApiKey: "",
  anthropicApiKey: "",
  windowDays: 30,
  avgN: 15,
  shortMaxSec: 180,
  multiplier: 3,
  minViews: 10000,
  // Canal pequeno que estourou: até X inscritos e vídeo >= Y vezes os inscritos
  smallChannelMaxSubs: 50000,
  smallChannelMinRatio: 10,
  modelFast: "claude-sonnet-5-5",
  modelDeep: "claude-opus-5-5",
  dailyQuota: 10000,
};

const NUMERIC: (keyof Settings)[] = [
  "windowDays",
  "avgN",
  "shortMaxSec",
  "multiplier",
  "minViews",
  "smallChannelMaxSubs",
  "smallChannelMinRatio",
  "dailyQuota",
];

/** Lê as configurações: valores salvos no banco sobrescrevem .env e padrões. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  };
  for (const r of rows) {
    if (!(r.key in s) || r.value === "") continue;
    const k = r.key as keyof Settings;
    (s as Record<string, unknown>)[k] = NUMERIC.includes(k) ? Number(r.value) : r.value;
  }
  return s;
}

export async function saveSetting(key: keyof Settings, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
