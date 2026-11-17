/**
 * Insights detalhados de um vídeo meu: cada número com "bom / normal / fraco" e o porquê em 1 linha,
 * comparado com os outros vídeos do canal (mesmo formato) na mesma idade. Também o ranking do canal
 * ("2º melhor 1ª hora do canal") e o bloco "Quem foi melhor" da lista. Só lê o que o Radar já guardou:
 * não chama YouTube nem IA.
 */
import type { DailyPoint, VideoAnalytics } from "./google";
import { median } from "./metrics";
import { checkpointLabel, CHECKPOINTS } from "./my-videos";

export type Level = "bom" | "normal" | "fraco" | "sem base";

export type Insight = {
  key: string;
  label: string;
  value: string;
  level: Level;
  /** O porquê, em 1 linha de leigo. */
  why: string;
};

export type InsightVideo = {
  id: string;
  title: string | null;
  isShort: boolean;
  publishedAt: Date | null;
  durationSec: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  avgViewPercent: number | null;
  avgViewDuration: number | null;
  analytics: string | null;
  dailyViews: string | null;
  checkpoints: { ageHours: number; viewCount: number | null; stayedPct: number | null; updatedAt?: Date }[];
};

const fmt = (n: number, digits = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Analytics só vale se o YouTube já liberou dados (antes disso ele devolve tudo zerado e sem dia). */
export function validAnalytics(json: string | null): VideoAnalytics | null {
  const a = parse<VideoAnalytics>(json);
  if (!a) return null;
  if (!a.throughDay && !a.views) return null;
  return a;
}

/**
 * Nível pela razão "este vídeo ÷ normal do canal".
 * `wide` (views, que variam muito entre Shorts): bom ≥ 1,3x, fraco < 0,7x.
 * Estreito (retenção, % visto, taxas): bom ≥ 1,1x, fraco < 0,9x.
 */
export function levelOf(ratio: number | null, wide = false): Level {
  if (ratio == null || Number.isNaN(ratio)) return "sem base";
  const [hi, lo] = wide ? [1.3, 0.7] : [1.1, 0.9];
  if (ratio >= hi) return "bom";
  if (ratio < lo) return "fraco";
  return "normal";
}

const times = (r: number) => `${fmt(r, r < 10 ? 1 : 0)}x`;

/** Frase do porquê: "1,8x o normal do canal (normal: 2.300)". */
function because(ratio: number | null, normalTxt: string | null, n: number, what = "do canal") {
  if (ratio == null || normalTxt == null) return n ? `poucos vídeos ${what} com esse número para comparar` : `nenhum outro vídeo ${what} tem esse número ainda`;
  const dir = ratio === Infinity ? "acima do normal" : ratio >= 1 ? `${times(ratio)} o normal` : `${fmt(Math.round(ratio * 100))}% do normal`;
  return `${dir} ${what} (normal: ${normalTxt}; base: ${n} vídeo${n === 1 ? "" : "s"})`;
}

/**
 * Último marco com número. O app grava o marco dentro da janela dele (24h vale de 18h a 30h), então um vídeo com
 * 20h já pode ter o de 24h: vale, é o mesmo número que os outros vídeos têm nesse marco.
 */
export function latestCheckpoint(v: InsightVideo) {
  return [...v.checkpoints].filter((c) => c.viewCount != null).sort((a, b) => b.ageHours - a.ageHours)[0];
}

/** Razão contra o normal; normal 0 com número acima de 0 conta como bem acima. */
const ratioTo = (mine: number | null | undefined, med: number | null) => (mine == null || med == null ? null : med === 0 ? (mine > 0 ? Infinity : 1) : mine / med);

/** Soma dos N primeiros dias do Analytics (para comparar minutos assistidos na mesma idade). */
export function firstDays(daily: DailyPoint[] | null, n: number, key: "views" | "minutes") {
  if (!daily?.length || n < 1) return null;
  const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length < n) return null; // o vídeo ainda não tem esses dias todos
  return sorted.slice(0, n).reduce((s, d) => s + (d[key] ?? 0), 0);
}

