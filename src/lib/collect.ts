import { prisma } from "./db";
import { getSettings } from "./settings";
import { localDay, quotaUsedToday } from "./quota";
import { refreshChannels } from "./channels";
import { classifyByDuration } from "./metrics";
import {
  bestThumb,
  checkIsShortByUrl,
  fetchVideosBatch,
  parseDuration,
  uploadsPage,
  type YtPlaylistItem,
} from "./youtube";

const DAY_MS = 86_400_000;
/** Janela máxima coletada (o radar filtra 7, 14 ou 30 dias dentro dela). */
const MAX_WINDOW_DAYS = 30;
/** Teto de vídeos com estatísticas por canal por coleta. */
const MAX_VIDEOS_PER_CHANNEL = 100;
/** Teto da carga inicial do catálogo de títulos (40 unidades por canal no máximo). */
const MAX_CATALOG = 2000;
/** Considera os dados de vídeo "do dia" se coletados há menos de 20h. */
const STALE_MS = 20 * 60 * 60 * 1000;

export type ChannelCollectResult = {
  channelId: string;
  title: string;
  videos: number;
  catalogAdded: number;
  error?: string;
};

/**
 * Coleta os vídeos de um canal:
 * 1. Lê a playlist de uploads até cobrir 30 dias + vídeos suficientes para a base (teto 100).
 * 2. Na primeira vez, continua lendo para montar o catálogo completo de títulos.
 * 3. Busca estatísticas e duração em lote, classifica Short/longo e grava snapshot do dia.
 */
