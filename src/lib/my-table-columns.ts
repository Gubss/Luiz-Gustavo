/**
 * Colunas, ordenação e melhor/pior da "Tabela completa". Sem imports: roda também no navegador
 * (a tabela ordena sem voltar ao servidor). A montagem das linhas fica em my-table.ts.
 */
export const TABLE_CHECKPOINTS = [1, 3, 6, 12, 24, 48, 72, 168] as const;

/** Como o número aparece: inteiro, %, mm:ss ou "x" (vezes o normal). */
export type ColumnKind = "int" | "pct" | "time" | "ratio" | "verdict";

export type Column = {
  key: string;
  group: string;
  label: string;
  kind: ColumnKind;
  /** Pinta melhor (verde) e pior (vermelho claro). Falso onde maior não é melhor (ex.: duração do vídeo). */
  rank: boolean;
  title?: string;
};

export const COLUMNS: Column[] = [
  { key: "views", group: "Views", label: "Total", kind: "int", rank: true },
  ...TABLE_CHECKPOINTS.map((h): Column => ({
    key: `h${h}`,
    group: "Views",
    label: h < 24 ? `${h}h` : h === 24 ? "24h" : `${h / 24}d`,
    kind: "int",
    rank: true,
    title: `views com ${h < 24 ? `${h} hora${h === 1 ? "" : "s"}` : `${h / 24} dia${h === 24 ? "" : "s"}`} de vida`,
  })),
  { key: "likes", group: "Engajamento", label: "Likes", kind: "int", rank: true },
  { key: "comments", group: "Engajamento", label: "Coment.", kind: "int", rank: true, title: "comentários" },
  { key: "shares", group: "Engajamento", label: "Compart.", kind: "int", rank: true, title: "compartilhamentos (YouTube Analytics)" },
  { key: "subs", group: "Engajamento", label: "Inscritos", kind: "int", rank: true, title: "inscritos ganhos (YouTube Analytics)" },
  { key: "engagement", group: "Engajamento", label: "Taxa", kind: "pct", rank: true, title: "(likes + comentários + compartilhamentos) ÷ views" },
  { key: "duration", group: "Retenção", label: "Duração", kind: "time", rank: false, title: "duração do vídeo" },
  { key: "avgDuration", group: "Retenção", label: "Média vista", kind: "time", rank: true, title: "duração média assistida (YouTube Analytics)" },
  { key: "avgPct", group: "Retenção", label: "% visto", kind: "pct", rank: true, title: "% médio visto; acima de 100% = gente assistindo de novo (loop)" },
  { key: "stayed", group: "Retenção", label: "Continuaram", kind: "pct", rank: true, title: "“continuaram assistindo”, colado do YouTube Studio (último marco colado)" },
  { key: "minutes", group: "Tempo", label: "Minutos", kind: "int", rank: true, title: "minutos assistidos (YouTube Analytics)" },
  { key: "verdict", group: "Diagnóstico", label: "Veredito", kind: "verdict", rank: false, title: "último diagnóstico do vídeo" },
  { key: "ratio", group: "Diagnóstico", label: "x o normal", kind: "ratio", rank: true, title: "views de hoje ÷ normal do canal (mediana dos vídeos com 7 dias ou mais)" },
];

export type TableRow = {
  id: string;
  title: string;
  thumb: string;
  isShort: boolean;
  publishedAt: string | null;
  ageHours: number | null;
  /** Marcos estimados pelo Analytics (≈), em vez de medidos pelo app. */
  estimated: string[];
  verdict: string | null;
  values: Record<string, number | null>;
};

/** Ordena por uma coluna; "—" (sem dado) sempre no fim, nos dois sentidos. `published` ordena pela data. */
export function sortRows(rows: TableRow[], key: string, dir: "asc" | "desc"): TableRow[] {
  const val = (r: TableRow) => (key === "published" ? (r.publishedAt ? Date.parse(r.publishedAt) : null) : (r.values[key] ?? null));
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = val(x);
    const b = val(y);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * sign;
  });
}

/** Melhor e pior de cada coluna marcada com `rank` (só com 2+ vídeos com número e valores diferentes). */
export function columnExtremes(rows: TableRow[]): Record<string, { best: number; worst: number }> {
  const out: Record<string, { best: number; worst: number }> = {};
  for (const c of COLUMNS) {
    if (!c.rank) continue;
    const xs = rows.map((r) => r.values[c.key]).filter((x): x is number => x != null);
    if (xs.length < 2) continue;
    const best = Math.max(...xs);
    const worst = Math.min(...xs);
    if (best !== worst) out[c.key] = { best, worst };
  }
  return out;
}