const perK = (x: number | null | undefined, views: number | null | undefined) => (x == null || !views ? null : (x / views) * 1000);

/** Os números do vídeo com o nível e o porquê. `peers` = outros vídeos do mesmo canal e formato. */
export function videoInsights(v: InsightVideo, peers: InsightVideo[]): Insight[] {
  const others = peers.filter((p) => p.id !== v.id && p.isShort === v.isShort);
  const a = validAnalytics(v.analytics);
  const daily = parse<DailyPoint[]>(v.dailyViews);
  const out: Insight[] = [];
  const kind = v.isShort ? "Shorts" : "vídeos longos";

  // Views: no último marco alcançado, contra a mediana dos outros no mesmo marco.
  const cp = latestCheckpoint(v);
  if (cp) {
    const xs = others.flatMap((p) => p.checkpoints.filter((c) => c.ageHours === cp.ageHours && c.viewCount != null).map((c) => c.viewCount as number));
    const med = median(xs);
    const r = ratioTo(cp.viewCount, med);
    const at = `com ${checkpointLabel(cp.ageHours)} tinha ${fmt(cp.viewCount!)}`;
    out.push({
      key: "views",
      label: "Visualizações",
      value: fmt(v.viewCount ?? cp.viewCount!),
      level: levelOf(r, true),
      why: med != null ? `${at}: ${because(r, fmt(med), xs.length, `dos ${kind}`)}` : `${at}; nenhum outro ${v.isShort ? "Short" : "vídeo"} tem número nessa idade`,
    });
  } else {
    out.push({ key: "views", label: "Visualizações", value: v.viewCount != null ? fmt(v.viewCount) : "—", level: "sem base", why: "o vídeo ainda não chegou no 1º marco (1h)" });
  }

  // Taxas por 1.000 views (likes, comentários, compartilhamentos, inscritos): quase não dependem da idade.
  const rate = (key: string, label: string, x: number | null | undefined, views: number | null | undefined, peerOf: (p: InsightVideo) => [number | null | undefined, number | null | undefined], missing: string) => {
    if (x == null) return out.push({ key, label, value: "—", level: "sem base", why: missing });
    const mine = perK(x, views);
    const xs = others.map((p) => perK(...peerOf(p))).filter((n): n is number => n != null);
    const med = median(xs);
    const r = ratioTo(mine, med);
    out.push({
      key,
      label,
      value: fmt(x),
      level: levelOf(r),
      why: mine == null ? "sem views para calcular a taxa" : med != null ? `${fmt(mine, 1)} a cada 1.000 views; ${because(r, fmt(med, 1), xs.length)}` : `${fmt(mine, 1)} a cada 1.000 views; ${because(null, null, xs.length)}`,
    });
  };
  rate("likes", "Likes", v.likeCount, v.viewCount, (p) => [p.likeCount, p.viewCount], "o YouTube não mostrou os likes");
  rate("comments", "Comentários", v.commentCount, v.viewCount, (p) => [p.commentCount, p.viewCount], "o YouTube não mostrou os comentários");
  const pa = (p: InsightVideo) => validAnalytics(p.analytics);
  const noAn = a ? "o Analytics não trouxe esse número" : "chega pelo YouTube Analytics (login do Google), com 1 a 2 dias de atraso";
  rate("subs", "Inscritos ganhos", a?.subsGained, a?.views, (p) => [pa(p)?.subsGained, pa(p)?.views], noAn);
  rate("shares", "Compartilhamentos", a?.shares, a?.views, (p) => [pa(p)?.shares, pa(p)?.views], noAn);

  // Minutos assistidos: soma dos mesmos N primeiros dias (views por dia do Analytics) nos outros vídeos.
  if (a?.minutesWatched != null && daily?.length) {
    const n = daily.length;
    const mine = firstDays(daily, n, "minutes") ?? a.minutesWatched;
    const xs = others.map((p) => firstDays(parse<DailyPoint[]>(p.dailyViews), n, "minutes")).filter((x): x is number => x != null);
    const med = median(xs);
    const r = med ? mine / med : null;
    out.push({
      key: "minutes",
      label: "Minutos assistidos",
      value: fmt(a.minutesWatched),
      level: levelOf(r, true),
      why: med ? because(r, fmt(med), xs.length, `nos ${n} primeiro${n === 1 ? "" : "s"} dia${n === 1 ? "" : "s"}`) : because(null, null, xs.length),
    });
  } else {
    out.push({ key: "minutes", label: "Minutos assistidos", value: a?.minutesWatched != null ? fmt(a.minutesWatched) : "—", level: "sem base", why: noAn });
  }

  // Duração média e % médio visto: comparação direta com a mediana dos outros.
  const dur = a?.avgViewDuration || v.avgViewDuration || null;
  const durs = others.map((p) => p.avgViewDuration).filter((x): x is number => !!x);
  const durMed = median(durs);
  out.push({
    key: "duration",
    label: "Duração média assistida",
    value: dur ? mmss(dur) : "—",
    level: dur ? levelOf(durMed ? dur / durMed : null) : "sem base",
    why: !dur ? noAn : `${v.durationSec ? `de ${mmss(v.durationSec)} do vídeo; ` : ""}${because(durMed ? dur / durMed : null, durMed ? mmss(durMed) : null, durs.length)}`,
  });
  const pct = a?.avgViewPct || v.avgViewPercent || null;
  const pcts = others.map((p) => p.avgViewPercent).filter((x): x is number => !!x);
  const pctMed = median(pcts);
  out.push({
    key: "pct",
    label: "% médio visto",
    value: pct ? `${fmt(pct, 1)}%` : "—",
    level: pct ? levelOf(pctMed ? pct / pctMed : null) : "sem base",
    why: !pct ? noAn : `${pct > 100 ? "passa de 100%: tem gente assistindo de novo; " : ""}${because(pctMed ? pct / pctMed : null, pctMed ? `${fmt(pctMed, 1)}%` : null, pcts.length)}`,
  });

  // Continuaram assistindo (só Shorts, colado do Studio num marco).
  const stayedOf = (p: InsightVideo) => [...p.checkpoints].filter((c) => c.stayedPct != null).sort((x, y) => y.ageHours - x.ageHours)[0];
  const st = stayedOf(v);
  if (st) {
    const xs = others.map((p) => stayedOf(p)?.stayedPct).filter((x): x is number => x != null);
    const med = median(xs);
    out.push({
      key: "stayed",
      label: "Continuaram assistindo",
      value: `${fmt(st.stayedPct!, 1)}%`,
      level: levelOf(med ? st.stayedPct! / med : null),
      why: `colado do Studio com ${checkpointLabel(st.ageHours)}; ${because(med ? st.stayedPct! / med : null, med ? `${fmt(med, 1)}%` : null, xs.length)}`,
    });
  } else {
    out.push({
      key: "stayed",
      label: "Continuaram assistindo",
      value: "—",
      level: "sem base",
      why: v.isShort ? "o YouTube só mostra no Studio: cole na página do vídeo (Colar números do Studio num marco)" : "só existe para Shorts",
    });
  }

  const eng = engagementRate;
  const e = eng(v);
  const es = others.map(eng).filter((x): x is number => x != null);
  const eMed = median(es);
  out.push({
    key: "engagement",
    label: "Engajamento",
    value: e != null ? `${fmt(e * 100, 1)}%` : "—",
    level: e != null ? levelOf(eMed ? e / eMed : null) : "sem base",
    why: e == null ? "sem views ainda" : `(likes + comentários${a ? " + compartilhamentos" : ""}) ÷ views; ${because(eMed ? e / eMed : null, eMed ? `${fmt(eMed * 100, 1)}%` : null, es.length)}`,
  });
  return out;
}

