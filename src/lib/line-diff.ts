/**
 * Comparação linha a linha entre a história do Gubs e o roteiro gerado (v3, Gubs 17/11). Sem IA:
 * casa as falas por semelhança de texto (palavras) em todo o texto e marca cada linha:
 * igual (verde) · alterada (amarelo, com a original) · nova (azul) · saiu (vermelho, riscada);
 * igual/alterada em outra posição levam a etiqueta "mudou de lugar".
 */
export type DiffLine = { who?: string | null; text: string };
export type DiffKind = "igual" | "alterada" | "nova" | "saiu";
/** moved: a fala existe no original, mas em outra posição (verde/amarelo com etiqueta "mudou de lugar"). originalIndex: 0-based. */
export type DiffRow = { kind: DiffKind; who?: string | null; text: string; original?: string; originalWho?: string | null; similarity?: number; moved?: boolean; originalIndex?: number };

/** A partir daqui a linha conta como a mesma fala alterada; abaixo disso, é linha nova + linha que saiu. */
export const ALTERED_MIN = 0.45;
/** Igual = mesmo texto depois de tirar pontuação, maiúscula e acento (normLine). Qualquer palavra diferente é "alterada". */
export const SAME_MIN = 1;

export function normLine(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string) {
  return normLine(s).split(" ").filter(Boolean);
}

/** Dice entre multiconjuntos de palavras, com um pouco de peso para pares em ordem (bigramas). */
export function lineSimilarity(a: string, b: string) {
  const na = normLine(a), nb = normLine(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dice = (x: string[], y: string[]) => {
    if (!x.length || !y.length) return 0;
    const m = new Map<string, number>();
    for (const t of x) m.set(t, (m.get(t) ?? 0) + 1);
    let hit = 0;
    for (const t of y) {
      const c = m.get(t) ?? 0;
      if (c > 0) { hit++; m.set(t, c - 1); }
    }
    return (2 * hit) / (x.length + y.length);
  };
  const wa = words(a), wb = words(b);
  const bi = (w: string[]) => w.slice(1).map((t, i) => w[i] + " " + t);
  const s = 0.7 * dice(wa, wb) + 0.3 * (wa.length > 1 && wb.length > 1 ? dice(bi(wa), bi(wb)) : dice(wa, wb));
  return Math.min(s, 0.999);
}

/**
 * Alinhamento por correspondência (Gubs, revisão do PR #24): uma fala que existe no original e no roteiro nunca vira
 * saiu + nova só porque mudou de lugar.
 * 1. Casa as falas pela semelhança no texto todo (o par mais parecido primeiro; empate → posição mais próxima), 1 para 1.
 * 2. Dos pares, a maior sequência em ordem (soma das semelhanças) fica "no lugar"; os demais são "mudou de lugar".
 * 3. Só o que sobrou: do original "saiu", do roteiro "nova".
 * Linhas na ordem do roteiro; as que saíram aparecem perto de onde estavam no original.
 */
export function diffLines(original: DiffLine[], generated: DiffLine[]): DiffRow[] {
  const n = original.length, m = generated.length;
  const cands: { i: number; j: number; s: number; d: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const s = lineSimilarity(original[i].text, generated[j].text);
      if (s >= ALTERED_MIN) cands.push({ i, j, s, d: Math.abs(i / Math.max(n, 1) - j / Math.max(m, 1)) });
    }
  cands.sort((a, b) => b.s - a.s || a.d - b.d || a.j - b.j);
  const origOf = new Array<number>(m).fill(-1), simOf = new Array<number>(m).fill(0), usedOrig = new Array<boolean>(n).fill(false);
  for (const c of cands) {
    if (usedOrig[c.i] || origOf[c.j] >= 0) continue;
    usedOrig[c.i] = true; origOf[c.j] = c.i; simOf[c.j] = c.s;
  }
  // Maior sequência crescente (pelo índice do original, na ordem do roteiro), ponderada pela semelhança.
  const pairs = Array.from({ length: m }, (_, j) => j).filter((j) => origOf[j] >= 0);
  const score = pairs.map((j) => simOf[j]), prev = pairs.map(() => -1);
  for (let a = 0; a < pairs.length; a++)
    for (let b = 0; b < a; b++)
      if (origOf[pairs[b]] < origOf[pairs[a]] && score[b] + simOf[pairs[a]] > score[a]) { score[a] = score[b] + simOf[pairs[a]]; prev[a] = b; }
  const inPlace = new Set<number>();
  let k = score.length ? score.indexOf(Math.max(...score)) : -1;
  while (k >= 0) { inPlace.add(pairs[k]); k = prev[k]; }

  const rows: DiffRow[] = [];
  let nextOrig = 0;
  const flushRemoved = (upTo: number) => {
    for (; nextOrig < upTo; nextOrig++) if (!usedOrig[nextOrig]) rows.push({ kind: "saiu", who: original[nextOrig].who, text: original[nextOrig].text, originalIndex: nextOrig });
  };
  for (let j = 0; j < m; j++) {
    const g = generated[j], i = origOf[j];
    if (i < 0) { rows.push({ kind: "nova", who: g.who, text: g.text }); continue; }
    const moved = !inPlace.has(j);
    if (!moved) flushRemoved(i);
    const o = original[i], s = simOf[j];
    rows.push(s >= SAME_MIN
      ? { kind: "igual", who: g.who, text: g.text, similarity: s, moved, originalIndex: i }
      : { kind: "alterada", who: g.who, text: g.text, original: o.text, originalWho: o.who, similarity: s, moved, originalIndex: i });
  }
  flushRemoved(n);
  return rows;
}

export function diffCounts(rows: DiffRow[]) {
  const c: Record<DiffKind | "movida", number> = { igual: 0, alterada: 0, nova: 0, saiu: 0, movida: 0 };
  for (const r of rows) { c[r.kind]++; if (r.moved) c.movida++; }
  return c;
}

/** Linhas da história: as falas lidas do .md; sem falas marcadas, os parágrafos do texto. */
export function storyLines(story: { falas?: { who?: string | null; text: string }[]; text?: string } | null | undefined): DiffLine[] {
  if (!story) return [];
  if (story.falas?.length) return story.falas.map((f) => ({ who: f.who ?? null, text: f.text }));
  return (story.text ?? "")
    .split(/\n+/)
    .map((l) => l.replace(/^[>*\-#\s]+/, "").trim())
    .filter((l) => l.length > 2)
    .map((text) => ({ who: null, text }));
}
