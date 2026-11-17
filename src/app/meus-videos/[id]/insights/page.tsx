import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { median } from "@/lib/metrics";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { TRAFFIC_LABEL, type RetentionPoint, type TrafficPoint } from "@/lib/google";
import { ageHours, checkpointLabel, checkpointTolerance, CHECKPOINTS, fmtAge } from "@/lib/my-videos";
import { summarizeRetention, type MyDiagnosisContent } from "@/lib/my-diagnosis";
import { checkpointLong, checkpointRanks, rankText, validAnalytics, videoInsights, type Level } from "@/lib/my-insights";
import { RetentionChart } from "@/components/MyVideoCharts";
import { AutoRefresh } from "@/components/AutoRefresh";
import { InsightsGuide } from "@/components/InsightsGuide";
import { parse, VerdictBadge } from "../../ui";

/** Marcos das primeiras horas mostrados nesta página (14 e 28 dias ficam na página do vídeo). */
const EARLY = CHECKPOINTS.filter((h) => h <= 168);

const LEVEL: Record<Level, { txt: string; cls: string; dot: string }> = {
  bom: { txt: "bom", cls: "text-emerald-300 border-emerald-800 bg-emerald-950/40", dot: "bg-emerald-400" },
  normal: { txt: "normal", cls: "text-zinc-200 border-zinc-700 bg-zinc-800/50", dot: "bg-zinc-400" },
  fraco: { txt: "fraco", cls: "text-red-300 border-red-900 bg-red-950/40", dot: "bg-red-400" },
  "sem base": { txt: "sem base", cls: "text-zinc-500 border-zinc-800 bg-transparent", dot: "bg-zinc-700" },
};