/** Engajamento: (likes + comentários + compartilhamentos) ÷ views. Null sem views. */
export function engagementRate(p: Pick<InsightVideo, "viewCount" | "likeCount" | "commentCount" | "analytics">) {
  if (!p.viewCount) return null;
  const sh = validAnalytics(p.analytics)?.shares ?? 0;
  return ((p.likeCount ?? 0) + (p.commentCount ?? 0) + sh) / p.viewCount;
}

/** Posição do vídeo no canal em cada marco: "2º de 5". Só conta vídeos do mesmo formato com número no marco. */
export function checkpointRanks(v: InsightVideo, all: InsightVideo[]) {
  const same = all.filter((p) => p.isShort === v.isShort);
  const out: Record<number, { pos: number; of: number; median: number | null } | null> = {};
  for (const h of CHECKPOINTS) {
    const mine = v.checkpoints.find((c) => c.ageHours === h)?.viewCount;
    const xs = same.flatMap((p) => {
      const c = p.checkpoints.find((x) => x.ageHours === h);
      return c?.viewCount != null ? [{ id: p.id, views: c.viewCount }] : [];
    });
    const others = xs.filter((x) => x.id !== v.id).map((x) => x.views);
    out[h] = mine == null ? null : { pos: 1 + xs.filter((x) => x.id !== v.id && x.views > mine).length, of: xs.length, median: median(others) };
  }
  return out;
}

