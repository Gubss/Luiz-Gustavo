import { AnalyticsOverview } from "@/components/AnalyticsOverview";
import { WorkSection } from "@/components/workflow";
import Link from "next/link";
import { Collapsible } from "@/components/ui";
import { ClampText } from "@/components/ui-client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { TRAFFIC_LABEL, type DailyPoint, type RetentionPoint, type TrafficPoint, type VideoAnalytics } from "@/lib/google";
import { ageHours, channelPeers, checkpointLabel, checkpointTolerance, CHECKPOINTS, fmtAge } from "@/lib/my-videos";
import { estimateMyDiagnosis, lineAt, linkedIdea, scriptTimeline, summarizeRetention, type MyDiagnosisContent } from "@/lib/my-diagnosis";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { StateForm } from "@/components/StateForm";
import { DailyBars, RetentionChart } from "@/components/MyVideoCharts";
import { ActionButton, PasteTranscriptForm } from "@/app/video/[id]/forms";
import {
  diagnoseMyVideoAction,
  fetchMyTranscriptAction,
  pasteMyTranscriptAction,
  refreshVideoAction,
  saveCheckpointAction,
  saveScriptAction,
  saveStudioNotesAction,
} from "../actions";
import { estimateHint, parse, ratioClass, VerdictBadge } from "../ui";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function Tile({ label, value, hint, cls }: { label: string; value: string; hint?: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink/60 p-3">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${cls ?? ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{hint}</div>}
    </div>
  );
}

function H3({ children, cls = "text-zinc-400" }: { children: React.ReactNode; cls?: string }) {
  return <h3 className={`mb-2 text-xs font-semibold ${cls}`}>{children}</h3>;
}

