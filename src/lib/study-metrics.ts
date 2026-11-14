/**
 * Medidas objetivas do vídeo, calculadas em código (nunca pelo Claude).
 * O Claude só aponta ONDE acontecem as viradas ("beats"); os intervalos entre elas são medidos aqui.
 */
import { countWords, type Segment } from "./transcript";

export type Beat = { t: number; kind: string; text: string };

export type TitleMetrics = {
  chars: number;
  words: number;
  hasNumber: boolean;
  hasQuestion: boolean;
  hasExclamation: boolean;
  capsWords: string[];
  hasBrackets: boolean;
  hasColonOrDash: boolean;
  firstPerson: boolean;
  secondPerson: boolean;
  startsWithWhatIf: boolean;
  emoji: boolean;
  pattern: string;
};

export type StudyMetrics = {
  durationSec: number | null;
  wordCount: number;
  wordsPerSec: number | null;
  wordsPerMin: number | null;
  timed: boolean;
  firstWordAt: number | null;
  opening: { seconds: number; text: string; words: number } | null;
  closing: { seconds: number; text: string; hasCta: boolean; endsWithQuestion: boolean } | null;
  paceThirds: [number, number, number] | null; // palavras/s no começo, meio e fim
  questions: number;
  title: TitleMetrics;
  beats?: { count: number; avgInterval: number | null; maxGap: number | null; maxGapAt: number | null; perMinute: number | null };
};

const CTA = /\b(inscrev|subscribe|se inscreva|ativ[ae] o sininho|comenta|comment|deixa (o|seu) like|like|curt[ae]|compartilh|share|follow|segue|siga|parte 2|part 2|link na bio|link in bio)/i;