export async function collectChannelVideos(channelId: string): Promise<ChannelCollectResult> {
  const settings = await getSettings();
  const ch = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const result: ChannelCollectResult = { channelId, title: ch.title, videos: 0, catalogAdded: 0 };
  if (!ch.uploadsPlaylistId) {
    result.error = "Canal sem playlist de uploads.";
    return result;
  }

  const windowStart = Date.now() - MAX_WINDOW_DAYS * DAY_MS;
  // Base: N por formato; como não sabemos o formato antes de buscar, pegamos 2N além da janela.
  const minForBase = settings.avgN * 2;
  const needFullCatalog = !ch.catalogFetchedAt;
  const known = needFullCatalog
    ? new Set<string>()
    : new Set((await prisma.catalogEntry.findMany({ where: { channelId }, select: { externalId: true } })).map((c) => c.externalId));

  const statItems: YtPlaylistItem[] = [];
  const catalogItems: YtPlaylistItem[] = [];
  let pageToken: string | undefined;
  let reachedKnown = false;

  do {
    const page = await uploadsPage(ch.uploadsPlaylistId, pageToken);
    pageToken = page.nextPageToken;
    for (const it of page.items ?? []) {
      const published = new Date(it.contentDetails.videoPublishedAt ?? it.snippet.publishedAt).getTime();
      const inWindow = published >= windowStart;
      if (statItems.length < MAX_VIDEOS_PER_CHANNEL && (inWindow || statItems.length < minForBase + countInWindow(statItems, windowStart))) {
        statItems.push(it);
      }
      if (known.has(it.contentDetails.videoId)) reachedKnown = true;
      else catalogItems.push(it);
    }
    const lastItem = statItems.at(-1);
    const statsDone =
      statItems.length >= MAX_VIDEOS_PER_CHANNEL ||
      (lastItem &&
        new Date(lastItem.contentDetails.videoPublishedAt ?? lastItem.snippet.publishedAt).getTime() < windowStart &&
        statItems.length >= minForBase + countInWindow(statItems, windowStart));
    const catalogDone = needFullCatalog ? catalogItems.length >= MAX_CATALOG : reachedKnown;
    if (statsDone && catalogDone) break;
  } while (pageToken);

  // Catálogo de títulos (todas as idades)
  const catalogRows = catalogItems
    .filter((it) => it.snippet.title !== "Private video" && it.snippet.title !== "Deleted video")
    .map((it) => ({
      channelId,
      externalId: it.contentDetails.videoId,
      title: it.snippet.title,
      publishedAt: new Date(it.contentDetails.videoPublishedAt ?? it.snippet.publishedAt),
    }));
  for (const row of catalogRows) {
    await prisma.catalogEntry.upsert({
      where: { channelId_externalId: { channelId, externalId: row.externalId } },
      create: row,
      update: { title: row.title },
    });
  }
  result.catalogAdded = catalogRows.length;

  // Estatísticas dos vídeos recentes + base
  const ids = [...new Set(statItems.map((i) => i.contentDetails.videoId))];
  const ytVideos = await fetchVideosBatch(ids);
  const day = localDay();
  const existing = new Map(
    (
      await prisma.video.findMany({
        where: { platform: "youtube", externalId: { in: ids } },
        select: { externalId: true, isShort: true, shortSource: true, durationSec: true },
      })
    ).map((v) => [v.externalId, v]),
  );

  const liveReplays: string[] = [];
  for (const yv of ytVideos) {
    if (yv.snippet.liveBroadcastContent && yv.snippet.liveBroadcastContent !== "none") continue; // ao vivo/agendado
    // Gravação de live: não entra no radar nem na base (distorce a média dos vídeos longos).
    if (yv.liveStreamingDetails) {
      liveReplays.push(yv.id);
      continue;
    }
    const durationSec = parseDuration(yv.contentDetails?.duration);
    const prev = existing.get(yv.id);
    let isShort: boolean;
    let shortSource: string;
    if (prev?.shortSource === "url" && prev.durationSec === durationSec) {
      isShort = prev.isShort;
      shortSource = "url";
    } else {
      const c = classifyByDuration(durationSec, settings.shortMaxSec);
      if (c === "check") {
        const byUrl = await checkIsShortByUrl(yv.id);
        isShort = byUrl ?? true;
        shortSource = byUrl == null ? "duration" : "url";
      } else {
        isShort = c === "short";
        shortSource = "duration";
      }
    }

    const stats = yv.statistics ?? {};
    const data = {
      channelId,
      title: yv.snippet.title,
      description: yv.snippet.description ?? null,
      tags: yv.snippet.tags ? JSON.stringify(yv.snippet.tags) : null,
      thumbnailUrl: bestThumb(yv.snippet.thumbnails),
      publishedAt: new Date(yv.snippet.publishedAt),
      durationSec,
      isShort,
      shortSource,
      viewCount: Number(stats.viewCount ?? 0),
      likeCount: stats.likeCount != null ? Number(stats.likeCount) : null,
      commentCount: stats.commentCount != null ? Number(stats.commentCount) : null,
      defaultLang: yv.snippet.defaultAudioLanguage ?? yv.snippet.defaultLanguage ?? null,
      statsFetchedAt: new Date(),
    };
    const v = await prisma.video.upsert({
      where: { platform_externalId: { platform: "youtube", externalId: yv.id } },
      create: { externalId: yv.id, ...data },
      update: data,
    });
    const snap = { viewCount: data.viewCount, likeCount: data.likeCount, commentCount: data.commentCount };
    await prisma.videoSnapshot.upsert({
      where: { videoId_day: { videoId: v.id, day } },
      create: { videoId: v.id, day, ...snap },
      update: { ...snap, capturedAt: new Date() },
    });
    result.videos++;
  }

  if (liveReplays.length) {
    // Lives gravadas em coletas antigas saem do radar (menos as favoritadas).
    await prisma.video.deleteMany({ where: { platform: "youtube", externalId: { in: liveReplays }, favorite: null, transcript: null, diagnosis: null } });
  }

  await prisma.channel.update({
    where: { id: channelId },
    data: { videosFetchedAt: new Date(), ...(needFullCatalog ? { catalogFetchedAt: new Date() } : {}) },
  });
  return result;
}

function countInWindow(items: YtPlaylistItem[], windowStart: number) {
  let n = 0;
  for (const it of items) {
    if (new Date(it.contentDetails.videoPublishedAt ?? it.snippet.publishedAt).getTime() >= windowStart) n++;
  }
  return n;
}

