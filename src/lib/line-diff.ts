/**
 * Comparação linha a linha entre a história do Gubs e o roteiro gerado (v3, Gubs 17/11). Sem IA:
 * alinha as falas por semelhança de texto (palavras) e marca cada linha:
 * igual (verde) · alterada (amarelo, com a original) · nova (azul) · saiu (vermelho, riscada).
 */
export type DiffLine = { who?: string | null; text: string };
export type DiffKind = "igual" | "alterada" | "nova" | "saiu";
export type DiffRow = { kind: DiffKind; who?: string | null; text: string; original?: string; originalWho?: string | null; similarity?: number };

/** A partir daqui a linha conta como a mesma fala alterada; abaixo disso, é linha nova + linha que saiu. */
export const ALTERED_MIN = 0.45;
/** Pequenas diferenças (pontuação, maiúscula, acento) contam como igual. */
export const SAME_MIN = 0.97;

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
 * Alinhamento global (programação dinâmica): maximiza a soma das semelhanças dos pares casados, mantendo a ordem.
 * Par só casa com semelhança >= ALTERED_MIN; o que sobra do original "saiu" e o que sobra do roteiro é "nova".
 */
export function diffLines(original: DiffLine[], generated: DiffLine[]): DiffRow[] {
  const n = original.length, m = generated.length;
  const sim: number[][] = original.map((o) => generated.map((g) => lineSimilarity(o.text, g.text)));
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      let v = Math.max(best[i + 1][j], best[i][j + 1]);
      if (sim[i][j] >= ALTERED_MIN) v = Math.max(v, sim[i][j] + best[i + 1][j + 1]);
      best[i][j] = v;
    }
  const rows: DiffRow[] = [];
  let i = 0, j = 0;
  const eps = 1e-9;
  while (i < n || j < m) {
    if (i < n && j < m && sim[i][j] >= ALTERED_MIN && Math.abs(best[i][j] - (sim[i][j] + best[i + 1][j + 1])) < eps) {
      const s = sim[i][j];
      const o = original[i], g = generated[j];
      rows.push(s >= SAME_MIN
        ? { kind: "igual", who: g.who, text: g.text, similarity: s }
        : { kind: "alterada", who: g.who, text: g.text, original: o.text, originalWho: o.who, similarity: s });
      i++; j++;
    } else if (i < n && (j >= m || Math.abs(best[i][j] - best[i + 1][j]) < eps)) {
      rows.push({ kind: "saiu", who: original[i].who, text: original[i].text });
      i++;
    } else {
      rows.push({ kind: "nova", who: generated[j].who, text: generated[j].text });
      j++;
    }
  }
  return rows;
}

export function diffCounts(rows: DiffRow[]) {
  const c: Record<DiffKind, number> = { igual: 0, alterada: 0, nova: 0, saiu: 0 };
  for (const r of rows) c[r.kind]++;
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
