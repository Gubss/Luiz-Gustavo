import { prisma } from "./db";

const STOP = new Set(
  (
    "a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem que e ou se é foi ser são " +
    "como mais muito muita isso esse essa este esta aquele aquela seu sua seus suas meu minha voce você eu ele ela " +
    "the a an of to in on for and or is are was with how why what this that your you my it at by from vs x " +
    "shorts short video vídeo"
  ).split(/\s+/),
);

/** Minúsculas, sem acento, sem pontuação/emoji, sem palavras vazias. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/#\w+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)); // plural simples
}

export type CatalogMatch = {
  title: string;
  externalId: string;
  publishedAt: Date;
  channelTitle: string;
  score: number; // 0..1
  shared: string[];
};

/**
 * Procura títulos parecidos com o tema nos catálogos dos canais (de um nicho ou de todos).
 * Palavras raras no catálogo (ex.: "elevador") pesam mais que palavras comuns (ex.: "curiosidade").
 * Entra na lista quem tem uma palavra rara em comum ou cobre metade do peso do tema.
 * É uma checagem rápida por palavras; o gerador (etapa 6) complementa com checagem por sentido.
 */
export async function findSimilarTitles(theme: string, opts: { nicheId?: string; limit?: number } = {}) {
  const q = [...new Set(tokenize(theme))];
  if (q.length === 0) return [];
  const entries = await prisma.catalogEntry.findMany({
    where: opts.nicheId ? { channel: { niches: { some: { nicheId: opts.nicheId } } } } : {},
    select: { title: true, externalId: true, publishedAt: true, channel: { select: { title: true } } },
  });
  const tokenized = entries.map((e) => ({ e, t: new Set(tokenize(e.title)) }));
  const N = tokenized.length;
  const df = new Map<string, number>();
  for (const w of q) df.set(w, tokenized.reduce((n, x) => n + (x.t.has(w) ? 1 : 0), 0));
  const idf = (w: string) => Math.log((N + 1) / ((df.get(w) ?? 0) + 1)) + 1;
  const total = q.reduce((s, w) => s + idf(w), 0);
  const isRare = (w: string) => (df.get(w) ?? 0) <= Math.max(2, N * 0.05);

  const out: CatalogMatch[] = [];
  for (const { e, t } of tokenized) {
    const shared = q.filter((w) => t.has(w));
    if (shared.length === 0) continue;
    const score = shared.reduce((s, w) => s + idf(w), 0) / total;
    if (score >= 0.5 || shared.some(isRare))
      out.push({ title: e.title, externalId: e.externalId, publishedAt: e.publishedAt, channelTitle: e.channel.title, score, shared });
  }
  return out.sort((a, b) => b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, opts.limit ?? 20);
}
