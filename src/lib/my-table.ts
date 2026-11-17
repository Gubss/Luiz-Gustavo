/**
 * "Tabela completa" dos meus vídeos: uma linha por vídeo com todos os números que o Radar já guardou,
 * para comparar visualmente. Funções puras (sem banco, sem YouTube, sem IA): montar as linhas, ordenar
 * e achar o melhor e o pior de cada coluna.
 */
import { engagementRate, validAnalytics, type InsightVideo } from "./my-insights";
import { ageHours, peerStats } from "./my-videos";
import { TABLE_CHECKPOINTS, type TableRow } from "./my-table-columns";

export { COLUMNS, columnExtremes, sortRows, TABLE_CHECKPOINTS, type Column, type ColumnKind, type TableRow } from "./my-table-columns";

export type TableVideo = Omit<InsightVideo, "checkpoints"> & {
  externalId: string;
  thumbnailUrl: string | null;
  diagnoses: { content: string }[];
  checkpoints: (InsightVideo["checkpoints"][number] & { source?: string | null })[];
};

/** Ordem do veredito ao ordenar: do melhor para o pior. */
const VERDICT_ORDER: Record<string, number> = { "acima do normal": 3, "no normal": 2, "cedo demais": 1, "abaixo do normal": 0 };

function verdictOf(content: string | undefined) {
  if (!content) return null;
  try {
    return (JSON.parse(content) as { veredito?: string }).veredito ?? null;
  } catch {
    return null;
  }
}

/** Uma linha por vídeo. `all` = todos os vídeos do canal (para o "x o normal", mesma regra da lista). */
export function buildRows(videos: TableVideo[], all: TableVideo[] = videos, now = new Date()): TableRow[] {
  return videos.map((v) => {
    const a = validAnalytics(v.analytics);
    const cp = (h: number) => v.checkpoints.find((c) => c.ageHours === h && c.viewCount != null);
    const stayed = [...v.checkpoints].filter((c) => c.stayedPct != null).sort((x, y) => y.ageHours - x.ageHours)[0]?.stayedPct ?? null;
    const base = peerStats(all, v.isShort, v.id, now).baseMedian;
    const verdict = verdictOf(v.diagnoses[0]?.content);
    const values: Record<string, number | null> = {
      views: v.viewCount,
      likes: v.likeCount,
      comments: v.commentCount,
      shares: a?.shares ?? null,
      subs: a?.subsGained ?? null,
      engagement: engagementRate(v),
      duration: v.durationSec,
      avgDuration: v.avgViewDuration && v.avgViewDuration > 0 ? v.avgViewDuration : null,
      avgPct: v.avgViewPercent && v.avgViewPercent > 0 ? v.avgViewPercent / 100 : null,
      stayed: stayed != null ? stayed / 100 : null,
      minutes: a?.minutesWatched ?? null,
      verdict: verdict != null ? (VERDICT_ORDER[verdict] ?? null) : null,
      ratio: base && v.viewCount != null ? v.viewCount / base : null,
    };
    for (const h of TABLE_CHECKPOINTS) values[`h${h}`] = cp(h)?.viewCount ?? null;
    return {
      id: v.id,
      title: v.title ?? v.externalId,
      thumb: v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/mqdefault.jpg`,
      isShort: v.isShort,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      ageHours: ageHours(v.publishedAt, now),
      estimated: TABLE_CHECKPOINTS.filter((h) => cp(h)?.source === "analytics").map((h) => `h${h}`),
      verdict,
      values,
    };
  });
}
