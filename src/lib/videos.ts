import { prisma } from "./db";
import { getSettings } from "./settings";
import { upsertChannel } from "./channels";
import { classifyByDuration } from "./metrics";
import {
  bestThumb,
  checkIsShortByUrl,
  fetchChannelsBatch,
  fetchVideosBatch,
  parseChannelInput,
  parseDuration,
  YouTubeError,
} from "./youtube";

/** Extrai o ID do vídeo de uma URL (watch, youtu.be, shorts, embed) ou do próprio ID de 11 caracteres. */
export function parseVideoId(raw: string): string | null {
  const s = raw.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const q = parseChannelInput(s);
  return q?.kind === "video" && /^[\w-]{11}$/.test(q.value) ? q.value : null;
}

/**
 * Garante que o vídeo exista no banco (para estudar um vídeo que não veio do radar).
 * O canal é gravado, mas SEM nicho: não entra no radar nem na coleta diária.
 * Custa 1–2 unidades de cota. Também será usado pela importação dos estudos externos.
 */
export async function ensureVideo(raw: string) {
  const id = parseVideoId(raw);
  if (!id) throw new YouTubeError("Não reconheci isso como link de vídeo do YouTube.");
  const existing = await prisma.video.findUnique({ where: { platform_externalId: { platform: "youtube", externalId: id } } });
  if (existing) return existing;

  const [yv] = await fetchVideosBatch([id]);
  if (!yv) throw new YouTubeError("Vídeo não encontrado (pode ser privado ou ter sido removido).");

  let channel = await prisma.channel.findUnique({
    where: { platform_externalId: { platform: "youtube", externalId: yv.snippet.channelId } },
  });
  if (!channel) {
    const [yc] = await fetchChannelsBatch([yv.snippet.channelId]);
    if (!yc) throw new YouTubeError("Canal do vídeo não encontrado.");
    channel = await upsertChannel(yc);
  }

  const s = await getSettings();
  const durationSec = parseDuration(yv.contentDetails?.duration);
  const c = classifyByDuration(durationSec, s.shortMaxSec);
  let isShort = c === "short";
  let shortSource = "duration";
  if (c === "check") {
    const byUrl = await checkIsShortByUrl(yv.id);
    isShort = byUrl ?? true;
    shortSource = byUrl == null ? "duration" : "url";
  }
  const st = yv.statistics ?? {};
  return prisma.video.create({
    data: {
      externalId: yv.id,
      channelId: channel.id,
      title: yv.snippet.title,
      description: yv.snippet.description ?? null,
      tags: yv.snippet.tags ? JSON.stringify(yv.snippet.tags) : null,
      thumbnailUrl: bestThumb(yv.snippet.thumbnails),
      publishedAt: new Date(yv.snippet.publishedAt),
      durationSec,
      isShort,
      shortSource,
      viewCount: Number(st.viewCount ?? 0),
      likeCount: st.likeCount != null ? Number(st.likeCount) : null,
      commentCount: st.commentCount != null ? Number(st.commentCount) : null,
      defaultLang: yv.snippet.defaultAudioLanguage ?? yv.snippet.defaultLanguage ?? null,
      statsFetchedAt: new Date(),
    },
  });
}

/** Vídeos com algum estudo (transcrição ou diagnóstico) — não podem sumir quando o canal sai do nicho. */
export const studiedVideoFilter = {
  OR: [{ transcript: { isNot: null } }, { diagnosis: { isNot: null } }, { favorite: { isNot: null } }],
};
