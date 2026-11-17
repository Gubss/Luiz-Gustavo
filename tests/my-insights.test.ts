/**
 * Insights detalhados: nível bom/normal/fraco com o porquê, ranking do canal por marco, "Quem foi melhor" e a
 * janela do pré-diagnóstico de 3 dias. Funções puras: sem banco, sem YouTube, sem IA.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./test-insights.db";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-17T12:00:00Z");

type V = import("../src/lib/my-insights").InsightVideo;
const vid = (id: string, ageH: number, cps: [number, number][], extra: Partial<V> = {}): V => ({
  id,
  title: id,
  isShort: true,
  publishedAt: new Date(NOW.getTime() - ageH * HOUR),
  durationSec: 60,
  viewCount: cps.at(-1)?.[1] ?? null,
  likeCount: null,
  commentCount: null,
  avgViewPercent: null,
  avgViewDuration: null,
  analytics: null,
  dailyViews: null,
  checkpoints: cps.map(([h, n]) => ({ ageHours: h, viewCount: n, stayedPct: null })),
  ...extra,
});

test("nível e porquê comparando com o canal na mesma idade", async () => {
  const { videoInsights, levelOf } = await import("../src/lib/my-insights");
  assert.equal(levelOf(1.5, true), "bom");
  assert.equal(levelOf(1.0, true), "normal");
  assert.equal(levelOf(0.5, true), "fraco");
  assert.equal(levelOf(null), "sem base");

  const peers = [vid("a", 200, [[1, 500], [24, 2000]]), vid("b", 200, [[1, 700], [24, 3000]]), vid("c", 200, [[1, 600], [24, 2500]])];
  const mine = vid("x", 25, [[1, 1459], [3, 2877], [24, 4106]], {
    likeCount: 120,
    commentCount: 4,
    checkpoints: [
      { ageHours: 1, viewCount: 1459, stayedPct: null },
      { ageHours: 24, viewCount: 4106, stayedPct: 79.8 },
    ],
  });
  const ins = videoInsights(mine, [...peers, mine]);
  const views = ins.find((i) => i.key === "views")!;
  assert.equal(views.level, "bom", "4.106 com 24h contra normal de 2.500");
  assert.match(views.why, /com 24h tinha 4\.106/);
  assert.match(views.why, /normal: 2\.500/);
  const stayed = ins.find((i) => i.key === "stayed")!;
  assert.equal(stayed.value, "79,8%");
  assert.equal(stayed.level, "sem base", "nenhum outro vídeo tem o número colado");
  assert.equal(ins.find((i) => i.key === "subs")!.level, "sem base", "sem Analytics");
});

test("Analytics zerado sem dia não conta como número", async () => {
  const { validAnalytics } = await import("../src/lib/my-insights");
  assert.equal(validAnalytics(JSON.stringify({ views: 0, avgViewPct: 0, throughDay: null })), null);
  assert.ok(validAnalytics(JSON.stringify({ views: 10, throughDay: "2026-11-16" })));
});

test("ranking do canal por marco e Quem foi melhor", async () => {
  const { checkpointRanks, rankText, channelLeaders } = await import("../src/lib/my-insights");
  const all = [vid("a", 200, [[1, 500], [24, 2000]]), vid("b", 200, [[1, 1600], [24, 3000]]), vid("x", 25, [[1, 1459], [24, 4106]])];
  const r = checkpointRanks(all[2], all);
  assert.deepEqual([r[1]!.pos, r[1]!.of], [2, 3]);
  assert.equal(rankText(1, r[1]!), "2º melhor 1ª hora do canal (de 3)");
  assert.equal(rankText(24, r[24]!), "melhor 24 horas do canal (de 3)");
  const leaders = channelLeaders(all);
  assert.equal(leaders.find((l) => l.key === "h1")!.videoId, "b");
  assert.equal(leaders.find((l) => l.key === "h24")!.videoId, "x");
});

test("pré-diagnóstico de 3 dias não se perde entre 144h e 168h", async () => {
  const { milestoneDue } = await import("../src/lib/my-videos");
  assert.equal(milestoneDue(30, []), 24);
  assert.equal(milestoneDue(60, []), null, "entre 48h e 72h espera o de 3 dias");
  assert.equal(milestoneDue(100, []), 72);
  assert.equal(milestoneDue(150, []), 72, "app fechado de 72h a 150h: ainda pega o de 3 dias");
  assert.equal(milestoneDue(150, [{ milestone: 72, ageHours: 80 }]), null);
  assert.equal(milestoneDue(170, []), 168);
  assert.equal(milestoneDue(170, [{ milestone: null, ageHours: 169 }]), null, "manual depois do marco cobre");
});
