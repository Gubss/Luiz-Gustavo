import { prisma } from "./db";
import { getSettings } from "./settings";
import { quotaUsedToday } from "./quota";
import { addChannelToNiche } from "./channels";
import { classifyByDuration, median } from "./metrics";
import { tokenize } from "./catalog";
import {
  bestThumb,
  checkIsShortByUrl,
  featuredChannelsOf,
  fetchChannelsBatch,
  fetchVideosBatch,
  parseDuration,
  searchVideos,
  uploadsPage,
  type SearchVideoParams,
  type YtChannel,
  type YtVideo,
} from "./youtube";

const DAY_MS = 86_400_000;
export const SEARCH_COST = 100;
export const MAX_KEYWORDS = 5;
/** Quantos vídeos encontrados guardamos por canal (os de mais views). */
const MAX_MATCHED = 8;

export type Format = "short" | "long";
export type LongDuration = "medium" | "long" | "any";

export type SearchOptions = {
  nicheId: string;
  keywords: string[];
  format: Format;
  longDuration?: LongDuration;
  days: number; // 0 = qualquer data
  order: "viewCount" | "relevance";
  language?: string; // "pt", "en", "es"...
  region?: string; // "BR", "US"...
};

export type MatchedVideo = {
  id: string;
  title: string;
  views: number;
  publishedAt: string;
  durationSec: number | null;
  isShort: boolean;
  thumb: string | null;
  query?: string;
};

export type ChannelAnalysis = {
  sampled: number;
  shorts: number;
  longs: number;
  shortShare: number;
  medianShortViews: number | null;
  medianLongViews: number | null;
  uploadsPerWeek: number | null;
  lastUploadAt: string | null;
  firstSampledAt: string | null;
  outliers: number; // vídeos com 3x+ a mediana do próprio formato
  best: MatchedVideo | null;
};

// ---------- Custo ----------

/**
 * Custo estimado de uma busca por palavra-chave: 100 por palavra (search.list),
 * +1 por lote de 50 vídeos (videos.list) e +1 por lote de 50 canais (channels.list).
 */
export function estimateSearchCost(keywordCount: number) {
  return keywordCount * (SEARCH_COST + 2);
}

/** Custo estimado da busca por "canais indicados": 1 por canal monitorado + 1 por lote de até 50 encontrados. */
export function estimateFeaturedCost(monitoredCount: number) {
  return monitoredCount + 1;
}

export async function quotaStatus() {
  const s = await getSettings();
  const used = await quotaUsedToday();
  const channels = await prisma.channel.count({ where: { niches: { some: {} } } });
  // Reserva para a coleta diária: ~4 unidades por canal monitorado.
  const reserve = channels * 4;
  return { used, limit: s.dailyQuota, remaining: Math.max(0, s.dailyQuota - used), reserve, channels };
}

async function assertQuota(cost: number) {
  const q = await quotaStatus();
  if (q.used + cost > q.limit)
    throw new Error(
      `Essa busca custa cerca de ${cost} unidades e restam só ${q.remaining} hoje. A cota renova à meia-noite (horário do Pacífico, por volta das 4h ou 5h no Brasil).`,
    );
  return q;
}

