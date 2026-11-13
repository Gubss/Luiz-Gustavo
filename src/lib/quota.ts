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
  "search.list": 100,
} as const;

export type QuotaEndpoint = keyof typeof QUOTA_COST;

export async function logQuota(endpoint: QuotaEndpoint) {
  await prisma.quotaLog.create({
    data: { quotaDay: quotaDay(), endpoint, units: QUOTA_COST[endpoint] },
  });
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
