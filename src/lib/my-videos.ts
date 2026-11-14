/**
 * Etapa 7 — meus vídeos publicados.
 *
 * - Lê a lista de uploads do meu canal (API pública, chave do YouTube) e acompanha cada vídeo.
 * - Marcos: views/likes/comentários em 1h, 3h, 6h, 12h, 24h, 48h, 3 dias, 7 dias, 14 dias e 28 dias de vida
 *   (com a idade real da medição). Dá para colar os números do Studio em cada marco.
 * - Com o login do Google: retenção, % visto, duração média, compartilhamentos, inscritos, fontes de tráfego e
 *   views por dia (YouTube Analytics; atrasa 1–2 dias).
 * - O "acompanhamento" roda sozinho enquanto o app está aberto (a cada 5 min ele confere o que está na hora)
 *   e pelo `npm run track` (Agendador de Tarefas do Windows).
 */
import type { MyVideo } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { localDay } from "./quota";
import { classifyByDuration, median } from "./metrics";
import { bestThumb, checkIsShortByUrl, fetchVideosBatch, parseDuration, resolveChannel, uploadsPage, YouTubeError } from "./youtube";
import { accessTokenFor, fetchVideoAnalytics, GoogleAuthError } from "./google";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Idades acompanhadas, em horas. */
export const CHECKPOINTS = [1, 3, 6, 12, 24, 48, 72, 168, 336, 672] as const;
export const checkpointLabel = (h: number) => (h < 24 ? `${h}h` : h === 24 ? "24h" : h === 48 ? "48h" : `${Math.round(h / 24)}d`);

/**
 * Janela em que uma medição vale para o marco: ±25% da idade (mínimo ±30 min).
 * 1h vale de 30 a 90 min; 24h de 18h a 30h; 3 dias de 54h a 90h.
 */
export const checkpointTolerance = (h: number) => Math.max(0.5, h * 0.25);

/** Acompanhamento detalhado (snapshots frequentes) só nos primeiros 30 dias. */
const TRACK_DAYS = 30;

export const ageHours = (publishedAt: Date | null, now = new Date()) =>
  publishedAt ? Math.max(0, (now.getTime() - publishedAt.getTime()) / HOUR) : null;

export function fmtAge(h: number | null) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)} dias`;
}

export class MyVideosError extends Error {}

// ---------- Ligar o perfil ao canal do YouTube ----------

/** Descobre o canal do YouTube a partir do link (1–2 unidades) e guarda ID, foto e playlist de uploads. */
export async function linkMyChannel(myChannelId: string, rawUrl?: string) {
  const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId } });
  const input = rawUrl?.trim() || c.externalId || c.url;
  if (!input) throw new MyVideosError("Cole o link do canal (ex.: https://www.youtube.com/@meucanal) ou entre com o Google.");
  const yc = await resolveChannel(input);
  const t = yc.snippet.thumbnails ?? {};
  return prisma.myChannel.update({
    where: { id: myChannelId },
    data: {
      externalId: yc.id,
      url: c.url || (yc.snippet.customUrl ? `https://www.youtube.com/${yc.snippet.customUrl}` : `https://www.youtube.com/channel/${yc.id}`),
      title: yc.snippet.title,
      thumbnailUrl: (t.high ?? t.medium ?? t.default)?.url ?? null,
      subscriberCount: yc.statistics?.subscriberCount != null ? Number(yc.statistics.subscriberCount) : null,
      uploadsPlaylistId: yc.contentDetails?.relatedPlaylists?.uploads ?? null,
    },
  });
}

// ---------- Lista de uploads ----------

/** Teto da primeira leitura do canal (1 unidade a cada 50 vídeos). */
const MAX_FIRST_SYNC = 500;

/**
 * Lê a lista de uploads. Na primeira vez lê o canal inteiro (até 500 vídeos: entram todos os títulos, que o
 * gerador usa para não repetir tema). Depois lê só a primeira página (os 50 mais novos), 1 unidade.
 */