export function titleMetrics(title: string): TitleMetrics {
  const words = title.split(/\s+/).filter(Boolean);
  const capsWords = words.filter((w) => /\p{L}{3,}/u.test(w) && w === w.toUpperCase() && w !== w.toLowerCase());
  return {
    chars: [...title].length,
    words: words.length,
    hasNumber: /\d/.test(title),
    hasQuestion: /\?/.test(title),
    hasExclamation: /!/.test(title),
    capsWords,
    hasBrackets: /[([{]/.test(title),
    hasColonOrDash: /[:|–—]|\s-\s/.test(title),
    firstPerson: /\b(eu|meu|minha|me|comigo|nós|nosso|i|my|me|we|our)\b/i.test(title),
    secondPerson: /\b(você|voce|vc|seu|sua|te|you|your)\b/i.test(title),
    startsWithWhatIf: /^\s*(e se|what if|o que aconteceria|what would happen)/i.test(title),
    emoji: /\p{Extended_Pictographic}/u.test(title),
    pattern: title.replace(/\d+([.,]\d+)?/g, "[N]"),
  };
}

const windowText = (segs: Segment[], from: number, to: number) =>
  segs
    .filter((s) => s.start < to && s.start + Math.max(s.dur, 0.01) > from)
    .map((s) => s.text)
    .join(" ")
    .trim();

export function beatMetrics(beats: Beat[], durationSec: number | null) {
  const ts = [...new Set(beats.map((b) => Math.max(0, b.t)))].sort((a, b) => a - b);
  if (!ts.length) return { count: 0, avgInterval: null, maxGap: null, maxGapAt: null, perMinute: null };
  // Intervalos: do início até o 1º beat, entre beats, e do último até o fim.
  const points = [0, ...ts, ...(durationSec && durationSec > ts[ts.length - 1] ? [durationSec] : [])];
  const gaps: { gap: number; at: number }[] = [];
  for (let i = 1; i < points.length; i++) gaps.push({ gap: points[i] - points[i - 1], at: points[i - 1] });
  const inner = gaps.filter((g) => g.gap > 0);
  const max = inner.reduce((a, b) => (b.gap > a.gap ? b : a), { gap: 0, at: 0 });
  const total = durationSec ?? ts[ts.length - 1];
  return {
    count: ts.length,
    avgInterval: inner.length ? round(inner.reduce((a, b) => a + b.gap, 0) / inner.length, 1) : null,
    maxGap: inner.length ? round(max.gap, 1) : null,
    maxGapAt: inner.length ? round(max.at, 1) : null,
    perMinute: total > 0 ? round((ts.length / total) * 60, 2) : null,
  };
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function computeStudyMetrics(input: {
  title: string;
  isShort: boolean;
  durationSec: number | null;
  segments: Segment[];
  text: string;
  beats?: Beat[];
}): StudyMetrics {
  const { segments: segs, text } = input;
  const timed = segs.length > 0;
  const lastEnd = timed ? Math.max(...segs.map((s) => s.start + s.dur)) : null;
  const duration = input.durationSec ?? (lastEnd ? Math.round(lastEnd) : null);
  const wordCount = countWords(text);

  // Fala efetiva: do primeiro ao último segmento (ignora vinheta muda no fim)
  const speechSpan = timed ? Math.max(1, (lastEnd ?? 0) - segs[0].start) : duration;
  const wps = speechSpan ? wordCount / speechSpan : null;

  const openSec = input.isShort ? 3 : 30;
  const closeSec = input.isShort ? 5 : 30;

  let opening: StudyMetrics["opening"] = null;
  let closing: StudyMetrics["closing"] = null;
  let paceThirds: StudyMetrics["paceThirds"] = null;
  if (timed && duration) {
    const ot = windowText(segs, 0, openSec);
    opening = { seconds: openSec, text: ot, words: countWords(ot) };
    const end = lastEnd ?? duration;
    const ct = windowText(segs, Math.max(0, end - closeSec), end + 1);
    closing = { seconds: closeSec, text: ct, hasCta: CTA.test(ct), endsWithQuestion: /\?\s*$/.test(ct) };
    const third = duration / 3;
    paceThirds = [0, 1, 2].map((i) => {
      const w = countWords(windowText(segs, i * third, (i + 1) * third));
      return round(w / third);
    }) as [number, number, number];
  } else if (text) {
    // Sem tempos: abertura e fecho por número de palavras equivalente
    const words = text.split(/\s+/);
    const per = wps ?? 2.5;
    const nOpen = Math.max(8, Math.round(per * openSec));
    const nClose = Math.max(10, Math.round(per * closeSec));
    const ot = words.slice(0, nOpen).join(" ");
    const ct = words.slice(-nClose).join(" ");
    opening = { seconds: openSec, text: ot, words: countWords(ot) };
    closing = { seconds: closeSec, text: ct, hasCta: CTA.test(ct), endsWithQuestion: /\?\s*$/.test(ct) };
  }

  const m: StudyMetrics = {
    durationSec: duration,
    wordCount,
    wordsPerSec: wps != null ? round(wps) : null,
    wordsPerMin: wps != null ? Math.round(wps * 60) : null,
    timed,
    firstWordAt: timed ? round(segs[0].start, 1) : null,
    opening,
    closing,
    paceThirds,
    questions: (text.match(/\?/g) ?? []).length,
    title: titleMetrics(input.title),
  };
  if (input.beats) m.beats = beatMetrics(input.beats, duration);
  return m;
}

/** Transcrição com marcação de tempo compacta para o Claude: "[12] texto" a cada ~frase. */
export function transcriptForPrompt(segs: Segment[], text: string, isShort: boolean): string {
  if (!segs.length) return text;
  const step = isShort ? 0 : 4; // longos: junta trechos de ~4s para economizar tokens
  const out: string[] = [];
  let bucketStart = segs[0].start;
  let buf: string[] = [];
  for (const s of segs) {
    if (buf.length && s.start - bucketStart >= step) {
      out.push(`[${Math.round(bucketStart)}] ${buf.join(" ")}`);
      buf = [];
      bucketStart = s.start;
    }
    buf.push(s.text);
  }
  if (buf.length) out.push(`[${Math.round(bucketStart)}] ${buf.join(" ")}`);
  return out.join("\n");
}