function LevelTag({ level }: { level: Level }) {
  const l = LEVEL[level];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${l.cls}`}>{l.txt}</span>;
}

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4 md:p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {sub && <p className="text-xs text-zinc-500">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** Views em cada marco (linha vermelha) e o normal do canal no mesmo marco (linha cinza tracejada). */
function EarlyChart({ points, W = 640, H = 170, className = "w-full" }: { points: { h: number; views: number | null; median: number | null }[]; W?: number; H?: number; className?: string }) {
  const pad = { l: 44, r: 10, t: 10, b: 24 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;
  const max = Math.max(1, ...points.flatMap((p) => [p.views ?? 0, p.median ?? 0]));
  const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v: number) => pad.t + h - (v / max) * h;
  const line = (key: "views" | "median") =>
    points
      .map((p, i) => (p[key] == null ? null : `${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`))
      .filter(Boolean)
      .map((s, i) => `${i ? "L" : "M"}${s}`)
      .join(" ");
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Views nas primeiras horas comparadas com o normal do canal">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-zinc-800" strokeWidth={1} />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="fill-zinc-500 text-[10px]">
            {t >= 1000 ? `${Math.round(t / 100) / 10}k` : t}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.h} x={x(i)} y={H - 6} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          {checkpointLabel(p.h)}
        </text>
      ))}
      <path d={line("median")} fill="none" strokeWidth={1.5} strokeDasharray="4 4" className="stroke-zinc-500" />
      {points.map((p, i) => (p.median != null ? <circle key={`m${p.h}`} cx={x(i)} cy={y(p.median)} r={3} className="fill-zinc-900 stroke-zinc-400" strokeWidth={1.5} /> : null))}
      <path d={line("views")} fill="none" strokeWidth={2.5} className="stroke-red-400" />
      {points.map((p, i) => (p.views != null ? <circle key={p.h} cx={x(i)} cy={y(p.views)} r={3.5} className="fill-red-400" /> : null))}
    </svg>
  );
}

export default async function MyVideoInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.myVideo.findUnique({
    where: { id },
    include: { myChannel: true, checkpoints: true, diagnoses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!v) notFound();
  const all = await prisma.myVideo.findMany({ where: { myChannelId: v.myChannelId }, include: { checkpoints: true } });
  const now = new Date();
  const age = ageHours(v.publishedAt, now) ?? 0;
  const insights = videoInsights(v, all);
  const ranks = checkpointRanks(v, all);
  const a = validAnalytics(v.analytics);
  const curve = parse<RetentionPoint[]>(v.retention) ?? [];
  const ret = summarizeRetention(curve, v.durationSec);
  const traffic = parse<TrafficPoint[]>(v.trafficSources) ?? [];
  const trafficTotal = traffic.reduce((s, t) => s + t.views, 0) || 1;
  const latest = v.diagnoses[0];
  const d = parse<MyDiagnosisContent>(latest?.content);
  const reached = EARLY.filter((h) => h <= age + checkpointTolerance(h));
  const medianAt = (h: number) => {
    const xs = all.filter((p) => p.id !== v.id && p.isShort === v.isShort).flatMap((p) => p.checkpoints.filter((c) => c.ageHours === h && c.viewCount != null).map((c) => c.viewCount!));
    return { med: median(xs), n: xs.length };
  };
  /** Normal de 1 ou 2 vídeos é um vídeo só, não "o normal": na linha do gráfico entra só com 3 ou mais. */
  const MIN_BASE = 3;
  const rows = reached.map((h) => ({ h, views: v.checkpoints.find((c) => c.ageHours === h)?.viewCount ?? null, ...medianAt(h), rank: ranks[h] }));
  const chart = EARLY.filter((h) => h <= Math.max(24, age)).map((h) => ({ h, views: v.checkpoints.find((c) => c.ageHours === h)?.viewCount ?? null, median: medianAt(h).n >= MIN_BASE ? medianAt(h).med : null }));
  const best = rows.filter((r) => r.rank && r.rank.of > 1).sort((x, y) => x.rank!.pos - y.rank!.pos || x.h - y.h)[0];
  const kind = v.isShort ? "Shorts" : "vídeos longos";
  const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AutoRefresh everySec={120} />
      <Link href={`/meus-videos/${v.id}`} className="text-sm text-zinc-400 hover:text-white">
        ← Voltar ao vídeo
      </Link>

      <header className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/hqdefault.jpg`}
          alt=""
          className={`shrink-0 rounded-lg bg-zinc-800 object-cover ${v.isShort ? "h-28 w-20" : "h-20 w-36"}`}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-red-400">Insights detalhados</p>
          <h1 className="text-lg font-bold leading-snug md:text-xl">{v.title}</h1>
          <p className="text-xs text-zinc-400">
            {fmtAge(age)} de vida · comparado com os outros {all.filter((p) => p.isShort === v.isShort).length - 1} {kind} do canal · números de{" "}
            {fmtDateTime(v.statsFetchedAt)}
          </p>
          {best?.rank && <p className="text-sm font-medium text-emerald-300">{rankText(best.h, best.rank)}</p>}
        </div>
      </header>

      <InsightsGuide />

      <Block title="Os números" sub={`Cada número comparado com o normal dos seus ${kind}. A linha de baixo diz o porquê.`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((i) => (
            <div key={i.key} className="rounded-lg border border-line bg-ink/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">{i.label}</span>
                <LevelTag level={i.level} />
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{i.value}</div>
              <p className="mt-1 text-xs leading-snug text-zinc-400">{i.why}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Primeiras horas" sub="Views em cada marco de idade. Linha vermelha = este vídeo; tracejada = normal do canal no mesmo marco (só onde há 3 ou mais vídeos para comparar).">
        {rows.length ? (
          <>
            <EarlyChart points={chart} W={340} H={190} className="w-full md:hidden" />
            <EarlyChart points={chart} className="hidden w-full md:block" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="pb-2 text-left font-normal">Marco</th>
                    <th className="pb-2 pr-3 text-right font-normal">Views</th>
                    <th className="pb-2 pr-3 text-right font-normal">Normal</th>
                    <th className="pb-2 text-left font-normal">No canal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ratio = r.views != null && r.med && r.n >= MIN_BASE ? r.views / r.med : null;
                    const cls = ratio == null ? "" : ratio >= 1.3 ? "text-emerald-300" : ratio < 0.7 ? "text-red-300" : "";
                    return (
                      <tr key={r.h} className="border-t border-line">
                        <td className="py-1.5 font-medium">{checkpointLong(r.h)}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${cls}`}>{fmtInt(r.views)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-400">{r.med != null ? fmtInt(r.med) : "—"}
                          {r.med != null && <span className="block text-[10px] text-zinc-500">{r.n} vídeo{r.n === 1 ? "" : "s"}</span>}</td>
                        <td className="py-1.5 text-xs text-zinc-300">
                          {r.rank ? rankText(r.h, r.rank) : <span className="text-zinc-600">{r.h < 24 ? "o app não estava medindo nessa hora" : "sem número"}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400">O vídeo ainda não fez 1 hora.</p>
        )}
      </Block>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Retenção" sub="Quanto do público ainda estava assistindo em cada ponto do vídeo (YouTube Analytics).">
          {ret ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-300">
                <span>aos 3s: {pct(ret.at3s)}</span>
                <span>na metade: {pct(ret.at50)}</span>
                <span>no fim: {pct(ret.end)}</span>
                {ret.rewatch && <span className="text-emerald-300">tem gente reassistindo</span>}
              </div>
              <RetentionChart curve={curve} durationSec={v.durationSec} drops={ret.drops} height={180} />
            </>
          ) : (
            <p className="text-sm text-zinc-400">Ainda sem curva. O Analytics atrasa 1 a 2 dias; o app busca sozinho a cada 6 horas.</p>
          )}
        </Block>
        <Block title="De onde vieram as views" sub="Origem do tráfego (YouTube Analytics).">
          {traffic.length ? (
            <ul className="space-y-1.5 text-sm">
              {traffic.slice(0, 8).map((t) => (
                <li key={t.source} className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-2">
                  <span className="truncate text-zinc-300">{TRAFFIC_LABEL[t.source] ?? t.source}</span>
                  <span className="h-2 rounded bg-zinc-800">
                    <span className="block h-2 rounded bg-red-500/70" style={{ width: `${Math.max(3, (t.views / trafficTotal) * 100)}%` }} />
                  </span>
                  <span className="text-right text-xs tabular-nums text-zinc-400">{Math.round((t.views / trafficTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">{a ? "O Analytics ainda não separou a origem." : "Ainda sem dados do Analytics (chegam com 1 a 2 dias)."}</p>
          )}
        </Block>
      </div>

      <Block
        title="Último diagnóstico"
        sub={latest ? `Feito com ${fmtAge(latest.ageHours)} de vida · ${latest.trigger === "auto" ? "automático" : "manual"} · ${fmtDateTime(latest.createdAt)}` : undefined}
      >
        {d ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-400">Veredito:</span>
              <VerdictBadge v={d.veredito} />
            </div>
            <p className="text-zinc-200">{d.resumo}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-900/60 p-3">
                <h3 className="mb-1 text-xs font-semibold text-emerald-400">O que funcionou</h3>
                <ul className="list-disc space-y-1 pl-4">
                  {d.oQueFuncionou.map((x, i) => (
                    <li key={i}>{x.ponto}</li>
                  ))}
                  {!d.oQueFuncionou.length && <li className="list-none text-zinc-500">—</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-red-900/60 p-3">
                <h3 className="mb-1 text-xs font-semibold text-red-400">O que não funcionou</h3>
                <ul className="list-disc space-y-1 pl-4">
                  {d.oQueNaoFuncionou.map((x, i) => (
                    <li key={i}>{x.ponto}</li>
                  ))}
                  {!d.oQueNaoFuncionou.length && <li className="list-none text-zinc-500">—</li>}
                </ul>
              </div>
            </div>
            <Link href={`/meus-videos/${v.id}#detail-1`} className="text-xs text-red-400 hover:underline">
              Diagnóstico completo na página do vídeo →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Ainda sem diagnóstico. O automático roda com 24 horas, 3 dias e 7 dias de vida{v.myChannel.autoDiagnose ? "" : " (está desligado neste canal: ligue em Meus vídeos)"}; ou use o
            botão na página do vídeo.
          </p>
        )}
      </Block>
    </div>
  );
}
