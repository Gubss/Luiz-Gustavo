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
  /** Limite de gasto com o Claude no mês, em US$. 0 = sem limite. */
  monthlyBudgetUsd: number;
  /** Câmbio usado só para mostrar valores em reais. */
  dollarBrl: number;
  /** Coleta sozinho ao abrir o app quando a última coleta tem mais de `autoCollectHours`. */
  autoCollect: boolean;
  autoCollectHours: number;
  /** Acompanhamento dos meus vídeos a cada 5 min com o app aberto. */
  tracker: boolean;
  /** Teto de diagnósticos automáticos de vídeos meus por dia (somando os canais). */
  autoDiagnoseMaxPerDay: number;
  /** Cópia de segurança do banco 1 vez por semana (com o app aberto). */
  autoBackup: boolean;
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
  monthlyBudgetUsd: 0,
  dollarBrl: 5.6,
  autoCollect: true,
  autoCollectHours: 20,
  tracker: true,
  autoDiagnoseMaxPerDay: 6,
  autoBackup: true,
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
  "monthlyBudgetUsd",
  "dollarBrl",
  "autoCollectHours",
  "autoDiagnoseMaxPerDay",
];

const BOOLEAN: (keyof Settings)[] = ["autoCollect", "tracker", "autoBackup"];

export const SECRET_KEYS = ["youtubeApiKey", "anthropicApiKey"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
const ENV_OF: Record<SecretKey, string> = { youtubeApiKey: "YOUTUBE_API_KEY", anthropicApiKey: "ANTHROPIC_API_KEY" };

/** Último câmbio lido, para as funções síncronas que mostram reais (ver `usdToBrl`). */
let dollarCache: number | null = null;
export const cachedDollarBrl = () => dollarCache;

/** Lê as configurações: valores salvos no banco (tela Configurações) sobrescrevem .env e padrões. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(DEFAULT_SETTINGS) } } });
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    dollarBrl: Number(process.env.DOLAR_BRL) || DEFAULT_SETTINGS.dollarBrl,
  };
  for (const r of rows) {
    if (!(r.key in s) || r.value === "") continue;
    const k = r.key as keyof Settings;
    const v = NUMERIC.includes(k) ? Number(r.value) : BOOLEAN.includes(k) ? r.value === "1" || r.value === "true" : r.value;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    (s as Record<string, unknown>)[k] = v;
  }
  dollarCache = s.dollarBrl;
  return s;
}

export async function saveSetting(key: keyof Settings, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Volta ao valor do .env / padrão. */
export async function resetSetting(key: keyof Settings) {
  await prisma.setting.deleteMany({ where: { key } });
}

/** De onde vem cada chave: salva aqui (banco), do arquivo .env, ou nenhuma. */
export async function secretStatus(key: SecretKey): Promise<{ source: "app" | "env" | "none"; masked: string; envAlso: boolean }> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const env = process.env[ENV_OF[key]] ?? "";
  const value = row?.value || env;
  return { source: row?.value ? "app" : env ? "env" : "none", masked: maskSecret(value), envAlso: !!env };
}

/** "AIzaSy…k9Qw" — só o começo e o fim, para conferir qual chave está em uso. */
export function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 10) return "•".repeat(v.length);
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}
