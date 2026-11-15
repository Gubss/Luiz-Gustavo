import type { MyVideo, MyVideoCheckpoint } from "@prisma/client";
import type { VideoAnalytics, RetentionPoint } from "@/lib/google";

export type AnalyticsVideo = Pick<MyVideo, "id" | "title" | "isShort" | "publishedAt" | "viewCount" | "analytics" | "retention" | "avgViewDuration" | "avgViewPercent" | "ctr"> & { checkpoints: MyVideoCheckpoint[] };
export function readJson<T>(raw: string | null): T | null { try { return raw ? JSON.parse(raw) as T : null; } catch { return null; } }
export function mean(values: (number | null | undefined)[]) { const present = values.filter((v): v is number => v != null && Number.isFinite(v)); return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null; }
export function comparison(value: number | null, baseline: number | null) {
  if (value == null || baseline == null) return { label: "Ainda sem comparação", color: "text-zinc-500" };
  if (value > baseline * 1.1) return { label: "Acima da média", color: "text-emerald-300" };
  if (value < baseline * 0.9) return { label: "Abaixo da média", color: "text-amber-300" };
  return { label: "Na média", color: "text-sky-300" };
}
export function metricRows(video: AnalyticsVideo) {
  const latestStayed = [...video.checkpoints].filter(c => c.stayedPct != null).sort((a,b) => b.ageHours-a.ageHours)[0];
  const latestCtr = [...video.checkpoints].filter(c => c.ctr != null).sort((a,b) => b.ageHours-a.ageHours)[0];
  const analytics = (v: AnalyticsVideo) => readJson<VideoAnalytics>(v.analytics);
  const checkpoint = (v: AnalyticsVideo, hours: number) => v.checkpoints.find(c => c.ageHours === hours);
  const retention = (v: AnalyticsVideo) => {
    const curve = readJson<RetentionPoint[]>(v.retention);
    if (!Array.isArray(curve) || curve.length < 5) return null;
    const point = curve.filter(p => Number.isFinite(p.r) && Number.isFinite(p.watch)).sort((a,b) => Math.abs(a.r - 0.5) - Math.abs(b.r - 0.5))[0];
    return point ? point.watch * 100 : null;
  };
  return [
    { label: "Visualizações", hint: "Quantas vezes o vídeo foi visto. O total cresce com o tempo.", unit: "", cumulative: true, get: (v: AnalyticsVideo) => v.viewCount },
    { label: "Primeiras 24 horas", hint: "Visualizações no primeiro dia. Compare o início dos vídeos.", unit: "", get: (v: AnalyticsVideo) => checkpoint(v,24)?.viewCount ?? null },
    { label: "Primeiras 48 horas", hint: "Visualizações nos dois primeiros dias.", unit: "", get: (v: AnalyticsVideo) => checkpoint(v,48)?.viewCount ?? null },
    { label: "Tempo médio assistido", hint: "Quanto tempo, em média, cada pessoa assistiu.", unit: "s", get: (v: AnalyticsVideo) => analytics(v)?.avgViewDuration ?? v.avgViewDuration },
    { label: "Parte do vídeo assistida", hint: "Média assistida do vídeo. Acima de 100% indica repetição.", unit: "%", get: (v: AnalyticsVideo) => analytics(v)?.avgViewPct ?? v.avgViewPercent },
    { label: "Retenção na metade", hint: "Quanto do público ainda assistia na metade do vídeo. Mais alto indica maior permanência.", unit: "%", get: retention },
    ...(video.isShort ? [{ label: "Assistiram ao Short", hint: latestStayed ? "Continuaram assistindo, em vez de deslizar. Medição com " + latestStayed.ageHours + " h de vida." : "Quem ficou no Short em vez de passar para o próximo.", unit: "%", get: (v: AnalyticsVideo) => latestStayed ? checkpoint(v,latestStayed.ageHours)?.stayedPct ?? null : null }] : []),
    { label: "Inscritos ganhos", hint: "Pessoas que se inscreveram a partir deste vídeo.", unit: "", cumulative: true, get: (v: AnalyticsVideo) => analytics(v)?.subsGained ?? null },
    { label: "Cliques na capa (CTR)", hint: "De cada 100 exibições da capa, quantas viraram clique. Não mede deslizadas no feed de Shorts.", unit: "%", get: (v: AnalyticsVideo) => video.ctr == null && latestCtr ? checkpoint(v,latestCtr.ageHours)?.ctr ?? null : v.ctr },
  ];
}
