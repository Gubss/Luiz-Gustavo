/**
 * Regras de cálculo do radar (funções puras, sem banco).
 *
 * - Base do canal: últimos N vídeos do MESMO formato (Short/longo), com pelo menos
 *   48h de vida, sem contar o próprio vídeo avaliado.
 * - Multiplicador sobre a média: views / mediana da base (a média é exibida ao lado).
 * - Multiplicador sobre inscritos: views / inscritos (null se ocultos).
 * - Velocidade: views / dias desde a publicação (mínimo 1 dia).
 * - Subindo rápido: até 7 dias de vida e velocidade >= 3x a velocidade mediana da base.
 * - Canal pequeno estourou: inscritos <= limite e views >= razão x inscritos.
 */

export const DAY_MS = 86_400_000;
const MIN_BASE_AGE_MS = 2 * DAY_MS;

export type MetricVideo = {
  id: string;
  channelId: string;
  publishedAt: Date;
  viewCount: number;
  isShort: boolean;
};

export type MetricOptions = {
  now?: Date;
  avgN: number;
  multiplier: number; // limite para marcar outlier
  minViews: number;
  smallChannelMaxSubs: number;
  smallChannelMinRatio: number;
  risingMaxAgeDays?: number; // padrão 7
  risingMinRatio?: number; // padrão 3
};

export type VideoMetrics = {
  ageDays: number;
  viewsPerDay: number;
  baseCount: number;
  baseMedian: number | null;
  baseMean: number | null;
  baseMedianVpd: number | null;
  multAvg: number | null; // sobre a mediana da base
  multMean: number | null; // sobre a média da base (exibição)
  multSubs: number | null;
  velocityRatio: number | null;
  isOutlier: boolean;
  risingFast: boolean;
  smallChannelHit: boolean;
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const ageDays = (publishedAt: Date, now: Date) => Math.max(0, (now.getTime() - publishedAt.getTime()) / DAY_MS);

export const viewsPerDay = (views: number, publishedAt: Date, now: Date) =>
  views / Math.max(1, ageDays(publishedAt, now));

/**
 * Calcula as métricas de cada vídeo de UM canal.
 * `videos` deve conter todos os vídeos coletados do canal (para formar a base).
 */
export function computeChannelMetrics(
  videos: MetricVideo[],
  subscriberCount: number | null,
  opts: MetricOptions,
): Map<string, VideoMetrics> {
  const now = opts.now ?? new Date();
  const risingMaxAge = opts.risingMaxAgeDays ?? 7;
  const risingRatio = opts.risingMinRatio ?? 3;
  const out = new Map<string, VideoMetrics>();

  for (const isShort of [true, false]) {
    const ofFormat = videos.filter((v) => v.isShort === isShort);
    // Candidatos à base: maduros (>=48h), mais novos primeiro. Pega N+1 para poder excluir o próprio.
    const eligible = ofFormat
      .filter((v) => now.getTime() - v.publishedAt.getTime() >= MIN_BASE_AGE_MS)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, opts.avgN + 1);

    for (const v of ofFormat) {
      const base = eligible.filter((b) => b.id !== v.id).slice(0, opts.avgN);
      const views = base.map((b) => b.viewCount);
      const vpds = base.map((b) => viewsPerDay(b.viewCount, b.publishedAt, now));
      const baseMedian = median(views);
      const baseMean = mean(views);
      const baseMedianVpd = median(vpds);

      const age = ageDays(v.publishedAt, now);
      const vpd = viewsPerDay(v.viewCount, v.publishedAt, now);
      const multAvg = baseMedian && baseMedian > 0 ? v.viewCount / baseMedian : null;
      const multMean = baseMean && baseMean > 0 ? v.viewCount / baseMean : null;
      const multSubs = subscriberCount && subscriberCount > 0 ? v.viewCount / subscriberCount : null;
      const velocityRatio = baseMedianVpd && baseMedianVpd > 0 ? vpd / baseMedianVpd : null;

      const bigEnough = v.viewCount >= opts.minViews;
      const isOutlier =
        bigEnough && ((multAvg ?? 0) >= opts.multiplier || (multSubs ?? 0) >= opts.multiplier);
      const risingFast = age <= risingMaxAge && (velocityRatio ?? 0) >= risingRatio && bigEnough;
      const smallChannelHit =
        subscriberCount != null &&
        subscriberCount > 0 &&
        subscriberCount <= opts.smallChannelMaxSubs &&
        v.viewCount >= opts.smallChannelMinRatio * subscriberCount;

      out.set(v.id, {
        ageDays: age,
        viewsPerDay: vpd,
        baseCount: base.length,
        baseMedian,
        baseMean,
        baseMedianVpd,
        multAvg,
        multMean,
        multSubs,
        velocityRatio,
        isOutlier,
        risingFast,
        smallChannelHit,
      });
    }
  }
  return out;
}

/** Classificação Short/longo pela duração (antes da checagem por URL). */
export function classifyByDuration(durationSec: number | null, shortMaxSec: number): "short" | "long" | "check" {
  if (durationSec == null) return "long";
  if (durationSec <= 60) return "short";
  if (durationSec > shortMaxSec) return "long";
  return "check"; // entre 61s e o limite: conferir pela URL /shorts/
}
