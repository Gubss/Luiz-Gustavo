import { prisma } from "./db";

export type Segment = { start: number; dur: number; text: string };

export class TranscriptError extends Error {}

// ---------- Interpretação de formatos ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeOnce(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENTITIES[k]);
}
/** A legenda do YouTube às vezes vem codificada duas vezes ("&amp;#39;"): decodifica até estabilizar. */
export function decodeEntities(s: string) {
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}
const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Legenda do YouTube em XML: formato antigo <text start dur> ou srv3 <p t d> (milissegundos). */
export function parseTimedTextXml(xml: string): Segment[] {
  const out: Segment[] = [];
  for (const m of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(m[1].match(/start="([\d.]+)"/)?.[1] ?? NaN);
    const dur = Number(m[1].match(/dur="([\d.]+)"/)?.[1] ?? 0);
    const text = clean(m[2]);
    if (text && isFinite(start)) out.push({ start, dur, text });
  }
  if (out.length) return out;
  for (const m of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const t = Number(m[1].match(/\bt="(\d+)"/)?.[1] ?? NaN);
    const d = Number(m[1].match(/\bd="(\d+)"/)?.[1] ?? 0);
    const text = clean(m[2]);
    if (text && isFinite(t)) out.push({ start: t / 1000, dur: d / 1000, text });
  }
  return out;
}

/** Legenda em JSON (fmt=json3). */
export function parseJson3(json: string): Segment[] {
  const data = JSON.parse(json) as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
  const out: Segment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (text) out.push({ start: (ev.tStartMs ?? 0) / 1000, dur: (ev.dDurationMs ?? 0) / 1000, text });
  }
  return out;
}

function parseClock(s: string): number {
  const parts = s.replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * Transcrição colada pelo usuário. Aceita:
 * - SRT / VTT (blocos com "00:00:01,000 --> 00:00:04,000");
 * - linhas com tempo no início ("0:12 texto", "[01:02:03] texto", ou o tempo numa linha e o texto na seguinte,
 *   como sai do botão "Mostrar transcrição" do YouTube);
 * - texto corrido sem tempo (aí as medidas por segundo usam a duração do vídeo).
 */
export function parsePastedTranscript(raw: string): { segments: Segment[]; text: string; timed: boolean } {
  const input = raw.replace(/\r\n?/g, "\n").replace(/^WEBVTT[^\n]*\n/, "").trim();
  const arrow = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  if (arrow.test(input)) {
    const segs: Segment[] = [];
    for (const block of input.split(/\n\s*\n/)) {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => arrow.test(l));
      if (i < 0) continue;
      const [a, b] = lines[i].split("-->").map((x) => parseClock(x.trim().split(/\s/)[0]));
      const text = clean(lines.slice(i + 1).join(" "));
      if (text) segs.push({ start: a, dur: Math.max(0, b - a), text });
    }
    // VTT automático repete linhas entre blocos: remove repetições consecutivas
    const dedup = segs.filter((s, i) => i === 0 || s.text !== segs[i - 1].text);
    return { segments: dedup, text: dedup.map((s) => s.text).join(" "), timed: true };
  }

  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
  const clock = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(.*)$/;
  const timedLines = lines.filter((l) => clock.test(l)).length;
  if (lines.length && timedLines / lines.length >= 0.3) {
    const segs: Segment[] = [];
    let pending: number | null = null;
    for (const l of lines) {
      const m = l.match(clock);
      if (m) {
        const t = parseClock(m[1]);
        if (m[2]) segs.push({ start: t, dur: 0, text: clean(m[2]) });
        else pending = t;
      } else if (pending != null) {
        segs.push({ start: pending, dur: 0, text: clean(l) });
        pending = null;
      } else if (segs.length) {
        segs[segs.length - 1].text += ` ${clean(l)}`;
      }
    }
    for (let i = 0; i < segs.length - 1; i++) segs[i].dur = Math.max(0, segs[i + 1].start - segs[i].start);
    return { segments: segs, text: segs.map((s) => s.text).join(" "), timed: segs.length > 0 };
  }

  const text = clean(input);
  return { segments: [], text, timed: false };
}

export const countWords = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

// ---------- Busca das legendas no YouTube (sem cota da API) ----------

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string; runs?: { text: string }[] } };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const FALLBACK_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

