import { getSettings } from "./settings";
import { logQuota, type QuotaEndpoint } from "./quota";

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {
  constructor(
    message: string,
    public status?: number,
    public reason?: string,
  ) {
    super(message);
  }
}

/**
 * Chamada à YouTube Data API v3. A chave vai no cabeçalho X-goog-api-key
 * (não na URL), e cada chamada é registrada no controle de cota.
 */
export async function ytGet<T>(endpoint: QuotaEndpoint, params: Record<string, string | number>): Promise<T> {
  const { youtubeApiKey } = await getSettings();
  if (!youtubeApiKey) {
    throw new YouTubeError("Chave da YouTube Data API não configurada (veja Configurações ou o arquivo .env).");
  }
  const path = endpoint.replace(".list", "");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${API}/${path}?${qs}`, {
    headers: { "X-goog-api-key": youtubeApiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let reason: string | undefined;
    let msg = `YouTube API respondeu ${res.status}`;
    try {
      const body = await res.json();
      reason = body?.error?.errors?.[0]?.reason;
      if (body?.error?.message) msg += `: ${body.error.message}`;
    } catch {
      /* corpo não-JSON */
    }
    if (res.status === 400 && /API key not valid/i.test(msg))
      msg = "Chave da YouTube API inválida. Confira em Configurações ou no arquivo .env.";
    else if (res.status !== 400 && res.status !== 401) await logQuota(endpoint);
    if (reason === "quotaExceeded") msg = "Cota diária da YouTube API esgotada. Ela renova à meia-noite (horário do Pacífico).";
    throw new YouTubeError(msg, res.status, reason);
  }
  await logQuota(endpoint);
  return (await res.json()) as T;
}

// ---------- Tipos mínimos da API ----------

type Thumbs = Record<string, { url: string; width?: number; height?: number }>;

export type YtChannel = {
  id: string;
  snippet: {
    title: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: Thumbs;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type ListResponse<T> = { items?: T[]; nextPageToken?: string; pageInfo?: { totalResults: number } };

// ---------- Interpretação do que o usuário colou ----------

export type ChannelQuery =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "custom"; value: string }
  | { kind: "video"; value: string };

/** Aceita URL de canal, @handle, ID (UC...), /user/, /c/ ou link de vídeo. */
export function parseChannelInput(raw: string): ChannelQuery | null {
  const input = raw.trim();
  if (!input) return null;
  if (/^UC[\w-]{22}$/.test(input)) return { kind: "id", value: input };
  if (/^@[\w.\-À-￿]+$/.test(input)) return { kind: "handle", value: input };

  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    url = null;
  }
  if (url && /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) {
    if (/youtu\.be$/i.test(url.hostname)) {
      const id = url.pathname.split("/")[1];
      return id ? { kind: "video", value: id } : null;
    }
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const v = url.searchParams.get("v");
    if (parts[0] === "watch" && v) return { kind: "video", value: v };
    if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && parts[1])
      return { kind: "video", value: parts[1] };
    if (parts[0]?.startsWith("@")) return { kind: "handle", value: parts[0] };
    if (parts[0] === "channel" && parts[1]) return { kind: "id", value: parts[1] };
    if (parts[0] === "user" && parts[1]) return { kind: "username", value: parts[1] };
    if (parts[0] === "c" && parts[1]) return { kind: "custom", value: parts[1] };
    if (parts[0]) return { kind: "custom", value: parts[0] };
    return null;
  }
  // Texto solto sem @: trata como handle
  if (/^[\w.\-À-￿]{3,}$/.test(input)) return { kind: "handle", value: `@${input}` };
  return null;
}

const CHANNEL_PARTS = "snippet,statistics,contentDetails";

async function channelBy(params: Record<string, string>): Promise<YtChannel | null> {
  const r = await ytGet<ListResponse<YtChannel>>("channels.list", { part: CHANNEL_PARTS, ...params });
  return r.items?.[0] ?? null;
}

/** Busca o ID do canal na página pública (sem gastar cota), para URLs /c/ antigas. */
async function scrapeChannelId(path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/${path}`, {
      headers: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", Cookie: "CONSENT=YES+1" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ??
      html.match(/"channelId":"(UC[\w-]{22})"/) ??
      html.match(/"externalId":"(UC[\w-]{22})"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Resolve o que o usuário colou para os dados completos do canal. */
export async function resolveChannel(raw: string): Promise<YtChannel> {
  const q = parseChannelInput(raw);
  if (!q) throw new YouTubeError("Não reconheci isso como canal. Cole a URL do canal, o @handle ou o ID (UC...).");

  let ch: YtChannel | null = null;
  switch (q.kind) {
    case "id":
      ch = await channelBy({ id: q.value });
      break;
    case "handle":
      ch = await channelBy({ forHandle: q.value });
      break;
    case "username":
      ch = (await channelBy({ forUsername: q.value })) ?? (await channelBy({ forHandle: `@${q.value}` }));
      break;
    case "custom": {
      // Muitas URLs personalizadas coincidem com o handle; senão, lê a página.
      ch = await channelBy({ forHandle: `@${q.value}` });
      if (!ch) {
        const id = await scrapeChannelId(`c/${encodeURIComponent(q.value)}`);
        if (id) ch = await channelBy({ id });
      }
      break;
    }
    case "video": {
      const r = await ytGet<ListResponse<{ snippet: { channelId: string } }>>("videos.list", {
        part: "snippet",
        id: q.value,
      });
      const cid = r.items?.[0]?.snippet.channelId;
      if (cid) ch = await channelBy({ id: cid });
      break;
    }
  }
  if (!ch) throw new YouTubeError("Canal não encontrado no YouTube.");
  return ch;
}

/** Busca dados de vários canais em lote (até 50 por chamada = 1 unidade). */
export async function fetchChannelsBatch(ids: string[]): Promise<YtChannel[]> {
  const out: YtChannel[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await ytGet<ListResponse<YtChannel>>("channels.list", {
      part: CHANNEL_PARTS,
      id: chunk.join(","),
      maxResults: 50,
    });
    out.push(...(r.items ?? []));
  }
  return out;
}

/** Converte a resposta da API para os campos do modelo Channel. */
export function channelFields(c: YtChannel) {
  const t = c.snippet.thumbnails ?? {};
  const hidden = !!c.statistics?.hiddenSubscriberCount;
  return {
    externalId: c.id,
    title: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    description: c.snippet.description ?? null,
    thumbnailUrl: (t.high ?? t.medium ?? t.default)?.url ?? null,
    country: c.snippet.country ?? null,
    subscriberCount: hidden || c.statistics?.subscriberCount == null ? null : Number(c.statistics.subscriberCount),
    hiddenSubscribers: hidden,
    videoCount: c.statistics?.videoCount != null ? Number(c.statistics.videoCount) : null,
    viewCount: c.statistics?.viewCount != null ? Number(c.statistics.viewCount) : null,
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    channelCreatedAt: c.snippet.publishedAt ? new Date(c.snippet.publishedAt) : null,
    statsFetchedAt: new Date(),
  };
}

export const channelUrl = (c: { externalId: string; handle?: string | null }) =>
  c.handle ? `https://www.youtube.com/${c.handle}` : `https://www.youtube.com/channel/${c.externalId}`;

// ---------- Vídeos ----------

export type YtPlaylistItem = {
  contentDetails: { videoId: string; videoPublishedAt?: string };
  snippet: { title: string; publishedAt: string };
};

export type YtVideo = {
  id: string;
  snippet: {
    channelId: string;
    title: string;
    description?: string;
    tags?: string[];
    publishedAt: string;
    thumbnails?: Thumbs;
    liveBroadcastContent?: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  /** Presente quando o vídeo é (ou foi) uma transmissão ao vivo. */
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; scheduledStartTime?: string };
};

/** Uma página (até 50) da playlist de uploads, do mais novo para o mais antigo. */
export async function uploadsPage(playlistId: string, pageToken?: string) {
  return ytGet<ListResponse<YtPlaylistItem>>("playlistItems.list", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
}

/** Detalhes de vídeos em lote (50 por unidade de cota). */
export async function fetchVideosBatch(ids: string[]): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await ytGet<ListResponse<YtVideo>>("videos.list", {
      part: "snippet,contentDetails,statistics,liveStreamingDetails", // mesma cota (1 unidade por lote)
      id: ids.slice(i, i + 50).join(","),
      maxResults: 50,
    });
    out.push(...(r.items ?? []));
  }
  return out;
}

/** Converte duração ISO 8601 (PT1H2M3S) em segundos. */
export function parseDuration(iso?: string): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/**
 * Confere se o vídeo é Short pela URL /shorts/ (não gasta cota):
 * Shorts respondem 200; vídeos comuns redirecionam para /watch.
 * Retorna null se não deu para saber.
 */
export async function checkIsShortByUrl(videoId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      headers: { Cookie: "CONSENT=YES+1" },
      cache: "no-store",
    });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/\/watch/.test(loc)) return false;
      if (/consent\./.test(loc)) return null;
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

export const bestThumb = (t?: Thumbs) => (t?.maxres ?? t?.standard ?? t?.high ?? t?.medium ?? t?.default)?.url ?? null;
export const videoUrl = (externalId: string, isShort?: boolean) =>
  isShort ? `https://www.youtube.com/shorts/${externalId}` : `https://www.youtube.com/watch?v=${externalId}`;
