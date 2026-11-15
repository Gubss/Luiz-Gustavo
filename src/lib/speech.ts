/**
 * Medidas de fala, calculadas em código (sem Claude, sem custo).
 * - Tamanho das frases (o roteiro tem que soar falado: frases curtas).
 * - O que se repete dentro de um vídeo e em que segundo ("Mas…", "Esse é o…", "minha casa").
 * - Frases e bordões que o roteiro novo repete de roteiros já publicados ou das transcrições de referência.
 */

export type Segment = { start: number; dur?: number; text: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Palavras em minúsculas, sem pontuação, mantendo os acentos (para mostrar). */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Quebra em frases: ponto, exclamação, interrogação, reticências e quebras de linha. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => /[\p{L}\p{N}]/u.test(x));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type SentenceStats = {
  sentences: number;
  /** Palavras por frase (mediana). */
  wordsPerSentence: number | null;
  /** % de frases com 1 a 3 palavras (gritos, barulhos, "Nunca.", "Chinelada."). */
  shortPct: number | null;
  /** % de frases com 15 palavras ou mais (difíceis de falar num fôlego). */
  longPct: number | null;
};

export function sentenceStats(texts: string[]): SentenceStats {
  const lens = texts.flatMap(splitSentences).map((s) => words(s).length).filter((n) => n > 0);
  if (!lens.length) return { sentences: 0, wordsPerSentence: null, shortPct: null, longPct: null };
  return {
    sentences: lens.length,
    wordsPerSentence: r1(median(lens)!),
    shortPct: Math.round((lens.filter((n) => n <= 3).length / lens.length) * 100),
    longPct: Math.round((lens.filter((n) => n >= 15).length / lens.length) * 100),
  };
}

/** Frases longas demais para falar (para avisar depois de gerar o roteiro). */
export function longSentences(lines: { who?: string; text: string }[], max = 14) {
  const out: { who?: string; sentence: string; words: number }[] = [];
  for (const l of lines)
    for (const s of splitSentences(l.text)) {
      const n = words(s).length;
      if (n > max) out.push({ who: l.who, sentence: s, words: n });
    }
  return out;
}

// Palavras que sozinhas não dizem nada (não contam como "o que se repete").
const STOP = new Set(
  "a o as os um uma uns umas de da do das dos e é em no na nos nas que se pra para por com sem eu ele ela eles elas voce você me te lhe isso esse essa este esta aquilo ai aí ja já nao não sim mais muito tudo nada ao à the of and to it is was mas entao então so só tambem também tem foi era ser ter vai vou ta tá".split(
    " ",
  ),
);

export type Repeat = { phrase: string; count: number; times: number[] };

/**
 * O que se repete dentro de UM vídeo: começos de frase ("mas", "então", "esse é o") e expressões de 2-3 palavras ("minha casa"),
 * com os segundos em que aparecem quando a transcrição tem tempos.
 */
export function repeatsInVideo(segments: Segment[] | null, text: string, min = 3, limit = 8): Repeat[] {
  const units: { t: number | null; s: string }[] = segments?.length
    ? segments.flatMap((g) => splitSentences(g.text).map((s) => ({ t: g.start, s })))
    : splitSentences(text).map((s) => ({ t: null, s }));
  const map = new Map<string, { phrase: string; times: (number | null)[] }>();
  const add = (key: string, t: number | null) => {
    const cur = map.get(key) ?? { phrase: key, times: [] };
    cur.times.push(t);
    map.set(key, cur);
  };
  for (const u of units) {
    const w = words(u.s);
    if (!w.length) continue;
    // começo de frase: 1 a 3 palavras ("mas", "esse é o", "então você")
    for (let n = 1; n <= Math.min(3, w.length); n++) add(`${w.slice(0, n).join(" ")}…`, u.t);
    // expressões de 2-3 palavras no meio da frase, se tiverem alguma palavra com conteúdo
    const seen = new Set<string>();
    for (let n = 2; n <= 3; n++)
      for (let i = 1; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        if (g.every((x) => STOP.has(x))) continue;
        const key = g.join(" ");
        if (!seen.has(key)) {
          seen.add(key);
          add(key, u.t);
        }
      }
  }
  let list = [...map.values()].filter((r) => r.times.length >= min);
  // Começo de 1 palavra só vale se não for palavra vazia ("e…", "a…"), a não ser "mas"/"então" que marcam virada.
  list = list.filter((r) => {
    const p = r.phrase.replace(/…$/, "");
    if (!r.phrase.endsWith("…") || p.includes(" ")) return true;
    return !STOP.has(p) || ["mas", "entao", "então", "ai", "aí"].includes(p);
  });
  // Tira as que são pedaço de outra com a mesma contagem ("esse é…" quando "esse é o…" tem a mesma; "minha avó" dentro de "da minha avó").
  const bare = (x: string) => x.replace(/…$/, "");
  list = list.filter(
    (r) =>
      !list.some(
        (o) =>
          o !== r &&
          o.times.length === r.times.length &&
          bare(o.phrase).length > bare(r.phrase).length &&
          (o.phrase.endsWith("…") === r.phrase.endsWith("…") ? ` ${bare(o.phrase)} `.includes(` ${bare(r.phrase)} `) : false),
      ),
  );
  return list
    .sort((a, b) => b.times.length - a.times.length || b.phrase.length - a.phrase.length)
    .slice(0, limit)
    .map((r) => ({ phrase: r.phrase, count: r.times.length, times: r.times.filter((t): t is number => t != null).map((t) => Math.round(t)) }));
}