async function listCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  // 1) Página do vídeo: pega a chave pública do player e, se der, as faixas direto do HTML.
  let apiKey = FALLBACK_INNERTUBE_KEY;
  let fromHtml: CaptionTrack[] = [];
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=pt-BR`, {
      headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", Cookie: "CONSENT=YES+1" },
      cache: "no-store",
    });
    const html = await res.text();
    apiKey = html.match(/"INNERTUBE_API_KEY":\s*"([\w-]+)"/)?.[1] ?? apiKey;
    const m = html.match(/"captionTracks":(\[[\s\S]*?\])\s*,\s*"audioTracks"/);
    if (m) fromHtml = JSON.parse(m[1]) as CaptionTrack[];
  } catch {
    /* segue para o player */
  }

  // 2) Player interno com o cliente Android: as URLs de legenda dele funcionam sem token extra.
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "pt", gl: "BR" } },
        videoId,
      }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
        playabilityStatus?: { status?: string; reason?: string };
      };
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length) return tracks;
      if (data.playabilityStatus?.status && data.playabilityStatus.status !== "OK" && !fromHtml.length)
        throw new TranscriptError(`O YouTube não liberou o vídeo: ${data.playabilityStatus.reason ?? data.playabilityStatus.status}.`);
    }
  } catch (e) {
    if (e instanceof TranscriptError) throw e;
  }
  return fromHtml;
}

/** Escolhe a faixa: idioma do vídeo primeiro, legenda feita por gente antes da automática. */
export function pickTrack<T extends { languageCode: string; kind?: string }>(tracks: T[], preferredLang?: string | null): T | null {
  if (!tracks.length) return null;
  const pref = preferredLang?.toLowerCase().split("-")[0];
  const score = (t: T) => {
    const lang = t.languageCode.toLowerCase().split("-")[0];
    return (pref && lang === pref ? 10 : 0) + (t.kind === "asr" ? 0 : 3) + (lang === "pt" ? 2 : lang === "en" ? 1 : 0);
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

async function downloadTrack(track: CaptionTrack): Promise<Segment[]> {
  const base = track.baseUrl.replace(/&fmt=[^&]*/, "");
  for (const url of [base, `${base}&fmt=json3`]) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: "CONSENT=YES+1" }, cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.text();
      if (!body.trim()) continue;
      const segs = body.trimStart().startsWith("{") ? parseJson3(body) : parseTimedTextXml(body);
      if (segs.length) return segs;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return [];
}

export type FetchedTranscript = { language: string; trackKind: "manual" | "asr"; segments: Segment[]; text: string };

export async function fetchYoutubeTranscript(externalId: string, preferredLang?: string | null): Promise<FetchedTranscript> {
  const tracks = await listCaptionTracks(externalId);
  const track = pickTrack(tracks, preferredLang);
  if (!track)
    throw new TranscriptError(
      "Esse vídeo não tem legendas disponíveis (nem automáticas). Abra o vídeo no YouTube, clique em “…” → “Mostrar transcrição”, copie e cole aqui.",
    );
  const segments = await downloadTrack(track);
  if (!segments.length)
    throw new TranscriptError(
      "O YouTube listou a legenda mas não entregou o texto (às vezes ele bloqueia). Tente de novo mais tarde ou cole a transcrição manualmente.",
    );
  return {
    language: track.languageCode,
    trackKind: track.kind === "asr" ? "asr" : "manual",
    segments,
    text: segments.map((s) => s.text).join(" "),
  };
}

// ---------- Gravação ----------

export async function saveTranscript(
  videoId: string,
  t: { language: string; source: "youtube" | "manual" | "import"; trackKind?: string | null; segments: Segment[]; text: string },
) {
  const data = {
    language: t.language,
    source: t.source,
    trackKind: t.trackKind ?? null,
    text: t.text,
    segments: t.segments.length ? JSON.stringify(t.segments) : null,
    wordCount: countWords(t.text),
  };
  return prisma.transcript.upsert({ where: { videoId }, create: { videoId, ...data }, update: data });
}

export async function fetchAndSaveTranscript(videoId: string) {
  const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
  const t = await fetchYoutubeTranscript(v.externalId, v.defaultLang);
  return saveTranscript(videoId, { ...t, source: "youtube" });
}

export const readSegments = (json: string | null | undefined): Segment[] => {
  if (!json) return [];
  try {
    return JSON.parse(json) as Segment[];
  } catch {
    return [];
  }
};
