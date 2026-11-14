/**
 * Login com Google (OAuth, só leitura) para ler o YouTube Analytics dos MEUS canais.
 *
 * - Nunca pedimos senha: o Google abre a tela de login dele e devolve um "token" que só permite LER
 *   (escopos youtube.readonly e yt-analytics.readonly). Não dá para postar, apagar nem mudar nada.
 * - O token fica só no banco local (prisma/radar.db). "Sair" apaga.
 * - Precisa de um "cliente OAuth" criado no Google Cloud (passo a passo no README): GOOGLE_CLIENT_ID e
 *   GOOGLE_CLIENT_SECRET no .env.
 */
import { prisma } from "./db";
import { logQuota } from "./quota";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export class GoogleAuthError extends Error {}

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUriFor = (origin: string) => `${origin.replace(/\/$/, "")}/api/google/callback`;

export function authUrl(state: string, redirectUri: string) {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // devolve o refresh_token: o app renova o acesso sozinho
    prompt: "consent select_account", // deixa escolher a conta/canal (contas de marca)
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const code = body.error ?? String(res.status);
    if (code === "invalid_grant") throw new GoogleAuthError("O login do Google expirou ou foi cancelado. Clique em “Entrar com Google” de novo.");
    if (code === "invalid_client" || code === "unauthorized_client")
      throw new GoogleAuthError("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET errado no .env. Confira e reinicie o app.");
    if (code === "redirect_uri_mismatch")
      throw new GoogleAuthError("O endereço de retorno não está cadastrado no Google Cloud. Adicione http://localhost:3000/api/google/callback no cliente OAuth.");
    throw new GoogleAuthError(`O Google recusou o login (${code}${body.error_description ? `: ${body.error_description}` : ""}).`);
  }
  return body;
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });

/** Canal dono do token (1 unidade de cota da YouTube Data API). */
export async function mineChannel(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  await logQuota("channels.list");
  if (!res.ok) throw new GoogleAuthError(`Não consegui ler o canal dessa conta (YouTube respondeu ${res.status}).`);
  const body = (await res.json()) as {
    items?: {
      id: string;
      snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
      statistics?: { subscriberCount?: string };
    }[];
  };
  const ch = body.items?.[0];
  if (!ch) throw new GoogleAuthError("Essa conta Google não tem canal no YouTube. Entre com a conta (ou o canal de marca) certo.");
  return ch;
}

/** Salva o login de um canal (um token por canal; entrar de novo substitui). */
export async function saveGoogleAuth(channelExternalId: string, channelTitle: string, t: TokenResponse) {
  const prev = await prisma.googleAuth.findUnique({ where: { channelExternalId } });
  const data = {
    channelTitle,
    accessToken: t.access_token,
    // O Google só manda o refresh_token no primeiro consentimento; mantém o antigo se não vier.
    refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? GOOGLE_SCOPES.join(" "),
    status: "ok",
    lastError: null,
  };
  return prisma.googleAuth.upsert({ where: { channelExternalId }, create: { channelExternalId, ...data }, update: data });
}

/** Token válido para o canal (renova sozinho quando vence). null = canal sem login. */
export async function accessTokenFor(channelExternalId: string): Promise<string | null> {
  const a = await prisma.googleAuth.findUnique({ where: { channelExternalId } });
  if (!a) return null;
  if (a.status === "expired") throw new GoogleAuthError("O login do Google deste canal expirou. Clique em “Entrar com Google” de novo.");
  if (a.expiresAt.getTime() > Date.now() + 30_000) return a.accessToken;
  if (!a.refreshToken) {
    await prisma.googleAuth.update({ where: { id: a.id }, data: { status: "expired", lastError: "sem refresh_token" } });
    throw new GoogleAuthError("O login do Google deste canal expirou. Clique em “Entrar com Google” de novo.");
  }
  try {
    const t = await tokenRequest({ refresh_token: a.refreshToken, grant_type: "refresh_token" });
    await saveGoogleAuth(channelExternalId, a.channelTitle, t);
    return t.access_token;
  } catch (e) {
    if (e instanceof GoogleAuthError && /expirou|cancelado/.test(e.message))
      await prisma.googleAuth.update({ where: { id: a.id }, data: { status: "expired", lastError: e.message } });
    throw e;
  }
}

// ---------- YouTube Analytics API ----------

type Report = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };

