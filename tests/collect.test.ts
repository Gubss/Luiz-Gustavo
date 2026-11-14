/**
 * Testa a coleta de ponta a ponta com a API do YouTube simulada (sem chave, sem cota real).
 * Usa um banco SQLite separado: prisma/test.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test.db";
process.env.YOUTUBE_API_KEY = "test-key";
// Banco descartável, só dos testes (nunca o radar.db).
for (const f of ["prisma/test.db", "prisma/test.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const DAY = 86_400_000;
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

// 60 Shorts antigos de 30 mil, o "bunker" com 1,6 mi há 5 dias, um vídeo de 90s que NÃO é Short e 3 longos.
type V = { id: string; title: string; days: number; views: number; dur: string };
const videos: V[] = [
  { id: "bunker00001", title: "Entrei no bunker abandonado da Guerra Fria", days: 5, views: 1_600_000, dur: "PT58S" },
  { id: "notshort001", title: "Vídeo horizontal de 90 segundos", days: 6, views: 20_000, dur: "PT1M30S" },
  ...Array.from({ length: 3 }, (_, i) => ({ id: `long0000${i}0`, title: `Documentário ${i}`, days: 4 + i * 7, views: 80_000, dur: "PT12M" })),
  ...Array.from({ length: 60 }, (_, i) => ({ id: `short${String(i).padStart(5, "0")}x`, title: i === 40 ? "E se o elevador despencar com você dentro?" : `Curiosidade número ${i} sobre o oceano`, days: 2 + i, views: 30_000, dur: "PT45S" })),
].sort((a, b) => a.days - b.days);

const calls: string[] = [];
let headerOk = true;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === "www.youtube.com" && url.pathname.startsWith("/shorts/")) {
    const id = url.pathname.split("/")[2];
    return id === "notshort001"
      ? new Response(null, { status: 303, headers: { location: `https://www.youtube.com/watch?v=${id}` } })
      : new Response(null, { status: 200 });
  }
  if (url.hostname !== "www.googleapis.com") return realFetch(input, init);
  const h = new Headers(init?.headers);
  if (h.get("X-goog-api-key") !== "test-key" || url.searchParams.has("key")) headerOk = false;
  const ep = url.pathname.split("/").pop()!;
  calls.push(ep);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (ep === "channels")
    return json({ items: [{
      id: "UCbunkerbunkerbunker0001", snippet: { title: "Canal do Bunker", customUrl: "@bunker", publishedAt: iso(400) },
      statistics: { subscriberCount: "29000", videoCount: String(videos.length), viewCount: "9000000" },
      contentDetails: { relatedPlaylists: { uploads: "UUbunker" } },
    }] });
  if (ep === "playlistItems") {
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    const page = videos.slice(start, start + 50);
    return json({
      items: page.map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: iso(v.days) }, snippet: { title: v.title, publishedAt: iso(v.days) } })),
      nextPageToken: start + 50 < videos.length ? String(start + 50) : undefined,
    });
  }
  if (ep === "videos") {
    const ids = url.searchParams.get("id")!.split(",");
    return json({ items: ids.map((id) => videos.find((v) => v.id === id)!).map((v) => ({
      id: v.id,
      snippet: { channelId: "UCbunkerbunkerbunker0001", title: v.title, publishedAt: iso(v.days), liveBroadcastContent: "none", thumbnails: { high: { url: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` } } },
      contentDetails: { duration: v.dur },
      statistics: { viewCount: String(v.views), likeCount: "10", commentCount: "1" },
    })) });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let mod: {
  prisma: typeof import("../src/lib/db").prisma;
  addChannelToNiche: typeof import("../src/lib/channels").addChannelToNiche;
  collectAll: typeof import("../src/lib/collect").collectAll;
  getRadar: typeof import("../src/lib/radar").getRadar;
  findSimilarTitles: typeof import("../src/lib/catalog").findSimilarTitles;
  quotaUsedToday: typeof import("../src/lib/quota").quotaUsedToday;
};

before(async () => {
  mod = {
    prisma: (await import("../src/lib/db")).prisma,
    addChannelToNiche: (await import("../src/lib/channels")).addChannelToNiche,
    collectAll: (await import("../src/lib/collect")).collectAll,
    getRadar: (await import("../src/lib/radar")).getRadar,
    findSimilarTitles: (await import("../src/lib/catalog")).findSimilarTitles,
    quotaUsedToday: (await import("../src/lib/quota")).quotaUsedToday,
  };
});

test("coleta de ponta a ponta", async () => {
  const { prisma } = mod;
  const niche = await prisma.niche.create({ data: { name: "Teste" } });
  await mod.addChannelToNiche(niche.id, "https://www.youtube.com/@bunker");
  calls.length = 0;

  const s = await mod.collectAll({ trigger: "manual", force: true });
  assert.equal(s.status, "ok", s.errors.join("; "));
  assert.equal(headerOk, true, "a chave deve ir no cabeçalho, nunca na URL");

  // catálogo completo (65 títulos, 2 páginas) na primeira coleta
  assert.equal(await prisma.catalogEntry.count(), videos.length);
  // vídeos com estatísticas: os da janela de 30 dias + base, com teto de 100
  const vcount = await prisma.video.count();
  assert.ok(vcount >= 35 && vcount <= 65, `vídeos coletados: ${vcount}`);
  // classificação: 58s = Short; 90s com redirecionamento = longo (pela URL)
  const ns = await prisma.video.findFirstOrThrow({ where: { externalId: "notshort001" } });
  assert.equal(ns.isShort, false);
  assert.equal(ns.shortSource, "url");
  assert.equal((await prisma.video.findFirstOrThrow({ where: { externalId: "bunker00001" } })).isShort, true);
  // snapshot do dia
  assert.equal(await prisma.videoSnapshot.count(), vcount);
  // cota: channels(1) + playlistItems(2) + videos(1-2), contabilizada
  assert.equal(s.unitsUsed, calls.length);
  assert.ok(s.unitsUsed <= 6, `unidades: ${s.unitsUsed}`);

  // radar de Shorts em 30 dias
  const r = await mod.getRadar({ format: "short", days: 30, minMult: 3, sort: "mult" });
  assert.equal(r.items[0].video.externalId, "bunker00001");
  assert.equal(r.items[0].metrics.smallChannelHit, true);
  assert.equal(r.items[0].metrics.risingFast, true);
  assert.equal(r.items.length, 1);
  const longs = await mod.getRadar({ format: "long", days: 30, minMult: 3, sort: "mult", includeAll: true });
  assert.ok(longs.items.some((i) => i.video.externalId === "notshort001"));

  // segunda coleta: incremental, sem reler o catálogo inteiro
  calls.length = 0;
  const s2 = await mod.collectAll({ trigger: "manual", force: true });
  assert.equal(s2.catalogAdded, 0);
  assert.equal(await prisma.videoSnapshot.count(), vcount); // mesmo dia: atualiza, não duplica

  // conferência de tema
  const m = await mod.findSimilarTitles("o que acontece se o elevador cair", { nicheId: niche.id });
  assert.ok(m.length > 0 && m[0].shared.includes("elevador"));
  const none = await mod.findSimilarTitles("receita de bolo de cenoura", { nicheId: niche.id });
  assert.equal(none.length, 0);

  await prisma.$disconnect();
});