// ---------- Utilidades ----------

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const isLiveOrReplay = (v: YtVideo) =>
  (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") || !!v.liveStreamingDetails;

/** Classifica Short/longo como a coleta: duração, e entre 61s e o limite confere pela URL /shorts/ (sem cota). */
async function classifyVideos(videos: YtVideo[], shortMaxSec: number) {
  const out = new Map<string, { durationSec: number | null; isShort: boolean }>();
  const toCheck: { id: string; durationSec: number | null }[] = [];
  for (const v of videos) {
    const durationSec = parseDuration(v.contentDetails?.duration);
    const c = classifyByDuration(durationSec, shortMaxSec);
    if (c === "check") toCheck.push({ id: v.id, durationSec });
    else out.set(v.id, { durationSec, isShort: c === "short" });
  }
  await mapLimit(toCheck, 8, async (x) => {
    const byUrl = await checkIsShortByUrl(x.id);
    out.set(x.id, { durationSec: x.durationSec, isShort: byUrl ?? true });
  });
  return out;
}

function toMatched(v: YtVideo, c: { durationSec: number | null; isShort: boolean }, query?: string): MatchedVideo {
  return {
    id: v.id,
    title: v.snippet.title,
    views: Number(v.statistics?.viewCount ?? 0),
    publishedAt: v.snippet.publishedAt,
    durationSec: c.durationSec,
    isShort: c.isShort,
    thumb: bestThumb(v.snippet.thumbnails),
    ...(query ? { query } : {}),
  };
}

/**
 * Força do canal como referência (só para ordenar a lista):
 * views do melhor vídeo encontrado (escala log) × quanto ele passou dos inscritos ×
 * quantas vezes o canal apareceu × bônus para canal com menos de 1 ano.
 */
export function discoveryScore(c: {
  bestViews: number;
  bestRatio: number | null;
  hits: number;
  channelCreatedAt: Date | null;
  now?: Date;
}) {
  const now = c.now ?? new Date();
  const base = Math.log10(Math.max(10, c.bestViews));
  const ratio = c.bestRatio == null ? 1 : Math.min(3, Math.max(0.4, Math.sqrt(c.bestRatio)));
  const hits = Math.min(2.5, 1 + 0.3 * Math.max(0, c.hits - 1));
  const young = c.channelCreatedAt && now.getTime() - c.channelCreatedAt.getTime() < 365 * DAY_MS ? 1.3 : 1;
  return Math.round(base * ratio * hits * young * 100) / 100;
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function channelData(c: YtChannel) {
  const t = c.snippet.thumbnails ?? {};
  const hidden = !!c.statistics?.hiddenSubscriberCount;
  return {
    title: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    thumbnailUrl: (t.medium ?? t.high ?? t.default)?.url ?? null,
    country: c.snippet.country ?? null,
    subscriberCount: hidden || c.statistics?.subscriberCount == null ? null : Number(c.statistics.subscriberCount),
    hiddenSubscribers: hidden,
    videoCount: c.statistics?.videoCount != null ? Number(c.statistics.videoCount) : null,
    viewCount: c.statistics?.viewCount != null ? Number(c.statistics.viewCount) : null,
    channelCreatedAt: c.snippet.publishedAt ? new Date(c.snippet.publishedAt) : null,
  };
}

/** Canais que já estão no nicho (não entram como "novos"). */
async function monitoredInNiche(nicheId: string) {
  const rows = await prisma.nicheChannel.findMany({ where: { nicheId }, select: { channel: { select: { externalId: true } } } });
  return new Set(rows.map((r) => r.channel.externalId));
}

/** Grava/mescla um canal encontrado. Retorna true se ele é novo neste nicho. */
async function saveCandidate(
  nicheId: string,
  yt: YtChannel,
  add: { videos?: MatchedVideo[]; query?: string; featuredBy?: string },
) {
  const data = channelData(yt);
  const prev = await prisma.discoveredChannel.findUnique({
    where: { nicheId_platform_externalId: { nicheId, platform: "youtube", externalId: yt.id } },
  });
  const byId = new Map<string, MatchedVideo>();
  for (const v of parseJson<MatchedVideo[]>(prev?.matchedVideos, [])) byId.set(v.id, v);
  for (const v of add.videos ?? []) byId.set(v.id, { ...byId.get(v.id), ...v });
  const videos = [...byId.values()].sort((a, b) => b.views - a.views).slice(0, MAX_MATCHED);
  const queries = new Set(parseJson<string[]>(prev?.queries, []));
  if (add.query) queries.add(add.query);
  const featuredBy = new Set(parseJson<string[]>(prev?.featuredBy, []));
  if (add.featuredBy) featuredBy.add(add.featuredBy);

  const bestViews = videos[0]?.views ?? 0;
  const bestRatio = data.subscriberCount && bestViews ? bestViews / data.subscriberCount : null;
  const fields = {
    ...data,
    matchedVideos: JSON.stringify(videos),
    shortHits: videos.filter((v) => v.isShort).length,
    longHits: videos.filter((v) => !v.isShort).length,
    bestViews,
    bestRatio,
    queries: JSON.stringify([...queries]),
    featuredBy: JSON.stringify([...featuredBy]),
    score: discoveryScore({
      bestViews,
      bestRatio,
      hits: videos.length + featuredBy.size,
      channelCreatedAt: data.channelCreatedAt,
    }),
    lastSeenAt: new Date(),
  };
  if (prev) {
    await prisma.discoveredChannel.update({ where: { id: prev.id }, data: fields });
    return false;
  }
  await prisma.discoveredChannel.create({ data: { nicheId, platform: "youtube", externalId: yt.id, ...fields } });
  return true;
}

// ---------- Busca por palavra-chave ----------

export type DiscoverySummary = {
  unitsUsed: number;
  videosFound: number;
  videosOfFormat: number;
  channelsFound: number;
  newChannels: number;
  alreadyMonitored: number;
  dismissedAgain: number;
  message: string;
};

function durationFor(format: Format, longDuration: LongDuration = "medium"): SearchVideoParams["videoDuration"] {
  // "short" no YouTube = até 4 minutos (todos os Shorts cabem). Longos: 4–20 min por padrão.
  return format === "short" ? "short" : longDuration;
}

/**
 * Descobre canais por palavra-chave: busca vídeos (100 unidades por palavra), confere duração e views
 * em lote, separa Short/longo, agrupa por canal e grava os canais que ainda não estão no nicho.
 */
export async function discoverBySearch(opts: SearchOptions): Promise<DiscoverySummary> {
  const keywords = [...new Set(opts.keywords.map((k) => k.trim()).filter((k) => k.length >= 2))];
  if (keywords.length === 0) throw new Error("Escreva ao menos uma palavra-chave.");
  if (keywords.length > MAX_KEYWORDS) throw new Error(`No máximo ${MAX_KEYWORDS} palavras-chave por busca (cada uma custa 100 unidades).`);
  await prisma.niche.findUniqueOrThrow({ where: { id: opts.nicheId } });
  await assertQuota(estimateSearchCost(keywords.length));
  const settings = await getSettings();

  let units = 0;
  const publishedAfter = opts.days > 0 ? new Date(Date.now() - opts.days * DAY_MS) : undefined;
  const queryOf = new Map<string, string>(); // videoId -> palavra que encontrou
  for (const q of keywords) {
    const r = await searchVideos({
      q,
      videoDuration: durationFor(opts.format, opts.longDuration),
      order: opts.order,
      publishedAfter,
      regionCode: opts.region || undefined,
      relevanceLanguage: opts.language || undefined,
    });
    units += SEARCH_COST;
    for (const it of r.items ?? []) if (it.id.videoId && !queryOf.has(it.id.videoId)) queryOf.set(it.id.videoId, q);
  }

  const ids = [...queryOf.keys()];
  const ytVideos = ids.length ? await fetchVideosBatch(ids) : [];
  units += Math.ceil(ids.length / 50);
  const usable = ytVideos.filter((v) => !isLiveOrReplay(v));
  const cls = await classifyVideos(usable, settings.shortMaxSec);
  const wanted = usable.filter((v) => cls.get(v.id)!.isShort === (opts.format === "short"));

  const byChannel = new Map<string, MatchedVideo[]>();
  for (const v of wanted) {
    const list = byChannel.get(v.snippet.channelId) ?? [];
    list.push(toMatched(v, cls.get(v.id)!, queryOf.get(v.id)));
    byChannel.set(v.snippet.channelId, list);
  }

  const monitored = await monitoredInNiche(opts.nicheId);
  const candidateIds = [...byChannel.keys()].filter((id) => !monitored.has(id));
  const alreadyMonitored = byChannel.size - candidateIds.length;
  const channels = candidateIds.length ? await fetchChannelsBatch(candidateIds) : [];
  units += Math.ceil(candidateIds.length / 50);

  let newChannels = 0;
  for (const yt of channels) {
    const videos = byChannel.get(yt.id) ?? [];
    const queries = [...new Set(videos.map((v) => v.query).filter(Boolean) as string[])];
    const isNew = await saveCandidate(opts.nicheId, yt, { videos, query: queries[0] });
    for (const q of queries.slice(1)) await saveCandidate(opts.nicheId, yt, { query: q });
    if (isNew) newChannels++;
  }
  const dismissedAgain = await prisma.discoveredChannel.count({
    where: { nicheId: opts.nicheId, externalId: { in: candidateIds }, status: "dismissed" },
  });

  await prisma.discoverySearch.create({
    data: {
      nicheId: opts.nicheId,
      method: "search",
      query: keywords.join(", "),
      format: opts.format,
      params: JSON.stringify({ ...opts, keywords }),
      unitsUsed: units,
      videosFound: ids.length,
      newChannels,
    },
  });

  const fmt = opts.format === "short" ? "Shorts" : "vídeos longos";
  const parts = [
    `${ids.length} vídeos encontrados, ${wanted.length} são ${fmt}, de ${byChannel.size} canais.`,
    newChannels
      ? `${newChannels} ${newChannels === 1 ? "canal novo entrou" : "canais novos entraram"} na lista.`
      : "Nenhum canal novo.",
  ];
  if (alreadyMonitored) parts.push(`${alreadyMonitored} você já monitora (bom sinal: a palavra-chave é do nicho).`);
  if (dismissedAgain) parts.push(`${dismissedAgain} já estava${dismissedAgain === 1 ? "" : "m"} em "Ignorados".`);
  parts.push(`Usou ${units} unidades da cota.`);
  return {
    unitsUsed: units,
    videosFound: ids.length,
    videosOfFormat: wanted.length,
    channelsFound: byChannel.size,
    newChannels,
    alreadyMonitored,
    dismissedAgain,
    message: parts.join(" "),
  };
}

// ---------- Canais indicados pelos monitorados ----------

/**
 * Lê as seções "canais em destaque" de cada canal monitorado do nicho (1 unidade por canal)
 * e grava os canais indicados que ainda não estão no nicho.
 */
export async function discoverFeatured(nicheId: string): Promise<DiscoverySummary> {
  const links = await prisma.nicheChannel.findMany({
    where: { nicheId },
    select: { channel: { select: { externalId: true, title: true } } },
  });
  if (links.length === 0) throw new Error("Este nicho ainda não tem canais monitorados para indicar outros.");
  await assertQuota(estimateFeaturedCost(links.length));

  let units = 0;
  const monitored = new Set(links.map((l) => l.channel.externalId));
  const indicatedBy = new Map<string, Set<string>>();
  for (const l of links) {
    try {
      const ids = await featuredChannelsOf(l.channel.externalId);
      for (const id of ids) {
        if (monitored.has(id)) continue;
        const set = indicatedBy.get(id) ?? new Set<string>();
        set.add(l.channel.title);
        indicatedBy.set(id, set);
      }
    } catch (e) {
      if (e instanceof Error && /Cota/.test(e.message)) throw e;
    } finally {
      units += 1;
    }
  }

  const ids = [...indicatedBy.keys()];
  const channels = ids.length ? await fetchChannelsBatch(ids) : [];
  units += Math.ceil(ids.length / 50);
  let newChannels = 0;
  for (const yt of channels) {
    let isNew = false;
    for (const by of indicatedBy.get(yt.id) ?? []) isNew = (await saveCandidate(nicheId, yt, { featuredBy: by })) || isNew;
    if (isNew) newChannels++;
  }

  await prisma.discoverySearch.create({
    data: { nicheId, method: "featured", format: "any", params: "{}", unitsUsed: units, newChannels },
  });
  const message =
    ids.length === 0
      ? `Nenhum dos ${links.length} canais monitorados indica outros canais na própria página (é comum em canais dark). Usou ${units} unidades.`
      : `${ids.length} canais indicados pelos seus canais monitorados; ${newChannels} novo${newChannels === 1 ? "" : "s"} na lista. Use o "Raio-x" para ver se fazem Shorts ou longos. Usou ${units} unidades.`;
  return {
    unitsUsed: units,
    videosFound: 0,
    videosOfFormat: 0,
    channelsFound: ids.length,
    newChannels,
    alreadyMonitored: 0,
    dismissedAgain: 0,
    message,
  };
}

// ---------- Raio-x de um canal encontrado ----------

export const ANALYZE_COST = 2;

/** Mede o formato e o desempenho dos últimos 50 uploads do canal (2 unidades). */
export async function analyzeCandidate(id: string): Promise<ChannelAnalysis> {
  const cand = await prisma.discoveredChannel.findUniqueOrThrow({ where: { id } });
  await assertQuota(ANALYZE_COST);
  const settings = await getSettings();
  const uploads = "UU" + cand.externalId.slice(2);
  const page = await uploadsPage(uploads);
  const ids = (page.items ?? []).map((i) => i.contentDetails.videoId);
  const videos = (ids.length ? await fetchVideosBatch(ids) : []).filter((v) => !isLiveOrReplay(v));
  const cls = await classifyVideos(videos, settings.shortMaxSec);
  const analysis = computeAnalysis(videos.map((v) => toMatched(v, cls.get(v.id)!)));
  await prisma.discoveredChannel.update({
    where: { id },
    data: { analysis: JSON.stringify(analysis), analyzedAt: new Date() },
  });
  return analysis;
}

/** Cálculo do raio-x (separado para teste). */
export function computeAnalysis(videos: MatchedVideo[], now = new Date()): ChannelAnalysis {
  const shorts = videos.filter((v) => v.isShort);
  const longs = videos.filter((v) => !v.isShort);
  const medS = median(shorts.map((v) => v.views));
  const medL = median(longs.map((v) => v.views));
  const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const spanWeeks = dates.length >= 2 ? (now.getTime() - dates[0]) / (7 * DAY_MS) : null;
  const outliers = videos.filter((v) => {
    const m = v.isShort ? medS : medL;
    return m != null && m > 0 && v.views >= 3 * m;
  }).length;
  const best = [...videos].sort((a, b) => b.views - a.views)[0] ?? null;
  return {
    sampled: videos.length,
    shorts: shorts.length,
    longs: longs.length,
    shortShare: videos.length ? shorts.length / videos.length : 0,
    medianShortViews: medS,
    medianLongViews: medL,
    uploadsPerWeek: spanWeeks && spanWeeks > 0 ? Math.round((videos.length / spanWeeks) * 10) / 10 : null,
    lastUploadAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
    firstSampledAt: dates.length ? new Date(dates[0]).toISOString() : null,
    outliers,
    best,
  };
}

// ---------- Ações sobre a lista ----------

/** Passa a monitorar o canal no nicho (1 unidade para ler os dados completos). */
export async function monitorCandidate(id: string) {
  const cand = await prisma.discoveredChannel.findUniqueOrThrow({ where: { id } });
  const r = await addChannelToNiche(cand.nicheId, cand.externalId);
  await prisma.discoveredChannel.update({ where: { id }, data: { status: "monitored" } });
  return r.channel;
}

export async function setCandidateStatus(id: string, status: "new" | "dismissed") {
  await prisma.discoveredChannel.update({ where: { id }, data: { status } });
}

// ---------- Leitura para a tela ----------

export type CandidateSort = "score" | "views" | "ratio" | "small" | "young";

export async function listCandidates(opts: { nicheId: string; status: string; format: Format | "all"; sort: CandidateSort }) {
  const rows = await prisma.discoveredChannel.findMany({ where: { nicheId: opts.nicheId, status: opts.status } });
  const now = Date.now();
  const items = rows.map((r) => ({
    ...r,
    ageMonths: r.channelCreatedAt ? Math.floor((now - r.channelCreatedAt.getTime()) / (30.4 * DAY_MS)) : null,
    isYoung: !!r.channelCreatedAt && now - r.channelCreatedAt.getTime() < 365 * DAY_MS,
    videos: parseJson<MatchedVideo[]>(r.matchedVideos, []),
    queryList: parseJson<string[]>(r.queries, []),
    featuredList: parseJson<string[]>(r.featuredBy, []),
    analysisData: parseJson<ChannelAnalysis | null>(r.analysis, null),
  }));
  const fits = (c: (typeof items)[number], f: Format) => {
    if (f === "short" ? c.shortHits > 0 : c.longHits > 0) return true;
    const a = c.analysisData;
    if (a && a.sampled > 0) return f === "short" ? a.shortShare >= 0.3 : a.shortShare <= 0.7;
    return c.shortHits + c.longHits === 0 && !a; // sem dados de formato ainda: aparece nas duas abas
  };
  const counts = {
    short: items.filter((c) => fits(c, "short")).length,
    long: items.filter((c) => fits(c, "long")).length,
    all: items.length,
  };
  const filtered = opts.format === "all" ? items : items.filter((c) => fits(c, opts.format as Format));
  const key: Record<CandidateSort, (c: (typeof items)[number]) => number> = {
    score: (c) => c.score,
    views: (c) => c.bestViews,
    ratio: (c) => c.bestRatio ?? -1,
    small: (c) => -(c.subscriberCount ?? Number.MAX_SAFE_INTEGER),
    young: (c) => c.channelCreatedAt?.getTime() ?? 0,
  };
  filtered.sort((a, b) => key[opts.sort](b) - key[opts.sort](a));
  return { items: filtered, counts };
}

/** Sugestões de palavras-chave a partir dos títulos dos vídeos que mais performaram no nicho (sem cota). */
export async function suggestKeywords(nicheId: string, limit = 12): Promise<string[]> {
  const videos = await prisma.video.findMany({
    where: { channel: { niches: { some: { nicheId } } } },
    orderBy: { viewCount: "desc" },
    take: 300,
    select: { title: true },
  });
  const df = new Map<string, number>();
  for (const v of videos) {
    const t = tokenize(v.title).filter((w) => !/^\d+$/.test(w) && w.length >= 3);
    const grams = new Set<string>(t);
    for (let i = 0; i + 1 < t.length; i++) grams.add(`${t[i]} ${t[i + 1]}`);
    for (const g of grams) df.set(g, (df.get(g) ?? 0) + 1);
  }
  const min = Math.max(2, Math.floor(videos.length * 0.02));
  const ranked = [...df.entries()]
    .filter(([g, n]) => n >= (g.includes(" ") ? Math.max(2, Math.floor(min / 2)) : min))
    .sort((a, b) => b[1] * (b[0].includes(" ") ? 1.5 : 1) - a[1] * (a[0].includes(" ") ? 1.5 : 1));
  const out: string[] = [];
  for (const [g] of ranked) {
    // evita repetir a palavra solta quando o par já entrou
    if (!g.includes(" ") && out.some((o) => o.split(" ").includes(g))) continue;
    out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

export async function recentSearches(nicheId: string, take = 8) {
  return prisma.discoverySearch.findMany({ where: { nicheId }, orderBy: { createdAt: "desc" }, take });
}
