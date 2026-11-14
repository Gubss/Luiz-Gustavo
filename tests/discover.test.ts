/**
 * Etapa 4 — descoberta de canais. API do YouTube simulada (sem chave real, sem cota real).
 * Usa o banco descartável prisma/test-discover.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-discover.db";
process.env.YOUTUBE_API_KEY = "test-key";
for (const f of ["prisma/test-discover.db", "prisma/test-discover.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const DAY = 86_400_000;
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
const uc = (s: string) => `UC${s.padEnd(22, "x")}`;

// Canais: "jamonitorado" já está no nicho; "pequeno" estourou; "longos" só faz vídeo longo; "indicado" vem da página de outro.
const CH: Record<string, { title: string; subs: number; created: number }> = {
  [uc("jamonitorado")]: { title: "Canal Já Monitorado", subs: 500_000, created: 2000 },
  [uc("pequeno")]: { title: "Canal Pequeno", subs: 8_000, created: 120 },
  [uc("grande")]: { title: "Canal Grande", subs: 2_000_000, created: 3000 },
  [uc("longos")]: { title: "Canal de Longos", subs: 90_000, created: 900 },
  [uc("indicado")]: { title: "Canal Indicado", subs: 40_000, created: 700 },
};
type V = { id: string; ch: string; dur: string; views: number; days: number; live?: boolean };
const VIDEOS: V[] = [
  { id: "vid_mon_001", ch: uc("jamonitorado"), dur: "PT40S", views: 2_000_000, days: 10 },
  { id: "vid_peq_001", ch: uc("pequeno"), dur: "PT50S", views: 900_000, days: 6 },
  { id: "vid_peq_002", ch: uc("pequeno"), dur: "PT1M30S", views: 300_000, days: 9 }, // 90s, mas Short pela URL
  { id: "vid_grd_001", ch: uc("grande"), dur: "PT55S", views: 3_000_000, days: 20 },
  { id: "vid_grd_002", ch: uc("grande"), dur: "PT2M10S", views: 50_000, days: 3 }, // 130s horizontal: não é Short
  { id: "vid_lng_001", ch: uc("longos"), dur: "PT14M", views: 400_000, days: 15 },
  { id: "vid_live001", ch: uc("longos"), dur: "PT50S", views: 9_000_000, days: 2, live: true },
];
// Uploads recentes do "Canal Indicado" para o raio-x: 8 Shorts e 2 longos
const UPLOADS = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `ind_s_${String(i).padStart(5, "0")}`, ch: uc("indicado"), dur: "PT45S", views: i === 0 ? 500_000 : 20_000, days: 1 + i * 3 })),
  { id: "ind_l_00001", ch: uc("indicado"), dur: "PT10M", views: 30_000, days: 5 },
  { id: "ind_l_00002", ch: uc("indicado"), dur: "PT11M", views: 32_000, days: 12 },
];
const ALL: V[] = [...VIDEOS, ...UPLOADS];

const searches: URLSearchParams[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === "www.youtube.com" && url.pathname.startsWith("/shorts/")) {
    const id = url.pathname.split("/")[2];
    return id === "vid_grd_002"
      ? new Response(null, { status: 303, headers: { location: `https://www.youtube.com/watch?v=${id}` } })
      : new Response(null, { status: 200 });
  }
  assert.equal(new Headers(init?.headers).get("X-goog-api-key"), "test-key");
  const ep = url.pathname.split("/").pop()!;
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const p = url.searchParams;
  if (ep === "search") {
    searches.push(p);
    return json({ items: VIDEOS.map((v) => ({ id: { kind: "youtube#video", videoId: v.id }, snippet: { channelId: v.ch, title: v.id, publishedAt: iso(v.days) } })) });
  }
  if (ep === "videos")
    return json({
      items: p.get("id")!.split(",").map((id) => ALL.find((v) => v.id === id)!).map((v) => ({
        id: v.id,
        snippet: { channelId: v.ch, title: `Título ${v.id}`, publishedAt: iso(v.days), liveBroadcastContent: "none", thumbnails: { high: { url: "https://i.ytimg.com/x.jpg" } } },
        contentDetails: { duration: v.dur },
        statistics: { viewCount: String(v.views) },
        ...(v.live ? { liveStreamingDetails: { actualStartTime: iso(v.days) } } : {}),
      })),
    });
  if (ep === "channels")
    return json({
      items: p.get("id")!.split(",").filter((id) => CH[id]).map((id) => ({
        id,
        snippet: { title: CH[id].title, customUrl: `@${CH[id].title.replace(/\s/g, "").toLowerCase()}`, publishedAt: iso(CH[id].created) },
        statistics: { subscriberCount: String(CH[id].subs), videoCount: "100", viewCount: "1000000" },
        contentDetails: { relatedPlaylists: { uploads: "UU" + id.slice(2) } },
      })),
    });
  if (ep === "channelSections")
    return json({ items: [{ snippet: { type: "multiplechannels" }, contentDetails: { channels: [uc("indicado"), p.get("channelId")] } }] });
  if (ep === "playlistItems")
    return json({ items: UPLOADS.map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: iso(v.days) }, snippet: { title: v.id, publishedAt: iso(v.days) } })) });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

type D = typeof import("../src/lib/discover");
let d: D;
let prisma: typeof import("../src/lib/db").prisma;
let quotaUsedToday: typeof import("../src/lib/quota").quotaUsedToday;
before(async () => {
  d = await import("../src/lib/discover");
  prisma = (await import("../src/lib/db")).prisma;
  quotaUsedToday = (await import("../src/lib/quota")).quotaUsedToday;
});

test("custo estimado e pontuação", () => {
  assert.equal(d.estimateSearchCost(1), 102);
  assert.equal(d.estimateSearchCost(3), 306);
  assert.equal(d.estimateFeaturedCost(10), 11);
  const big = d.discoveryScore({ bestViews: 1_000_000, bestRatio: 0.5, hits: 1, channelCreatedAt: new Date(now - 3000 * DAY) });
  const small = d.discoveryScore({ bestViews: 900_000, bestRatio: 112, hits: 2, channelCreatedAt: new Date(now - 100 * DAY) });
  assert.ok(small > big, `pequeno que estourou deve vir antes (${small} x ${big})`);
});

test("busca por palavra-chave respeita o formato e não repete canais monitorados", async () => {
  const niche = await prisma.niche.create({ data: { name: "Curiosidades" } });
  const mon = await prisma.channel.create({ data: { externalId: uc("jamonitorado"), title: "Canal Já Monitorado" } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: mon.id } });

  const before = await quotaUsedToday();
  const r = await d.discoverBySearch({ nicheId: niche.id, keywords: ["e se", "curiosidades"], format: "short", days: 30, order: "viewCount", language: "pt", region: "BR" });
  // 2 buscas (200) + 1 lote de vídeos + 1 lote de canais
  assert.equal(r.unitsUsed, 202);
  assert.equal((await quotaUsedToday()) - before, 202);
  assert.equal(searches.length, 2);
  assert.equal(searches[0].get("videoDuration"), "short");
  assert.equal(searches[0].get("type"), "video");
  assert.equal(searches[0].get("regionCode"), "BR");
  assert.equal(searches[0].get("relevanceLanguage"), "pt");
  assert.ok(searches[0].get("publishedAfter"));

  // Shorts: pequeno (2, um deles pela URL) e grande (1; o de 130s horizontal fica de fora). Longos e live, fora.
  assert.equal(r.alreadyMonitored, 1);
  assert.equal(r.newChannels, 2);
  const rows = await prisma.discoveredChannel.findMany({ where: { nicheId: niche.id }, orderBy: { title: "asc" } });
  assert.deepEqual(rows.map((x) => x.title), ["Canal Grande", "Canal Pequeno"]);
  const peq = rows.find((x) => x.title === "Canal Pequeno")!;
  assert.equal(peq.shortHits, 2);
  assert.equal(peq.longHits, 0);
  assert.equal(peq.bestViews, 900_000);
  assert.ok(Math.abs(peq.bestRatio! - 112.5) < 0.01);
  const grd = rows.find((x) => x.title === "Canal Grande")!;
  assert.equal(grd.shortHits, 1);
  assert.match(r.message, /2 canais novos entraram/);

  const list = await d.listCandidates({ nicheId: niche.id, status: "new", format: "short", sort: "score" });
  assert.equal(list.items[0].title, "Canal Pequeno", "canal pequeno que estourou vem primeiro");
  assert.equal(list.counts.long, 0);

  // Agora longos (4–20 min por padrão): só o Canal de Longos entra; a live não.
  searches.length = 0;
  const r2 = await d.discoverBySearch({ nicheId: niche.id, keywords: ["documentário"], format: "long", days: 0, order: "relevance" });
  assert.equal(searches[0].get("videoDuration"), "medium");
  assert.equal(searches[0].get("publishedAfter"), null);
  // Canal de Longos é novo; o vídeo horizontal de 130s junta-se ao Canal Grande, que já estava na lista.
  assert.equal(r2.newChannels, 1);
  const grd2 = await prisma.discoveredChannel.findFirstOrThrow({ where: { nicheId: niche.id, title: "Canal Grande" } });
  assert.equal(grd2.shortHits, 1);
  assert.equal(grd2.longHits, 1);
});

test("ignorar, raio-x, canais indicados e monitorar", async () => {
  const niche = (await prisma.niche.findFirst({ where: { name: "Curiosidades" } }))!;
  const grd = (await prisma.discoveredChannel.findFirst({ where: { nicheId: niche.id, title: "Canal Grande" } }))!;
  await d.setCandidateStatus(grd.id, "dismissed");
  const r = await d.discoverBySearch({ nicheId: niche.id, keywords: ["e se"], format: "short", days: 30, order: "viewCount" });
  assert.equal(r.newChannels, 0);
  assert.equal(r.dismissedAgain, 1);
  assert.equal((await prisma.discoveredChannel.findUniqueOrThrow({ where: { id: grd.id } })).status, "dismissed", "ignorado continua ignorado");

  const f = await d.discoverFeatured(niche.id);
  assert.equal(f.newChannels, 1);
  assert.equal(f.unitsUsed, 2); // 1 canal monitorado + 1 lote
  const ind = (await prisma.discoveredChannel.findFirst({ where: { nicheId: niche.id, title: "Canal Indicado" } }))!;
  assert.deepEqual(JSON.parse(ind.featuredBy), ["Canal Já Monitorado"]);
  // sem dados de formato: aparece nas duas abas até o raio-x
  let list = await d.listCandidates({ nicheId: niche.id, status: "new", format: "long", sort: "score" });
  assert.ok(list.items.some((x) => x.id === ind.id));

  const before = await quotaUsedToday();
  const a = await d.analyzeCandidate(ind.id);
  assert.equal((await quotaUsedToday()) - before, 2);
  assert.equal(a.sampled, 10);
  assert.equal(a.shorts, 8);
  assert.equal(a.longs, 2);
  assert.equal(a.medianShortViews, 20_000);
  assert.equal(a.outliers, 1);
  assert.equal(a.best?.id, "ind_s_00000");
  list = await d.listCandidates({ nicheId: niche.id, status: "new", format: "long", sort: "score" });
  assert.ok(!list.items.some((x) => x.id === ind.id), "80% Shorts: sai da aba de longos");
  list = await d.listCandidates({ nicheId: niche.id, status: "new", format: "short", sort: "score" });
  assert.ok(list.items.some((x) => x.id === ind.id));

  const ch = await d.monitorCandidate(ind.id);
  assert.equal(ch.title, "Canal Indicado");
  assert.ok(await prisma.nicheChannel.findUnique({ where: { nicheId_channelId: { nicheId: niche.id, channelId: ch.id } } }));
  assert.equal((await prisma.discoveredChannel.findUniqueOrThrow({ where: { id: ind.id } })).status, "monitored");
});

test("bloqueia busca sem cota suficiente", async () => {
  const niche = (await prisma.niche.findFirst({ where: { name: "Curiosidades" } }))!;
  await prisma.setting.upsert({ where: { key: "dailyQuota" }, create: { key: "dailyQuota", value: "700" }, update: { value: "700" } });
  await assert.rejects(
    d.discoverBySearch({ nicheId: niche.id, keywords: ["a1", "b2", "c3"], format: "short", days: 30, order: "viewCount" }),
    /restam só/,
  );
  await assert.rejects(
    d.discoverBySearch({ nicheId: niche.id, keywords: ["a1", "b2", "c3", "d4", "e5", "f6"], format: "short", days: 30, order: "viewCount" }),
    /No máximo 5/,
  );
  await prisma.$disconnect();
});