export async function syncUploads(myChannelId: string, opts: { full?: boolean } = {}) {
  let c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId } });
  if (!c.externalId || !c.uploadsPlaylistId) c = await linkMyChannel(myChannelId);
  if (!c.uploadsPlaylistId) throw new MyVideosError("Não encontrei a lista de uploads desse canal.");
  const known = new Set(
    (await prisma.myVideo.findMany({ where: { myChannelId }, select: { externalId: true } })).map((v) => v.externalId),
  );
  const full = opts.full || known.size === 0;
  const items: { id: string; title: string; publishedAt: Date }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await uploadsPage(c.uploadsPlaylistId, pageToken);
    pageToken = page.nextPageToken;
    for (const it of page.items ?? []) {
      items.push({
        id: it.contentDetails.videoId,
        title: it.snippet.title,
        publishedAt: new Date(it.contentDetails.videoPublishedAt ?? it.snippet.publishedAt),
      });
    }
  } while (full && pageToken && items.length < MAX_FIRST_SYNC);

  const fresh = items.filter((i) => !known.has(i.id) && i.title !== "Private video" && i.title !== "Deleted video");
  for (const i of fresh) {
    await prisma.myVideo.upsert({
      where: { platform_externalId: { platform: "youtube", externalId: i.id } },
      create: {
        externalId: i.id,
        url: `https://www.youtube.com/watch?v=${i.id}`,
        myChannelId,
        title: i.title,
        publishedAt: i.publishedAt,
      },
      update: { myChannelId },
    });
    // mesma lista que o gerador usa para não repetir tema (Meus canais → vídeos do canal)
    await prisma.myChannelVideo.upsert({
      where: { myChannelId_externalId: { myChannelId, externalId: i.id } },
      create: { myChannelId, externalId: i.id, title: i.title, publishedAt: i.publishedAt },
      update: { title: i.title },
    });
  }
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { syncedAt: new Date() } });
  return { found: items.length, added: fresh.length };
}

// ---------- Números públicos + marcos ----------

type Stats = { views: number; likes: number | null; comments: number | null };

/** Grava o número no marco se a medição cair na janela do marco e for a mais próxima até agora. */
export async function recordCheckpoints(v: Pick<MyVideo, "id" | "publishedAt">, at: Date, s: Stats) {
  const age = ageHours(v.publishedAt, at);
  if (age == null) return [];
  const filled: number[] = [];
  for (const h of CHECKPOINTS) {
    if (Math.abs(age - h) > checkpointTolerance(h)) continue;
    const prev = await prisma.myVideoCheckpoint.findUnique({ where: { myVideoId_ageHours: { myVideoId: v.id, ageHours: h } } });
    const measuredAgeMin = Math.round(age * 60);
    if (prev?.measuredAgeMin != null && Math.abs(prev.measuredAgeMin - h * 60) <= Math.abs(measuredAgeMin - h * 60)) continue;
    const data = { measuredAgeMin, viewCount: s.views, likeCount: s.likes, commentCount: s.comments };
    await prisma.myVideoCheckpoint.upsert({
      where: { myVideoId_ageHours: { myVideoId: v.id, ageHours: h } },
      create: { myVideoId: v.id, ageHours: h, ...data, source: "api" },
      update: { ...data, source: prev && prev.source !== "api" ? "mixed" : "api" },
    });
    filled.push(h);
  }
  return filled;
}

