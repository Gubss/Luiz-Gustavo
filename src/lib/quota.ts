import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "./db";

/** Data atual no fuso do Pacífico — o Google zera a cota à meia-noite de lá. */
export function quotaDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Custos oficiais em unidades por chamada da YouTube Data API v3. */
export const QUOTA_COST = {
  "channels.list": 1,
  "videos.list": 1,
  "playlistItems.list": 1,
  "commentThreads.list": 1,
  "channelSections.list": 1,
  "search.list": 100,
} as const;

export type QuotaEndpoint = keyof typeof QUOTA_COST;

/**
 * Quem está gastando a cota agora (coleta, acompanhamento, uma tarefa em segundo plano…).
 * Tudo que roda dentro de `withQuotaSource` registra a origem em QuotaLog, para a tela de Configurações
 * mostrar o que mais consome.
 */
const quotaSource = new AsyncLocalStorage<string>();

export function withQuotaSource<T>(source: string, fn: () => Promise<T>): Promise<T> {
  return quotaSource.run(source, fn);
}

export async function logQuota(endpoint: QuotaEndpoint) {
  await prisma.quotaLog.create({
    data: { quotaDay: quotaDay(), endpoint, units: QUOTA_COST[endpoint], source: quotaSource.getStore() ?? null },
  });
}

/** Nome amigável de cada origem de gasto (tarefas em segundo plano e rotinas). */
export const QUOTA_SOURCE_LABEL: Record<string, string> = {
  coleta: "Coleta diária do radar",
  acompanhamento: "Acompanhamento dos meus vídeos",
  discover: "Descobrir canais (buscas)",
  xray: "Raio-x de canais",
  channels: "Adicionar/atualizar canais de um nicho",
  study: "Estudar tudo",
  comments: "Comentários do estudo",
  diagnosis: "Diagnóstico do estudo",
  "my-videos": "Ler os vídeos do meu canal",
  "my-refresh": "Atualizar um vídeo meu",
  "my-channel-refresh": "Atualizar os vídeos do meu canal",
  "my-diagnosis": "Diagnóstico de vídeo meu",
  "my-channel-report": "Diagnóstico do meu canal",
  "profile-from-channel": "Perfil a partir do meu canal",
  "key-test": "Teste da chave (Configurações)",
};

export const quotaSourceLabel = (s: string | null) => (s ? (QUOTA_SOURCE_LABEL[s] ?? s) : "Outras ações (botões na tela)");

/** Quando a cota renova: próxima meia-noite no fuso do Pacífico. */
export function quotaResetAt(now = new Date()): Date {
  // acha o deslocamento do Pacífico agora (PST -8 / PDT -7)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000; // negativo no Pacífico
  const nextMidnightLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day + 1);
  return new Date(nextMidnightLocal - offsetMs);
}

/** Gasto de cota de um dia: por origem e por tipo de chamada. */
export async function quotaBreakdown(day = quotaDay()) {
  const [bySource, byEndpoint] = await Promise.all([
    prisma.quotaLog.groupBy({ by: ["source"], where: { quotaDay: day }, _sum: { units: true }, _count: true }),
    prisma.quotaLog.groupBy({ by: ["endpoint"], where: { quotaDay: day }, _sum: { units: true }, _count: true }),
  ]);
  return {
    bySource: bySource
      .map((r) => ({ source: r.source, label: quotaSourceLabel(r.source), units: r._sum.units ?? 0, calls: r._count }))
      .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label, "pt-BR")),
    byEndpoint: byEndpoint.map((r) => ({ endpoint: r.endpoint, units: r._sum.units ?? 0, calls: r._count })).sort((a, b) => b.units - a.units),
  };
}

/** Unidades gastas por dia nos últimos `days` dias (dia do Pacífico), do mais antigo ao de hoje. */
export async function quotaHistory(days = 14, now = new Date()) {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(quotaDay(new Date(now.getTime() - i * 86_400_000)));
  const rows = await prisma.quotaLog.groupBy({ by: ["quotaDay"], where: { quotaDay: { in: keys } }, _sum: { units: true } });
  const m = new Map(rows.map((r) => [r.quotaDay, r._sum.units ?? 0]));
  return [...new Set(keys)].map((d) => ({ day: d, units: m.get(d) ?? 0 }));
}

export async function quotaUsedToday(): Promise<number> {
  const agg = await prisma.quotaLog.aggregate({
    where: { quotaDay: quotaDay() },
    _sum: { units: true },
  });
  return agg._sum.units ?? 0;
}

/** Dia local (America/Sao_Paulo) usado nas chaves de snapshot diário. */
export function localDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
