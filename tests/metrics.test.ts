import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyByDuration, computeChannelMetrics, median, type MetricVideo } from "../src/lib/metrics";

const now = new Date("2026-11-14T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const opts = { now, avgN: 15, multiplier: 3, minViews: 10_000, smallChannelMaxSubs: 50_000, smallChannelMinRatio: 10 };

test("mediana", () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("classificação por duração com limite de 3 min", () => {
  assert.equal(classifyByDuration(45, 180), "short");
  assert.equal(classifyByDuration(120, 180), "check");
  assert.equal(classifyByDuration(200, 180), "long");
  assert.equal(classifyByDuration(90, 60), "long");
});

test("caso bunker: canal pequeno, outlier, subindo rápido", () => {
  const vids: MetricVideo[] = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`, channelId: "c", publishedAt: daysAgo(3 + i * 2), viewCount: 30_000, isShort: true,
  }));
  vids.push({ id: "bunker", channelId: "c", publishedAt: daysAgo(5), viewCount: 1_600_000, isShort: true });
  const m = computeChannelMetrics(vids, 29_000, opts).get("bunker")!;
  assert.equal(m.baseMedian, 30_000);
  assert.ok(Math.abs(m.multAvg! - 53.3) < 0.1);
  assert.ok(Math.abs(m.multSubs! - 55.2) < 0.1);
  assert.equal(m.isOutlier, true);
  assert.equal(m.smallChannelHit, true);
  assert.equal(m.risingFast, true);
  // um vídeo comum não é outlier
  assert.equal(computeChannelMetrics(vids, 29_000, opts).get("s0")!.isOutlier, false);
});

test("o próprio vídeo não entra na base, e vídeos com menos de 48h ficam fora", () => {
  const vids: MetricVideo[] = [
    { id: "a", channelId: "c", publishedAt: daysAgo(10), viewCount: 1000, isShort: false },
    { id: "b", channelId: "c", publishedAt: daysAgo(9), viewCount: 100_000, isShort: false },
    { id: "novo", channelId: "c", publishedAt: daysAgo(1), viewCount: 999_999, isShort: false },
  ];
  const ms = computeChannelMetrics(vids, null, opts);
  assert.equal(ms.get("b")!.baseMedian, 1000); // base de b = só a
  assert.equal(ms.get("a")!.baseMedian, 100_000);
  assert.equal(ms.get("novo")!.baseCount, 2);
  assert.equal(ms.get("a")!.multSubs, null); // inscritos ocultos
});

test("Shorts e longos têm bases separadas", () => {
  const vids: MetricVideo[] = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, channelId: "c", publishedAt: daysAgo(5 + i), viewCount: 1_000_000, isShort: true })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, channelId: "c", publishedAt: daysAgo(5 + i), viewCount: 10_000, isShort: false })),
    { id: "L", channelId: "c", publishedAt: daysAgo(3), viewCount: 50_000, isShort: false },
  ];
  const m = computeChannelMetrics(vids, 1_000_000, opts).get("L")!;
  assert.equal(m.baseMedian, 10_000);
  assert.equal(m.multAvg, 5);
});

test("velocidade usa mínimo de 1 dia", () => {
  const vids: MetricVideo[] = [{ id: "x", channelId: "c", publishedAt: new Date(now.getTime() - 3_600_000), viewCount: 5000, isShort: true }];
  assert.equal(computeChannelMetrics(vids, null, opts).get("x")!.viewsPerDay, 5000);
});