function DiagnosisView({ d }: { d: MyDiagnosisContent }) {
  return (
    <div className="space-y-4 text-sm">
      <ClampText lines={4} className="text-[15px] leading-relaxed text-zinc-100">
        {d.resumo}
      </ClampText>
      <p className="text-xs text-zinc-500">
        Confiança {d.confianca}: {d.motivoConfianca}
      </p>
      <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3">
        <H3 cls="text-red-300">Lições para os próximos roteiros (vão para o Gerador)</H3>
        <ul className="list-disc space-y-1 pl-5">
          {d.licoes.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
      <Collapsible
        title="O que funcionou, o que não funcionou, gancho, retenção e cartilha"
        meta={`${d.oQueFuncionou.length} pontos bons · ${d.oQueNaoFuncionou.length} a melhorar`}
        className="rounded-lg border border-line p-4"
        bodyClassName="mt-3 space-y-4"
      >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H3 cls="text-emerald-400">O que funcionou</H3>
          <ul className="space-y-1">
            {d.oQueFuncionou.map((x, i) => (
              <li key={i}>
                <b>{x.ponto}</b> <span className="text-zinc-400">— {x.evidencia}</span>
              </li>
            ))}
            {!d.oQueFuncionou.length && <li className="text-zinc-500">—</li>}
          </ul>
        </div>
        <div>
          <H3 cls="text-red-400">O que não funcionou</H3>
          <ul className="space-y-1">
            {d.oQueNaoFuncionou.map((x, i) => (
              <li key={i}>
                <b>{x.ponto}</b>
                {x.segundo != null && <span className="text-zinc-500"> ({mmss(x.segundo)})</span>} <span className="text-zinc-400">— {x.evidencia}</span>
              </li>
            ))}
            {!d.oQueNaoFuncionou.length && <li className="text-zinc-500">—</li>}
          </ul>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line p-3">
          <H3>
            Gancho: <span className={d.gancho.nota === "forte" ? "text-emerald-300" : d.gancho.nota === "fraco" ? "text-red-300" : "text-zinc-200"}>{d.gancho.nota}</span>
          </H3>
          <p>{d.gancho.leitura}</p>
          <p className="mt-2 text-zinc-300">
            <span className="text-zinc-500">Melhor assim:</span> {d.gancho.comoMelhorar}
          </p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <H3>Título e capa</H3>
          <p>{d.tituloECapa.leitura}</p>
          {d.tituloECapa.sugestoes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-zinc-300">
              {d.tituloECapa.sugestoes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div>
        <H3>Retenção</H3>
        <p>{d.retencao.leitura}</p>
        {d.retencao.quedas.length > 0 && (
          <ul className="mt-2 space-y-2">
            {d.retencao.quedas.map((q, i) => (
              <li key={i} className="rounded border border-line p-2">
                <span className="font-mono text-red-300">{mmss(q.segundo)}</span> {q.oQueAcontecia}
                <div className="text-zinc-400">Por quê: {q.porqueProvavel}</div>
                <div className="text-zinc-300">Evitar: {q.comoEvitar}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {d.cartilha.length > 0 && (
        <div>
          <H3>Cartilha</H3>
          <ul className="space-y-1">
            {d.cartilha.map((x, i) => (
              <li key={i}>
                <span className={x.seguiu === "sim" ? "text-emerald-300" : x.seguiu === "não" ? "text-red-300" : "text-amber-300"}>
                  {x.seguiu === "sim" ? "✓" : x.seguiu === "não" ? "✗" : "~"} {x.item}
                </span>{" "}
                <span className="text-zinc-400">— {x.efeito}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <H3>Comparando com seus outros vídeos</H3>
        <p>{d.comparacao}</p>
      </div>
      </Collapsible>
      <p className="text-zinc-400">
        <span className="text-zinc-500">Observar depois:</span> {d.oQueObservarDepois}
      </p>
    </div>
  );
}

export default async function MyVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.myVideo.findUnique({
    where: { id },
    include: {
      myChannel: true,
      checkpoints: true,
      inspiredIdea: true,
      diagnoses: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!v) notFound();
  const now = new Date();
  const age = ageHours(v.publishedAt, now) ?? 0;
  const [peers, est, jobs, ideas, google] = await Promise.all([
    channelPeers(v.myChannelId, v.isShort, v.id),
    estimateMyDiagnosis(v.id),
    runningJobsFor([v.id]),
    prisma.idea.findMany({
      where: { myChannelId: v.myChannelId, status: { in: ["SCRIPT", "PRODUCED", "PUBLISHED"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, theme: true, chosenTitle: true, status: true },
    }),
    v.myChannel.externalId ? prisma.googleAuth.findUnique({ where: { channelExternalId: v.myChannel.externalId } }) : null,
  ]);
  const diagJob = jobs.find((j) => j.kind === "my-diagnosis");
  const refreshJob = jobs.find((j) => j.kind === "my-refresh");
  const analytics = parse<VideoAnalytics>(v.analytics);
  const curve = parse<RetentionPoint[]>(v.retention) ?? [];
  const ret = summarizeRetention(curve, v.durationSec);
  const traffic = parse<TrafficPoint[]>(v.trafficSources) ?? [];
  const daily = parse<DailyPoint[]>(v.dailyViews) ?? [];
  const idea = v.inspiredIdea ?? (await linkedIdea(v));
  const script = scriptTimeline(v, idea);
  const ratio = peers.baseMedian && v.viewCount != null ? v.viewCount / peers.baseMedian : null;
  const cps = CHECKPOINTS.filter((h) => h <= age + checkpointTolerance(h));
  const latest = v.diagnoses[0];
  const latestC = parse<MyDiagnosisContent>(latest?.content);
  const trafficTotal = traffic.reduce((a, b) => a + b.views, 0) || 1;
  const studioUrl = `https://studio.youtube.com/video/${v.externalId}/analytics/tab-overview/period-default`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={`/meus-videos?canal=${v.myChannelId}`} className="text-sm text-zinc-400 hover:text-white">
        ← Meus vídeos
      </Link>

      <header className="card flex flex-col gap-5 p-5 md:flex-row">
        <a href={v.url} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/hqdefault.jpg`}
            alt=""
            className={`rounded-lg bg-zinc-800 object-cover ${v.isShort ? "h-56 w-40" : "w-full md:w-80"}`}
          />
        </a>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold leading-snug">{v.title}</h1>
            {latestC && <VerdictBadge v={latestC.veredito} />}
          </div>
          <div className="text-sm text-zinc-400">
            {v.myChannel.name} · {v.isShort ? "Short" : "Vídeo longo"}
            {v.durationSec ? ` · ${mmss(v.durationSec)}` : ""} · publicado {fmtDateTime(v.publishedAt)} · <b className="text-zinc-200">{fmtAge(age)} de vida</b>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile
              label="Views (contador público)"
              value={fmtInt(v.viewCount)}
              hint={[
                v.statsFetchedAt ? `medido ${fmtDateTime(v.statsFetchedAt)}` : null,
                analytics?.views != null ? `Analytics: ${fmtInt(analytics.views)}${analytics.throughDay ? ` até ${analytics.throughDay.split("-").reverse().slice(0, 2).join("/")}` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined}
            />
            <Tile
              label="× normal do canal"
              value={ratio != null ? `${ratio.toFixed(1)}x` : "—"}
              cls={ratioClass(ratio)}
              hint={peers.baseMedian ? `normal: ${fmtInt(peers.baseMedian)} views (${peers.baseCount} vídeos com 7+ dias)` : "poucos vídeos para comparar"}
            />
            <Tile label="Likes" value={fmtInt(v.likeCount)} />
            <Tile label="Comentários" value={fmtInt(v.commentCount)} />
          </div>
          <div className="flex flex-wrap items-start gap-3 pt-1">
            {diagJob ? (
              <RunningNote job={diagJob} what={`Diagnóstico${diagJob.step ? ` · ${diagJob.step}` : ""}`} />
            ) : (
              <ActionButton
                action={diagnoseMyVideoAction.bind(null, v.id)}
                label={latest ? "Atualizar agora e diagnosticar de novo" : "Atualizar agora e diagnosticar"}
                busy="Começando…"
                hint={estimateHint(est)}
              />
            )}
            {refreshJob ? (
              <RunningNote job={refreshJob} what="Atualização" />
            ) : (
              !diagJob && <ActionButton action={refreshVideoAction.bind(null, v.id)} label="Só atualizar números" busy="Começando…" hint="grátis" className="btn-secondary" />
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <a href={v.url} target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
              Abrir no YouTube ↗
            </a>
            <a href={studioUrl} target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
              Abrir no YouTube Studio ↗
            </a>
          </div>
        </div>
      </header>

      <AnalyticsOverview channelId={v.myChannelId} videoId={v.id} />
      <p className="max-w-3xl text-sm text-zinc-300">{latestC?.resumo ?? "Ainda sem análise. Comece comparando as visualizações nas primeiras 24 h e a parte assistida do vídeo."}</p>
      {/* Diagnóstico */}
      <WorkSection id="detail-1" title="Análise e próximos passos">
        <h2 className="text-lg font-semibold">Diagnóstico</h2>
        {latest && latestC ? (
          <>
            <p className="text-xs text-zinc-500">
              Feito com {fmtAge(latest.ageHours)} de vida · {fmtDateTime(latest.createdAt)} · {latest.trigger === "auto" ? "automático" : "manual"}
              {latest.costUsd != null ? ` · US$ ${latest.costUsd.toFixed(3).replace(".", ",")}` : ""}
            </p>
            <DiagnosisView d={latestC} />
          </>
        ) : (
          <p className="text-sm text-zinc-400">
            Ainda sem diagnóstico. Com poucas horas ele já diz se o gancho segurou; com 24h, 3 dias e 7 dias a leitura fica mais firme (ligue o automático em Meus
            vídeos).
          </p>
        )}
        {v.diagnoses.length > 1 && (
          <div className="space-y-2 border-t border-line pt-3">
            <H3>Diagnósticos anteriores (veja como a leitura mudou)</H3>
            {v.diagnoses.slice(1).map((d) => {
              const c = parse<MyDiagnosisContent>(d.content);
              if (!c) return null;
              return (
                <details key={d.id} className="rounded-lg border border-line">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span>Com {fmtAge(d.ageHours)}</span>
                    <VerdictBadge v={c.veredito} />
                    <span className="line-clamp-1 text-zinc-400">{c.resumo}</span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <DiagnosisView d={c} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </WorkSection>

      {/* Marcos */}
      <WorkSection id="detail-2" title="Visualizações ao longo do tempo">
        <div>
          <h2 className="text-lg font-semibold">Ao longo do tempo</h2>
          <p className="text-sm text-zinc-400">
            Números medidos pelo app em cada idade, comparados com a mediana dos seus outros {v.isShort ? "Shorts" : "vídeos longos"} na mesma idade. Para vídeos que
            saíram antes do app acompanhar, os marcos de 24h em diante vêm das views por dia do Analytics. 1h, 3h, 6h e 12h só existem para vídeos acompanhados
            desde a publicação, porque o YouTube não guarda views por hora. Os números do Studio (continuaram assistindo, % visto, CTR) você cola abaixo.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 text-left font-normal">Marco</th>
                <th className="pb-2 pr-3 text-right font-normal">Medido com</th>
                <th className="pb-2 pr-3 text-right font-normal">Views</th>
                <th className="pb-2 pr-3 text-right font-normal">Normal do canal</th>
                <th className="pb-2 pr-3 text-right font-normal">Likes</th>
                <th className="pb-2 pr-3 text-right font-normal">Coment.</th>
                <th className="pb-2 pr-3 text-right font-normal">Continuaram assistindo</th>
                <th className="pb-2 pr-3 text-right font-normal">% visto</th>
                <th className="pb-2 pr-3 text-right font-normal">Duração média</th>
                <th className="pb-2 text-right font-normal">CTR</th>
              </tr>
            </thead>
            <tbody>
              {cps.map((h) => {
                const c = v.checkpoints.find((x) => x.ageHours === h);
                const med = peers.byCheckpoint[h]?.median;
                const r = c?.viewCount != null && med ? c.viewCount / med : null;
                return (
                  <tr key={h} className="border-t border-line">
                    <td className="py-1.5 font-medium">{checkpointLabel(h)}</td>
                    <td className="py-1.5 pr-3 text-right text-xs text-zinc-500">{c?.source === "analytics" ? "≈ views por dia do Analytics" : c?.measuredAgeMin != null ? fmtAge(c.measuredAgeMin / 60) : c ? "Studio" : "—"}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${ratioClass(r)}`}>
                      {fmtInt(c?.viewCount)}
                      {r != null && <span className="ml-1 text-xs">({r.toFixed(1)}x)</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-400">
                      {med != null ? fmtInt(med) : "—"}
                      {peers.byCheckpoint[h]?.n ? <span className="text-xs text-zinc-600"> ({peers.byCheckpoint[h].n})</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtInt(c?.likeCount)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtInt(c?.commentCount)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c?.stayedPct != null ? `${c.stayedPct}%` : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c?.avgViewPct != null ? `${c.avgViewPct}%` : "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c?.avgViewDuration != null ? mmss(c.avgViewDuration) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{c?.ctr != null ? `${c.ctr}%` : "—"}</td>
                  </tr>
                );
              })}
              {!cps.length && (
                <tr>
                  <td colSpan={10} className="py-2 text-zinc-500">
                    O vídeo ainda não fez 1h.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!v.checkpoints.some((c) => c.measuredAgeMin != null) && age > 2 && (
          <p className="text-xs text-zinc-500">
            Os marcos são medidos a partir de quando o app começou a acompanhar. Para vídeos antigos, cole os números do Studio (aba “Alcance”/“Engajamento”, filtro de
            período) se quiser comparar.
          </p>
        )}
        <details className="rounded-lg border border-dashed border-zinc-700">
          <summary className="cursor-pointer px-3 py-2 text-sm">Colar números do YouTube Studio num marco</summary>
          <div className="border-t border-line p-3">
            <StateForm action={saveCheckpointAction.bind(null, v.id)} label="Salvar números do Studio" className="btn-secondary">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="label">Marco</label>
                  <select name="ageHours" className="input" defaultValue={String(cps.at(-1) ?? 1)}>
                    {CHECKPOINTS.map((h) => (
                      <option key={h} value={h}>
                        {checkpointLabel(h)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Continuaram assistindo (%)</label>
                  <input name="stayedPct" className="input" placeholder="Shorts: ex. 72,5" />
                </div>
                <div>
                  <label className="label">% médio visto</label>
                  <input name="avgViewPct" className="input" placeholder="ex. 85" />
                </div>
                <div>
                  <label className="label">Duração média</label>
                  <input name="avgViewDuration" className="input" placeholder="ex. 0:23" />
                </div>
                <div>
                  <label className="label">CTR (%)</label>
                  <input name="ctr" className="input" placeholder="ex. 6,2" />
                </div>
                <div>
                  <label className="label">Impressões</label>
                  <input name="impressions" className="input" placeholder="ex. 12000" />
                </div>
                <div>
                  <label className="label">Views (se o app não mediu)</label>
                  <input name="views" className="input" placeholder="ex. 1500" />
                </div>
                <div>
                  <label className="label">Nota</label>
                  <input name="notes" className="input" placeholder="opcional" />
                </div>
              </div>
            </StateForm>
          </div>
        </details>
      </WorkSection>

      {/* Analytics */}
      <WorkSection id="detail-3" title="Retenção e origem do público">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">YouTube Analytics</h2>
          {v.analyticsFetchedAt && (
            <span className="text-xs text-zinc-500">
              atualizado {fmtDateTime(v.analyticsFetchedAt)}
              {analytics?.throughDay ? ` · dados até ${analytics.throughDay.split("-").reverse().join("/")}` : ""}
            </span>
          )}
        </div>
        {v.analyticsError && <p className="text-sm text-red-300">Último erro: {v.analyticsError}</p>}
        {!google || google.status !== "ok" ? (
          <p className="text-sm text-zinc-400">
            Sem login do Google neste canal.{" "}
            <a href={`/api/google/login?canal=${v.myChannelId}`} className="text-red-400 hover:underline">
              Entrar com Google
            </a>{" "}
            para ver retenção, % visto e de onde vieram as views. Enquanto isso, dá para colar os números do Studio nos marcos acima.
          </p>
        ) : !analytics || analytics.views == null ? (
          <p className="text-sm text-zinc-400">O YouTube ainda não liberou os números do Analytics deste vídeo. Eles chegam com 1 a 2 dias de atraso, então vídeo publicado ontem ou hoje ainda aparece vazio. O app busca de novo sozinho; ou clique em “Só atualizar números” amanhã.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <Tile
                label="% médio visto"
                value={analytics.avgViewPct != null ? `${analytics.avgViewPct.toFixed(1)}%` : "—"}
                cls={ratioClass(analytics.avgViewPct != null && peers.avgViewPctMedian ? analytics.avgViewPct / peers.avgViewPctMedian : null)}
                hint={peers.avgViewPctMedian != null ? `normal do canal: ${peers.avgViewPctMedian.toFixed(1)}%` : undefined}
              />
              <Tile label="Duração média" value={analytics.avgViewDuration != null ? mmss(analytics.avgViewDuration) : "—"} hint={v.durationSec ? `de ${mmss(v.durationSec)}` : undefined} />
              <Tile
                label="Views (Analytics)"
                value={fmtInt(analytics.views)}
                hint={analytics.throughDay ? `dados até ${analytics.throughDay.split("-").reverse().slice(0, 2).join("/")} (atrasa 1–2 dias)` : undefined}
              />
              <Tile label="Compartilhamentos" value={fmtInt(analytics.shares)} />
              <Tile label="Inscritos ganhos" value={fmtInt(analytics.subsGained)} hint={analytics.subsLost ? `perdidos: ${fmtInt(analytics.subsLost)}` : undefined} />
              <Tile label="Horas assistidas" value={analytics.minutesWatched != null ? fmtInt(analytics.minutesWatched / 60) : "—"} />
            </div>
            {ret && (
              <div className="space-y-2">
                <H3>Retenção</H3>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300">
                  <span>aos 3s: {pct(ret.at3s)}</span>
                  <span>na metade: {pct(ret.at50)}</span>
                  <span>no fim: {pct(ret.end)}</span>
                  {ret.relAvg != null && (
                    <span title="0,5 = igual a vídeos de tamanho parecido no YouTube">
                      retenção relativa: {ret.relAvg.toFixed(2).replace(".", ",")} {ret.relAvg >= 0.55 ? "(acima da média do YouTube)" : ret.relAvg <= 0.45 ? "(abaixo da média do YouTube)" : "(na média)"}
                    </span>
                  )}
                  {ret.rewatch && <span className="text-emerald-300">tem gente reassistindo (passa de 100%)</span>}
                </div>
                <RetentionChart curve={curve} durationSec={v.durationSec} drops={ret.drops} />
                {ret.drops.length > 0 && (
                  <ol className="space-y-1 text-sm">
                    {ret.drops.map((d, i) => {
                      const line = script?.lines.length ? lineAt(script.lines, d.fromSec) : null;
                      return (
                        <li key={i}>
                          <span className="text-red-300">
                            {i + 1}. {mmss(d.fromSec)}–{mmss(d.toSec)}
                          </span>{" "}
                          caiu {Math.round(d.drop * 100)} pontos
                          {line && <span className="text-zinc-400"> · nesse momento: “{line.text}”</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              {traffic.length > 0 && (
                <div>
                  <H3>De onde vieram as views</H3>
                  <ul className="space-y-1 text-sm">
                    {traffic.slice(0, 8).map((t) => (
                      <li key={t.source} className="flex items-center gap-2">
                        <span className="w-44 shrink-0 text-zinc-300">{TRAFFIC_LABEL[t.source] ?? t.source}</span>
                        <span className="h-2 rounded bg-red-500/70" style={{ width: `${Math.max(2, (t.views / trafficTotal) * 160)}px` }} />
                        <span className="text-xs tabular-nums text-zinc-400">{Math.round((t.views / trafficTotal) * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {daily.length > 1 && (
                <div>
                  <H3>Views por dia</H3>
                  <DailyBars points={daily} />
                </div>
              )}
            </div>
          </>
        )}
      </WorkSection>

      {/* Roteiro */}
      <WorkSection id="detail-4" title="Roteiro e anotações">
        <div>
          <h2 className="text-lg font-semibold">Roteiro</h2>
          <p className="text-sm text-zinc-400">
            Com o roteiro (ou a legenda), o diagnóstico mostra o que estava sendo dito em cada queda de retenção.{" "}
            {script ? <span className="text-emerald-300">Usando: {script.source}.</span> : <span className="text-amber-300">Ainda sem roteiro.</span>}
          </p>
        </div>
        <StateForm action={saveScriptAction.bind(null, v.id)} label="Salvar roteiro" className="btn-secondary">
          <div>
            <label className="label">Veio do Gerador? Escolha a ideia</label>
            <select name="ideaId" className="input" defaultValue={idea?.id ?? ""}>
              <option value="">— não veio do gerador —</option>
              {ideas.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.chosenTitle || i.theme}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ou cole o roteiro que você usou</label>
            <textarea name="scriptText" rows={6} className="input font-mono text-xs" defaultValue={v.scriptText ?? ""} placeholder="Cole o roteiro (falas e cenas)." />
          </div>
        </StateForm>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <H3>Legenda do vídeo (com tempos)</H3>
            <p className="text-xs text-zinc-500">
              {v.transcriptText ? `Salva (${v.transcriptSource === "manual" ? "colada" : "do YouTube"}).` : "Melhor fonte: tem os segundos exatos de cada fala."}
            </p>
            <ActionButton action={fetchMyTranscriptAction.bind(null, v.id)} label="Buscar legenda do YouTube" busy="Buscando…" className="btn-secondary" hint="grátis" />
            <details>
              <summary className="cursor-pointer text-xs text-zinc-400">Colar transcrição</summary>
              <div className="pt-2">
                <PasteTranscriptForm action={pasteMyTranscriptAction.bind(null, v.id)} defaultLang="pt" />
              </div>
            </details>
          </div>
          <div className="space-y-2">
            <H3>Anotações do Studio (texto livre)</H3>
            <StateForm action={saveStudioNotesAction.bind(null, v.id)} label="Salvar anotações" className="btn-secondary">
              <textarea
                name="studioNotes"
                rows={5}
                className="input text-xs"
                defaultValue={v.studioNotes ?? ""}
                placeholder="Cole o que achar útil do Studio: ex. 'Continuaram assistindo 68% vs 75% dos outros', 'queda forte no segundo 4', 'principal fonte: feed de Shorts'."
              />
            </StateForm>
          </div>
        </div>
      </WorkSection>
    </div>
  );
}