const ORD = ["1ª hora", "3 horas", "6 horas", "12 horas", "24 horas", "48 horas", "3 dias", "7 dias", "14 dias", "28 dias"];
export const checkpointLong = (h: number) => ORD[CHECKPOINTS.indexOf(h as (typeof CHECKPOINTS)[number])] ?? checkpointLabel(h);

/** "2º melhor 1ª hora do canal" / "melhor 24 horas do canal". */
export function rankText(h: number, r: { pos: number; of: number }) {
  if (r.of <= 1) return `único com número em ${checkpointLong(h)}`;
  return `${r.pos === 1 ? "melhor" : `${r.pos}º melhor`} ${checkpointLong(h)} do canal (de ${r.of})`;
}

export type Leader = { key: string; label: string; videoId: string; title: string | null; value: string; runnerUp?: string };

/** "Quem foi melhor" na lista: o líder de cada número entre os vídeos do formato. */
export function channelLeaders(all: InsightVideo[]): Leader[] {
  const shorts = all.filter((v) => v.isShort);
  const pool = shorts.length ? shorts : all;
  const out: Leader[] = [];
  const pick = (key: string, label: string, val: (v: InsightVideo) => number | null | undefined, show: (n: number) => string) => {
    const xs = pool.map((v) => ({ v, n: val(v) })).filter((x): x is { v: InsightVideo; n: number } => x.n != null && x.n > 0).sort((a, b) => b.n - a.n);
    if (!xs.length) return;
    out.push({ key, label, videoId: xs[0].v.id, title: xs[0].v.title, value: show(xs[0].n), runnerUp: xs[1] ? `2º: ${show(xs[1].n)}` : undefined });
  };
  const at = (h: number) => (v: InsightVideo) => v.checkpoints.find((c) => c.ageHours === h)?.viewCount;
  pick("h1", "Melhor 1ª hora", at(1), (n) => `${fmt(n)} views`);
  pick("h24", "Melhor 24 horas", at(24), (n) => `${fmt(n)} views`);
  pick("views", "Mais views", (v) => v.viewCount, (n) => `${fmt(n)} views`);
  pick("subs", "Mais inscritos", (v) => validAnalytics(v.analytics)?.subsGained, (n) => `+${fmt(n)} inscritos`);
  pick("retention", "Melhor retenção", (v) => v.avgViewPercent, (n) => `${fmt(n, 1)}% visto`);
  return out;
}