/** Atualiza views/likes/comentários (50 vídeos por unidade), grava snapshot e marcos. */
export async function refreshStats(videos: MyVideo[]) {
  if (!videos.length) return { updated: 0, checkpoints: 0 };
  const s = await getSettings();
  const yt = await fetchVideosBatch(videos.map((v) => v.externalId));
  const byId = new Map(videos.map((v) => [v.externalId, v]));
  const now = new Date();
  let checkpoints = 0;
  for (const y of yt) {
    const v = byId.get(y.id);
    if (!v) continue;
    const durationSec = parseDuration(y.contentDetails?.duration);
    let isShort = v.isShort;
    let shortSource = v.shortSource;
    if (!v.shortSource || v.durationSec !== durationSec) {
      const c = classifyByDuration(durationSec, s.shortMaxSec);
      isShort = c === "short";
      shortSource = "duration";
      if (c === "check") {
        const byUrl = await checkIsShortByUrl(y.id);
        isShort = byUrl ?? true;
        shortSource = byUrl == null ? "duration" : "url";
      }
    }
    const st = { views: Number(y.statistics?.viewCount ?? 0), likes: num(y.statistics?.likeCount), comments: num(y.statistics?.commentCount) };
    const publishedAt = new Date(y.snippet.publishedAt);
    const updated = await prisma.myVideo.update({
      where: { id: v.id },
      data: {
        title: y.snippet.title,
        description: y.snippet.description ?? null,
        thumbnailUrl: bestThumb(y.snippet.thumbnails),
        publishedAt,
        durationSec,
        isShort,
        shortSource,
        url: isShort ? `https://www.youtube.com/shorts/${y.id}` : `https://www.youtube.com/watch?v=${y.id}`,
        viewCount: st.views,
        likeCount: st.likes,
        commentCount: st.comments,
        statsFetchedAt: now,
      },
    });
    await prisma.myChannelVideo.updateMany({
      where: { myChannelId: v.myChannelId, externalId: v.externalId },
      data: { title: y.snippet.title, viewCount: st.views, durationSec, isShort },
    });
    const age = ageHours(publishedAt, now) ?? 0;
    if (age <= TRACK_DAYS * 24) {
      // Snapshot: a cada medição nas primeiras 72h; depois no máximo 1 a cada 6h.
      const last = await prisma.myVideoSnapshot.findFirst({ where: { myVideoId: v.id }, orderBy: { capturedAt: "desc" } });
      if (age <= 72 || !last || now.getTime() - last.capturedAt.getTime() >= 6 * HOUR)
        await prisma.myVideoSnapshot.create({ data: { myVideoId: v.id, viewCount: st.views, likeCount: st.likes, commentCount: st.comments, capturedAt: now } });
      checkpoints += (await recordCheckpoints(updated, now, st)).length;
    }
  }
  return { updated: yt.length, checkpoints };
}

const num = (v: string | undefined) => (v == null ? null : Number(v));

// ---------- YouTube Analytics ----------

