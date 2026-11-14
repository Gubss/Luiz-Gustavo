import type { DailyPoint, RetentionPoint } from "@/lib/google";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Curva de retenção do Analytics, com as maiores quedas marcadas. */
export function RetentionChart({
  curve,
  durationSec,
  drops = [],
  width = 640,
  height = 200,
}: {
  curve: RetentionPoint[];
  durationSec: number | null;
  drops?: { fromSec: number; toSec: number }[];
  width?: number;
  height?: number;
}) {
  if (curve.length < 2) return null;
  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxY = Math.max(1, ...curve.map((p) => p.watch));
  const x = (r: number) => pad.l + r * w;
  const y = (v: number) => pad.t + h - (v / maxY) * h;
  const d = curve.map((p, i) => `${i ? "L" : "M"}${x(p.r).toFixed(1)},${y(p.watch).toFixed(1)}`).join(" ");
  const ticksY = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= maxY);
  const ticksX = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl" role="img" aria-label="Curva de retenção">
      {ticksY.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="stroke-zinc-800" strokeWidth={1} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="fill-zinc-500 text-[10px]">
            {Math.round(t * 100)}%
          </text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          {durationSec ? mmss(t * durationSec) : `${Math.round(t * 100)}%`}
        </text>
      ))}
      {drops.map((dr, i) => {
        const a = durationSec ? dr.fromSec / durationSec : dr.fromSec / 100;
        const b = durationSec ? dr.toSec / durationSec : dr.toSec / 100;
        return (
          <g key={i}>
            <rect x={x(a)} y={pad.t} width={Math.max(2, x(b) - x(a))} height={h} className="fill-red-500/15" />
            <text x={x(a) + 2} y={pad.t + 10} className="fill-red-300 text-[10px]">
              {i + 1}
            </text>
          </g>
        );
      })}
      <path d={d} fill="none" strokeWidth={2} className="stroke-red-400" />
    </svg>
  );
}

/** Views por dia (Analytics) em barras. */
export function DailyBars({ points, width = 640, height = 120 }: { points: DailyPoint[]; width?: number; height?: number }) {
  const pts = points.slice(-30);
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts.map((p) => p.views));
  const bw = width / pts.length;
  return (
    <svg viewBox={`0 0 ${width} ${height + 14}`} className="w-full max-w-2xl" role="img" aria-label="Views por dia">
      {pts.map((p, i) => {
        const bh = (p.views / max) * height;
        return (
          <g key={p.day}>
            <rect x={i * bw + 1} y={height - bh} width={Math.max(1, bw - 2)} height={bh} className="fill-red-500/70">
              <title>{`${p.day}: ${p.views.toLocaleString("pt-BR")} views`}</title>
            </rect>
            {(i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 6) === 0) && (
              <text x={i * bw + bw / 2} y={height + 11} textAnchor="middle" className="fill-zinc-500 text-[9px]">
                {p.day.slice(8, 10)}/{p.day.slice(5, 7)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