/** Resumo da coleta em português simples (aparece ao lado do botão "Coletar agora"). */
export function collectMessage(s: Pick<CollectSummary, "channels" | "videos" | "catalogAdded" | "unitsUsed">) {
  if (s.channels === 0) return "Nada para coletar: todos os canais já foram atualizados hoje.";
  const canais = s.channels === 1 ? "1 canal" : `${s.channels} canais`;
  const catalogo =
    s.catalogAdded === 0
      ? "Nenhum vídeo novo publicado desde a última coleta (o catálogo de títulos já estava em dia)."
      : `${s.catalogAdded} ${s.catalogAdded === 1 ? "título novo entrou" : "títulos novos entraram"} no catálogo.`;
  return `Coleta concluída: ${canais}, views de ${s.videos} vídeos atualizadas. ${catalogo} Usou ${s.unitsUsed} unidades da cota diária do YouTube.`;
}

// ---------- Orquestração ----------

let running: Promise<CollectSummary> | null = null;

export type CollectSummary = {
  runId: number;
  status: "ok" | "error" | "skipped";
  channels: number;
  videos: number;
  catalogAdded: number;
  unitsUsed: number;
  errors: string[];
  message?: string;
};

export async function lastCollection() {
  return prisma.collectionRun.findFirst({ where: { kind: "videos" }, orderBy: { startedAt: "desc" } });
}

/** A coleta automática só roda se a última coleta bem-sucedida tiver mais de 20h. */
export async function isCollectionDue() {
  const last = await prisma.collectionRun.findFirst({
    where: { kind: "videos", status: "ok" },
    orderBy: { startedAt: "desc" },
  });
  const hasChannels = (await prisma.channel.count()) > 0;
  return hasChannels && (!last || Date.now() - last.startedAt.getTime() > STALE_MS);
}

/**
 * Coleta tudo: atualiza dados dos canais (em lote) e os vídeos de cada canal.
 * `force`: coleta todos os canais mesmo que já tenham sido coletados hoje.
 * `channelIds`: restringe a alguns canais (ex.: um nicho).
 */
export function collectAll(opts: { trigger: "auto" | "manual" | "script"; force?: boolean; channelIds?: string[] }) {
  if (running) return running;
  running = doCollect(opts).finally(() => {
    running = null;
  });
  return running;
}

export const isCollecting = () => running !== null;

async function doCollect(opts: { trigger: "auto" | "manual" | "script"; force?: boolean; channelIds?: string[] }): Promise<CollectSummary> {
  const run = await prisma.collectionRun.create({ data: { kind: "videos", trigger: opts.trigger } });
  const before = await quotaUsedToday();
  const summary: CollectSummary = {
    runId: run.id,
    status: "ok",
    channels: 0,
    videos: 0,
    catalogAdded: 0,
    unitsUsed: 0,
    errors: [],
  };
  try {
    await refreshChannels({ force: opts.force, channelIds: opts.channelIds });
    const cutoff = new Date(Date.now() - STALE_MS);
    const channels = await prisma.channel.findMany({
      where: {
        niches: { some: {} }, // canais sem nicho (vindos de "estudar por link") não são coletados
        ...(opts.channelIds ? { id: { in: opts.channelIds } } : {}),
        ...(opts.force ? {} : { OR: [{ videosFetchedAt: null }, { videosFetchedAt: { lt: cutoff } }] }),
      },
      select: { id: true, title: true },
    });
    for (const ch of channels) {
      try {
        const r = await collectChannelVideos(ch.id);
        summary.channels++;
        summary.videos += r.videos;
        summary.catalogAdded += r.catalogAdded;
        if (r.error) summary.errors.push(`${ch.title}: ${r.error}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        summary.errors.push(`${ch.title}: ${msg}`);
        if (/cota/i.test(msg)) break; // cota esgotada: para tudo
      }
    }
  } catch (e) {
    summary.status = "error";
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }
  summary.unitsUsed = (await quotaUsedToday()) - before;
  if (summary.errors.length && summary.channels === 0) summary.status = "error";
  summary.message = collectMessage(summary);
  await prisma.collectionRun.update({
    where: { id: run.id },
    data: {
      status: summary.status,
      unitsUsed: summary.unitsUsed,
      message: [summary.message, ...summary.errors].join("\n"),
      finishedAt: new Date(),
    },
  });
  return summary;
}