/** Intervalo médio (s) entre as vezes que a frase aparece. */
export function avgGap(times: number[]): number | null {
  if (times.length < 2) return null;
  const s = [...times].sort((a, b) => a - b);
  return r1((s[s.length - 1] - s[0]) / (s.length - 1));
}

/** Trecho de amostra de voz: as primeiras frases até ~maxChars, cortando em fim de frase. */
export function voiceSample(text: string, maxChars = 700): string {
  const out: string[] = [];
  let n = 0;
  for (const s of splitSentences(text)) {
    if (n + s.length > maxChars && out.length) break;
    out.push(s);
    n += s.length + 1;
  }
  return out.join("\n");
}

export type Overlap = { sentence: string; source: string; match: string; kind: "frase igual" | "trecho igual" };

/**
 * Frases do roteiro novo que repetem frases ou trechos (4+ palavras seguidas) de outros textos:
 * roteiros publicados do canal (bordão repetido) ou transcrições de referência (fala copiada).
 * Frases que aparecem em TODOS os textos, ou curtinhas que aparecem em 2+, são fala fixa do canal (ex.: "E se inscreve.") e ficam de fora.
 */
export function findOverlaps(newLines: string[], sources: { label: string; text: string }[], ngram = 4, opts: { skipFixed?: boolean } = {}): Overlap[] {
  const sentSets = sources.map((src) => ({ label: src.label, sents: splitSentences(src.text).map((s) => ({ raw: s, n: norm(s) })) }));
  const fixed = new Set<string>();
  if (sentSets.length >= 2 && opts.skipFixed !== false) {
    const counts = new Map<string, number>();
    for (const ss of sentSets) for (const k of new Set(ss.sents.map((x) => x.n))) counts.set(k, (counts.get(k) ?? 0) + 1);
    // Fala fixa: aparece em todos, ou é curtinha (até 3 palavras) e aparece em 2+ ("E se inscreve.").
    for (const [k, c] of counts) if (c === sentSets.length || (c >= 2 && k.split(" ").length <= 3)) fixed.add(k);
  }
  const out: Overlap[] = [];
  const done = new Set<string>();
  for (const line of newLines)
    for (const s of splitSentences(line)) {
      const n = norm(s);
      const w = n.split(" ").filter(Boolean);
      if (w.length < 2 || fixed.has(n) || done.has(n)) continue;
      let hit: Overlap | null = null;
      for (const ss of sentSets) {
        const same = w.length >= 3 && ss.sents.find((x) => x.n === n);
        if (same) {
          hit = { sentence: s, source: ss.label, match: same.raw, kind: "frase igual" };
          break;
        }
        if (w.length >= ngram) {
          for (const x of ss.sents) {
            const xw = x.n.split(" ");
            if (xw.length < ngram || fixed.has(x.n)) continue;
            const grams = new Set<string>();
            for (let i = 0; i + ngram <= xw.length; i++) grams.add(xw.slice(i, i + ngram).join(" "));
            for (let i = 0; i + ngram <= w.length; i++) {
              const g = w.slice(i, i + ngram).join(" ");
              if (grams.has(g) && !w.slice(i, i + ngram).every((y) => STOP.has(y))) {
                hit = { sentence: s, source: ss.label, match: x.raw, kind: "trecho igual" };
                break;
              }
            }
            if (hit) break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        done.add(n);
        out.push(hit);
      }
    }
  return out;
}

/** Linha que é só separador: ---, ***, ===, ___ ou a linha de traços de uma tabela (|---|:--:|). */
const SEPARATOR = /^[\s|:=*_-]*[-=*_]{3,}[\s|:=*_-]*$/;
/** "chave: valor" de frontmatter (chave minúscula sem espaço; valor de uma palavra, lista [..] ou entre aspas). */
const FRONTMATTER_KV = /^[a-z][\w-]*:\s*(?:\S*|\[.*\]|".*"|'.*')$/;

/**
 * Separa o texto colado da devolução em pontos (uma linha = um ponto).
 * Tira marcadores de lista, citação (>) e negrito; ignora linhas vazias, títulos (#), linhas de tabela (|…|),
 * separadores e o frontmatter da nota (o bloco entre --- no começo e linhas "chave: valor").
 */
export function returnPoints(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first >= 0 && lines[first].trim() === "---") {
    const end = lines.findIndex((l, i) => i > first && l.trim() === "---");
    if (end > first) lines.splice(0, end + 1);
  }
  return lines
    .map((l) =>
      l
        .replace(/^\s*(?:>\s*)+/, "")
        .replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s*/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .trim(),
    )
    .filter((l) => l.length >= 3 && !/^#+\s/.test(l) && !/^\|.*\|$/.test(l) && !SEPARATOR.test(l) && !FRONTMATTER_KV.test(l));
}
