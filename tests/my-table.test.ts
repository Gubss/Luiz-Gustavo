/**
 * Tabela completa dos meus vídeos: montagem das linhas, ordenação e melhor/pior de cada coluna.
 * Funções puras: sem banco, sem YouTube, sem IA.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./test-table.db";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-17T12:00:00Z");

type V = import("../src/lib/my-table").TableVideo;
const vid = (id: string, ageH: number, views: number | null, cps: [number, number][], extra: Partial<V> = {}): V => ({
  id,
  externalId: `yt-${id}`,
  title: id,
  thumbnailUrl: null,
  isShort: true,
  publishedAt: new Date(NOW.getTime() - ageH * HOUR),
  durationSec: 60,
  viewCount: views,
  likeCount: null,
  commentCount: null,
  avgViewPercent: null,
  avgViewDuration: null,
  analytics: null,
  dailyViews: null,
  diagnoses: [],
  checkpoints: cps.map(([h, n]) => ({ ageHours: h, viewCount: n, stayedPct: null })),
  ...extra,
});

test("buildRows: uma linha por vídeo com todos os números, sem dado = null", async () => {
  const { buildRows } = await import("../src/lib/my-table");
  const a = vid("a", 200, 1000, [[1, 50], [3, 120], [24, 600], [168, 950]], {
    likeCount: 80,
    commentCount: 10,
    avgViewPercent: 85,
    avgViewDuration: 51,
    analytics: JSON.stringify({ views: 1000, throughDay: "2026-11-16", shares: 10, subsGained: 7, minutesWatched: 850 }),
    diagnoses: [{ content: JSON.stringify({ veredito: "acima do normal" }) }],
    checkpoints: [
      { ageHours: 24, viewCount: 600, stayedPct: 70 },
      { ageHours: 72, viewCount: 800, stayedPct: 74, source: "analytics" } as V["checkpoints"][number],
    ],
  });
  const b = vid("b", 300, 500, [[24, 300]]);
  const c = vid("c", 5, 40, [[1, 10], [3, 30]]);
  const rows = buildRows([a, b, c], [a, b, c], NOW);
  assert.equal(rows.length, 3);
  const ra = rows[0];
  assert.equal(ra.values.views, 1000);
  assert.equal(ra.values.h24, 600);
  assert.equal(ra.values.h72, 800);
  assert.deepEqual(ra.estimated, ["h72"]);
  assert.equal(ra.values.shares, 10);
  assert.equal(ra.values.subs, 7);
  assert.equal(ra.values.minutes, 850);
  assert.equal(ra.values.engagement, (80 + 10 + 10) / 1000);
  assert.equal(ra.values.avgPct, 0.85);
  assert.equal(ra.values.stayed, 0.74, "continuaram assistindo = o último marco colado");
  assert.equal(ra.verdict, "acima do normal");
  assert.equal(ra.thumb, "https://i.ytimg.com/vi/yt-a/mqdefault.jpg");
  // x o normal: normal dos outros vídeos com 7+ dias (só o b) = 500
  assert.equal(ra.values.ratio, 2);
  const rc = rows[2];
  assert.equal(rc.values.h1, 10);
  assert.equal(rc.values.h24, null);
  assert.equal(rc.values.shares, null);
  assert.equal(rc.verdict, null);
});

test("sortRows: ordena nos dois sentidos e deixa “—” sempre no fim", async () => {
  const { buildRows, sortRows } = await import("../src/lib/my-table");
  const rows = buildRows([vid("a", 200, 1000, [[1, 50]]), vid("b", 300, 500, []), vid("c", 5, 40, [[1, 90]])], undefined, NOW);
  assert.deepEqual(sortRows(rows, "h1", "desc").map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(sortRows(rows, "h1", "asc").map((r) => r.id), ["a", "c", "b"]);
  assert.deepEqual(sortRows(rows, "views", "asc").map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual(sortRows(rows, "published", "desc").map((r) => r.id), ["c", "a", "b"]);
});

test("columnExtremes: melhor e pior por coluna, sem pintar duração nem coluna com 1 número", async () => {
  const { buildRows, columnExtremes } = await import("../src/lib/my-table");
  const rows = buildRows(
    [vid("a", 200, 1000, [[1, 50]], { durationSec: 30 }), vid("b", 300, 500, [], { durationSec: 90 }), vid("c", 5, 40, [[1, 90]], { durationSec: 60 })],
    undefined,
    NOW,
  );
  const e = columnExtremes(rows);
  assert.deepEqual(e.views, { best: 1000, worst: 40 });
  assert.deepEqual(e.h1, { best: 90, worst: 50 });
  assert.equal(e.duration, undefined);
  assert.equal(e.h24, undefined);
});
