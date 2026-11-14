import { prisma } from "./db";
import { getSettings } from "./settings";
import { computeChannelMetrics, type VideoMetrics } from "./metrics";

export type RadarFilters = {
  nicheId?: string;
  format: "short" | "long";
  days: number; // 7 | 14 | 30
  minMult: number; // 3 | 5 | 10 | 20
  sort: "mult" | "subs" | "views" | "vpd";
  onlySmall?: boolean;
  onlyRising?: boolean;
  onlyFavorites?: boolean;
  includeAll?: boolean; // mostra também quem não é outlier
};

export type RadarItem = {
  video: {
    id: string;
    externalId: string;
    title: string;
    thumbnailUrl: string | null;
    publishedAt: Date;
    durationSec: number | null;
    isShort: boolean;
    viewCount: number;
    likeCount: number | null;
    commentCount: number | null;
  };
  channel: {
    id: string;
    externalId: string;
    title: string;
    handle: string | null;
    thumbnailUrl: string | null;
    subscriberCount: number | null;
  };
  metrics: VideoMetrics;
  favorite: boolean;
  history: { day: string; views: number }[];
};

/** Por que um vídeo da janela não virou outlier: resumo por canal para explicar a tela vazia. */
export type RadarChannelDiag = {
  channelId: string;
  title: string;
  inWindow: number; // vídeos do formato na janela
  noBase: number; // sem vídeos anteriores do mesmo formato para comparar
  belowMinViews: number; // abaixo do mínimo de views
  bestMult: number | null; // maior "x média" entre os da janela
  bestTitle: string | null;
};

/** Busca e calcula os itens do radar. Tudo em memória: ~100 canais x 100 vídeos. */
export async function getRadar(f: RadarFilters) {
  const s = await getSettings();
  const channels = await prisma.channel.findMany({
    where: f.nicheId ? { niches: { some: { nicheId: f.nicheId } } } : { niches: { some: {} } },
    include: {
      videos: {
        include: {
          favorite: { select: { id: true } },
          snapshots: { orderBy: { day: "asc" }, select: { day: true, viewCount: true } },
        },
      },
    },
  });

  const windowStart = Date.now() - f.days * 86_400_000;
  const items: RadarItem[] = [];
  let totalInWindow = 0;
  const diag: RadarChannelDiag[] = [];
  let collectedOfFormat = 0; // vídeos do formato coletados (qualquer data)

  for (const ch of channels) {
    const metrics = computeChannelMetrics(ch.videos, ch.subscriberCount, {
      avgN: s.avgN,
      multiplier: f.minMult,
      minViews: s.minViews,
      smallChannelMaxSubs: s.smallChannelMaxSubs,
      smallChannelMinRatio: s.smallChannelMinRatio,
    });
    const d: RadarChannelDiag = { channelId: ch.id, title: ch.title, inWindow: 0, noBase: 0, belowMinViews: 0, bestMult: null, bestTitle: null };
    for (const v of ch.videos) {
      if (v.isShort !== (f.format === "short")) continue;
      collectedOfFormat++;
      if (v.publishedAt.getTime() < windowStart) continue;
      totalInWindow++;
      const m = metrics.get(v.id)!;
      d.inWindow++;
      if (m.baseCount === 0) d.noBase++;
      if (v.viewCount < s.minViews) d.belowMinViews++;
      if (m.multAvg != null && (d.bestMult == null || m.multAvg > d.bestMult)) {
        d.bestMult = m.multAvg;
        d.bestTitle = v.title;
      }
      if (!f.includeAll && !m.isOutlier && !(f.onlySmall && m.smallChannelHit) && !(f.onlyRising && m.risingFast)) continue;
      if (f.onlySmall && !m.smallChannelHit) continue;
      if (f.onlyRising && !m.risingFast) continue;
      if (f.onlyFavorites && !v.favorite) continue;
      items.push({
        video: v,
        channel: ch,
        metrics: m,
        favorite: !!v.favorite,
        history: v.snapshots.map((sn) => ({ day: sn.day, views: sn.viewCount })),
      });
    }
    diag.push(d);
  }

  const key: Record<RadarFilters["sort"], (i: RadarItem) => number> = {
    mult: (i) => i.metrics.multAvg ?? 0,
    subs: (i) => i.metrics.multSubs ?? 0,
    views: (i) => i.video.viewCount,
    vpd: (i) => i.metrics.viewsPerDay,
  };
  items.sort((a, b) => key[f.sort](b) - key[f.sort](a));
  return {
    items,
    totalInWindow,
    collectedOfFormat,
    channelCount: channels.length,
    diagnostics: diag.sort((a, b) => b.inWindow - a.inWindow),
    settings: s,
  };
}