export async function analyticsQuery(accessToken: string, params: Record<string, string>): Promise<Record<string, number | string>[]> {
  const qs = new URLSearchParams({ ids: "channel==MINE", ...params });
  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `YouTube Analytics respondeu ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error?.message) msg += `: ${b.error.message}`;
    } catch {
      /* corpo não-JSON */
    }
    if (res.status === 401) throw new GoogleAuthError("O login do Google não vale mais. Clique em “Entrar com Google” de novo.");
    if (res.status === 403 && /has not been used|disabled/i.test(msg))
      throw new GoogleAuthError('A "YouTube Analytics API" não está ativada no seu projeto do Google Cloud. Ative em APIs e serviços → Biblioteca.');
    throw new GoogleAuthError(msg);
  }
  const r = (await res.json()) as Report;
  const cols = (r.columnHeaders ?? []).map((c) => c.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(row.map((v, i) => [cols[i], v])));
}

export type VideoAnalytics = {
  views: number | null;
  minutesWatched: number | null;
  avgViewDuration: number | null; // segundos
  avgViewPct: number | null; // % do vídeo
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subsGained: number | null;
  subsLost: number | null;
  /** Dia mais recente com dados (o Analytics atrasa 1–2 dias). */
  throughDay: string | null;
};
export type RetentionPoint = { r: number; watch: number; rel: number | null };
export type TrafficPoint = { source: string; views: number };
export type DailyPoint = { day: string; views: number; minutes: number | null };

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Nomes das fontes de tráfego em português. */
export const TRAFFIC_LABEL: Record<string, string> = {
  SHORTS: "Feed de Shorts",
  YT_SEARCH: "Busca do YouTube",
  RELATED_VIDEO: "Vídeos sugeridos",
  BROWSE: "Página inicial / inscrições",
  SUBSCRIBER: "Inscritos",
  YT_CHANNEL: "Página do canal",
  EXT_URL: "Sites e apps externos",
  NO_LINK_OTHER: "Direto / desconhecido",
  NOTIFICATION: "Notificações",
  PLAYLIST: "Playlists",
  YT_OTHER_PAGE: "Outras páginas do YouTube",
  END_SCREEN: "Tela final",
  ANNOTATION: "Cards",
  HASHTAGS: "Hashtags",
  SOUND_PAGE: "Página do som",
  CAMPAIGN_CARD: "Campanhas",
  VIDEO_REMIXES: "Remixes",
  SHORTS_CONTENT_LINKS: "Links em Shorts",
  LIVE_REDIRECT: "Redirecionamento de live",
  PRODUCT_PAGE: "Página de produto",
  IMMERSIVE_LIVE: "Live imersiva",
};

/**
 * Tudo o que o Analytics tem de um vídeo: totais, curva de retenção, fontes de tráfego e views por dia.
 * São 4 consultas (a cota do Analytics é separada da Data API e bem folgada).
 */
export async function fetchVideoAnalytics(accessToken: string, videoExternalId: string, publishedAt: Date, today: string) {
  const startDate = new Date(publishedAt.getTime() - 86_400_000).toISOString().slice(0, 10);
  const base = { startDate, endDate: today, filters: `video==${videoExternalId}` };

  const [totalsRows, dailyRows] = await Promise.all([
    analyticsQuery(accessToken, {
      ...base,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost",
    }),
    analyticsQuery(accessToken, { ...base, dimensions: "day", metrics: "views,estimatedMinutesWatched", sort: "day" }),
  ]);
  const t = totalsRows[0] ?? {};
  const daily: DailyPoint[] = dailyRows.map((r) => ({ day: String(r.day), views: Number(r.views ?? 0), minutes: num(r.estimatedMinutesWatched) }));
  const totals: VideoAnalytics = {
    views: num(t.views),
    minutesWatched: num(t.estimatedMinutesWatched),
    avgViewDuration: num(t.averageViewDuration),
    avgViewPct: num(t.averageViewPercentage),
    likes: num(t.likes),
    comments: num(t.comments),
    shares: num(t.shares),
    subsGained: num(t.subscribersGained),
    subsLost: num(t.subscribersLost),
    throughDay: daily.filter((d) => d.views > 0).at(-1)?.day ?? null,
  };

  // Retenção e tráfego podem não existir ainda (vídeo novo); não derrubam o resto.
  let retention: RetentionPoint[] = [];
  let traffic: TrafficPoint[] = [];
  try {
    const rows = await analyticsQuery(accessToken, {
      ...base,
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      sort: "elapsedVideoTimeRatio",
    });
    retention = rows.map((r) => ({ r: Number(r.elapsedVideoTimeRatio), watch: Number(r.audienceWatchRatio), rel: num(r.relativeRetentionPerformance) }));
  } catch (e) {
    if (e instanceof GoogleAuthError && /login/.test(e.message)) throw e;
  }
  try {
    const rows = await analyticsQuery(accessToken, { ...base, dimensions: "insightTrafficSourceType", metrics: "views", sort: "-views" });
    traffic = rows.map((r) => ({ source: String(r.insightTrafficSourceType), views: Number(r.views ?? 0) }));
  } catch (e) {
    if (e instanceof GoogleAuthError && /login/.test(e.message)) throw e;
  }
  return { totals, retention, traffic, daily };
}
