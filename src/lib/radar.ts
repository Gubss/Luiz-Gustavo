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

  for (const ch of channels) {
    const metrics = computeChannelMetrics(ch.videos, ch.subscriberCount, {
      avgN: s.avgN,
      multiplier: f.minMult,
      minViews: s.minViews,
      smallChannelMaxSubs: s.smallChannelMaxSubs,
      smallChannelMinRatio: s.smallChannelMinRatio,
    });
    for (const v of ch.videos) {
      if (v.isShort !== (f.format === "short")) continue;
      if (v.publishedAt.getTime() < windowStart) continue;
      totalInWindow++;
      const m = metrics.get(v.id)!;
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
  }

  const key: Record<RadarFilters["sort"], (i: RadarItem) => number> = {
    mult: (i) => i.metrics.multAvg ?? 0,
    subs: (i) => i.metrics.multSubs ?? 0,
    views: (i) => i.video.viewCount,
    vpd: (i) => i.metrics.viewsPerDay,
  };
  items.sort((a, b) => key[f.sort](b) - key[f.sort](a));
  return { items, totalInWindow, channelCount: channels.length, settings: s };
}