export async function refreshAnalytics(v: MyVideo & { myChannel: { externalId: string | null } }) {
  if (!v.myChannel.externalId || !v.publishedAt) return false;
  const token = await accessTokenFor(v.myChannel.externalId);
  if (!token) return false;
  try {
    const a = await fetchVideoAnalytics(token, v.externalId, v.publishedAt, localDay());
    await prisma.myVideo.update({
      where: { id: v.id },
      data: {
        analytics: JSON.stringify(a.totals),
        retention: a.retention.length ? JSON.stringify(a.retention) : v.retention,
        trafficSources: a.traffic.length ? JSON.stringify(a.traffic) : v.trafficSources,
        dailyViews: a.daily.length ? JSON.stringify(a.daily) : v.dailyViews,
        avgViewPercent: a.totals.avgViewPct ?? v.avgViewPercent,
        avgViewDuration: a.totals.avgViewDuration ?? v.avgViewDuration,
        analyticsFetchedAt: new Date(),
        analyticsError: null,
      },
    });
    return true;
  } catch (e) {
    await prisma.myVideo.update({ where: { id: v.id }, data: { analyticsError: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

export async function channelHasGoogle(externalId: string | null) {
  if (!externalId) return null;
  return prisma.googleAuth.findUnique({ where: { channelExternalId: externalId } });
}

// ---------- "Atualizar agora" ----------

/** Atualiza um canal inteiro: uploads novos, números de todos os vídeos e Analytics dos recentes. */
export async function refreshChannelNow(myChannelId: string, opts: { full?: boolean; analyticsDays?: number } = {}) {
  const sync = await syncUploads(myChannelId, { full: opts.full });
  const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId } });
  const videos = await prisma.myVideo.findMany({ where: { myChannelId }, orderBy: { publishedAt: "desc" } });
  const st = await refreshStats(videos);
  const notes = [`${sync.added} vídeo(s) novo(s)`, `${st.updated} com números atualizados`];
  const g = await channelHasGoogle(c.externalId);
  if (g) {
    const since = Date.now() - (opts.analyticsDays ?? 60) * DAY;
    const recent = (await prisma.myVideo.findMany({ where: { myChannelId, publishedAt: { gte: new Date(since) } }, include: { myChannel: true } })).slice(0, 40);
    let ok = 0;
    try {
      for (const v of recent) if (await refreshAnalytics(v)) ok++;
      notes.push(`Analytics de ${ok} vídeo(s)`);
    } catch (e) {
      notes.push(`Analytics: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return notes.join(" · ");
}

/** Atualiza um vídeo: números públicos + Analytics (se tiver login). */
export async function refreshVideoNow(myVideoId: string) {
  const v = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId }, include: { myChannel: true } });
  await refreshStats([v]);
  const notes = ["números atualizados"];
  try {
    const fresh = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId }, include: { myChannel: true } });
    if (await refreshAnalytics(fresh)) notes.push("Analytics atualizado");
  } catch (e) {
    notes.push(`Analytics: ${e instanceof Error ? e.message : String(e)}`);
  }
  return notes.join(" · ");
}

// ---------- Acompanhamento automático ----------

/** De quanto em quanto tempo conferir um vídeo, pela idade. */
export function trackEveryMs(ageH: number) {
  if (ageH < 12) return 15 * 60_000;
  if (ageH < 96) return HOUR;
  if (ageH < TRACK_DAYS * 24) return 6 * HOUR;
  return DAY;
}

/** Leitura da lista de uploads (para pegar vídeo novo logo): a cada 20 min. */
const UPLOADS_EVERY = 20 * 60_000;
/** Analytics: a cada 6h por vídeo (até 60 dias de vida). */
const ANALYTICS_EVERY = 6 * HOUR;

let tracking: Promise<TrackSummary> | null = null;

export type TrackSummary = { channels: number; newVideos: number; updated: number; checkpoints: number; analytics: number; diagnoses: number; errors: string[] };

/** Confere tudo o que está na hora (seguro rodar a cada poucos minutos: só gasta cota quando precisa). */
export function trackDue(opts: { onDiagnose?: (myVideoId: string, milestone: number) => Promise<boolean> } = {}) {
  if (tracking) return tracking;
  tracking = doTrack(opts).finally(() => {
    tracking = null;
  });
  return tracking;
}

/** Marcos em que o diagnóstico automático roda. */
export const AUTO_MILESTONES = [24, 72, 168] as const;
/** Teto de diagnósticos automáticos por dia (todas as contas), para o gasto não fugir. */
export const AUTO_DAILY_MAX = 6;

async function doTrack(opts: { onDiagnose?: (myVideoId: string, milestone: number) => Promise<boolean> }): Promise<TrackSummary> {
  const sum: TrackSummary = { channels: 0, newVideos: 0, updated: 0, checkpoints: 0, analytics: 0, diagnoses: 0, errors: [] };
  const s = await getSettings();
  if (!s.youtubeApiKey) return sum;
  const now = Date.now();
  const channels = await prisma.myChannel.findMany({ where: { OR: [{ externalId: { not: null } }, { url: { not: null } }] } });
  for (const c of channels) {
    try {
      if (!c.externalId && c.url) await linkMyChannel(c.id);
      const known = await prisma.myVideo.count({ where: { myChannelId: c.id } });
      if (!c.syncedAt || now - c.syncedAt.getTime() >= UPLOADS_EVERY || known === 0) {
        const r = await syncUploads(c.id);
        sum.newVideos += r.added;
      }
      const videos = await prisma.myVideo.findMany({ where: { myChannelId: c.id }, include: { myChannel: true } });
      const due = videos.filter((v) => {
        const age = ageHours(v.publishedAt) ?? 0;
        return !v.statsFetchedAt || now - v.statsFetchedAt.getTime() >= trackEveryMs(age) - 60_000;
      });
      if (due.length) {
        const r = await refreshStats(due);
        sum.updated += r.updated;
        sum.checkpoints += r.checkpoints;
      }
      sum.channels++;

      const g = await channelHasGoogle(c.externalId);
      if (g && g.status === "ok") {
        const forAnalytics = videos
          .filter((v) => {
            const age = ageHours(v.publishedAt) ?? 0;
            return age >= 2 && age <= 60 * 24 && (!v.analyticsFetchedAt || now - v.analyticsFetchedAt.getTime() >= ANALYTICS_EVERY);
          })
          .slice(0, 15);
        for (const v of forAnalytics) {
          try {
            if (await refreshAnalytics(v)) sum.analytics++;
          } catch (e) {
            sum.errors.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
            if (e instanceof GoogleAuthError) break;
          }
        }
      }

      if (c.autoDiagnose && opts.onDiagnose) sum.diagnoses += await autoDiagnose(c.id, opts.onDiagnose);
    } catch (e) {
      sum.errors.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof YouTubeError && e.reason === "quotaExceeded") break;
    }
  }
  return sum;
}

/** Quais vídeos estão num marco sem diagnóstico (24h, 3 dias, 7 dias). Não volta em marcos muito antigos. */
export async function pendingMilestones(myChannelId: string, now = new Date()) {
  const videos = await prisma.myVideo.findMany({
    where: { myChannelId, publishedAt: { gte: new Date(now.getTime() - 14 * DAY) } },
    include: { diagnoses: { select: { milestone: true, ageHours: true } } },
  });
  const out: { myVideoId: string; milestone: number }[] = [];
  for (const v of videos) {
    const age = ageHours(v.publishedAt, now) ?? 0;
    // o marco mais recente já alcançado (e ainda "fresco": até 2x a idade do marco)
    const m = [...AUTO_MILESTONES].reverse().find((h) => age >= h && age < h * 2);
    // um diagnóstico (automático ou manual) feito depois de o vídeo chegar ao marco já cobre o marco
    const covered = m != null && v.diagnoses.some((d) => d.milestone === m || d.ageHours >= m);
    if (m && !covered) out.push({ myVideoId: v.id, milestone: m });
  }
  return out;
}

async function autoDiagnose(myChannelId: string, run: (myVideoId: string, milestone: number) => Promise<boolean>) {
  const startOfDay = new Date(`${localDay()}T00:00:00-03:00`); // meia-noite em São Paulo
  const doneToday = await prisma.myVideoDiagnosis.count({ where: { trigger: "auto", createdAt: { gte: startOfDay } } });
  let left = AUTO_DAILY_MAX - doneToday;
  let started = 0;
  for (const p of await pendingMilestones(myChannelId)) {
    if (left <= 0) break;
    if (await run(p.myVideoId, p.milestone)) {
      started++;
      left--;
    }
  }
  return started;
}

// ---------- Comparação com o próprio canal ----------

/**
 * Mediana dos outros vídeos do canal (mesmo formato) em cada marco, para dizer "acima/abaixo do normal do canal".
 * Também a base do canal: mediana de views dos últimos 15 vídeos do formato com 7+ dias.
 */
export async function channelPeers(myChannelId: string, isShort: boolean, excludeId?: string) {
  const vids = await prisma.myVideo.findMany({
    where: { myChannelId, isShort },
    orderBy: { publishedAt: "desc" },
    include: { checkpoints: true },
  });
  return peerStats(vids, isShort, excludeId);
}

type PeerVideo = Pick<MyVideo, "id" | "isShort" | "publishedAt" | "viewCount" | "avgViewPercent" | "avgViewDuration"> & {
  checkpoints: { ageHours: number; viewCount: number | null }[];
};

/** Mesmo cálculo de `channelPeers`, a partir de vídeos já carregados (lista ordenada do mais novo ao mais velho). */
export function peerStats(all: PeerVideo[], isShort: boolean, excludeId?: string, now = new Date()) {
  const vids = all.filter((v) => v.isShort === isShort && v.id !== excludeId);
  const old = vids.filter((v) => (ageHours(v.publishedAt, now) ?? 0) >= 7 * 24 && v.viewCount != null).slice(0, 15);
  const byCheckpoint: Record<number, { median: number | null; n: number }> = {};
  for (const h of CHECKPOINTS) {
    const xs = vids.flatMap((v) => v.checkpoints.filter((c) => c.ageHours === h && c.viewCount != null).map((c) => c.viewCount as number));
    byCheckpoint[h] = { median: median(xs), n: xs.length };
  }
  const pcts = vids.map((v) => v.avgViewPercent).filter((x): x is number => x != null);
  const durs = vids.map((v) => v.avgViewDuration).filter((x): x is number => x != null);
  return {
    baseMedian: median(old.map((v) => v.viewCount as number)),
    baseCount: old.length,
    avgViewPctMedian: median(pcts),
    avgViewDurationMedian: median(durs),
    byCheckpoint,
  };
}
