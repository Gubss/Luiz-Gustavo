import Link from "next/link";
import { prisma } from "@/lib/db";
import { Collapsible } from "./ui";
import { comparison, mean, metricRows, type AnalyticsVideo } from "./analytics-metrics";

const number = (value: number, unit = "") => value.toLocaleString("pt-BR", { maximumFractionDigits: unit ? 1 : 0 }) + unit;

export async function AnalyticsOverview({ channelId, videoId }: { channelId: string; videoId?: string }) {
  const videos: AnalyticsVideo[] = await prisma.myVideo.findMany({ where: { myChannelId: channelId }, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, title: true, isShort: true, publishedAt: true, viewCount: true, analytics: true, retention: true, avgViewDuration: true, avgViewPercent: true, ctr: true, checkpoints: true } });
  const current = videoId ? videos.find(v => v.id === videoId) : videos.find(v => metricRows(v).find(row => row.label === "Parte do vídeo assistida")?.get(v) != null) ?? videos[0];
  if (!current) return <section className="card p-5 space-y-2"><h2 className="font-semibold">Resultados do canal</h2><p className="text-sm text-zinc-400">Ainda sem dado. Acompanhe seus vídeos em Meus vídeos para ver os resultados aqui.</p><Link href={"/meus-videos?canal=" + channelId} className="btn-secondary btn-sm">Abrir Meus vídeos</Link></section>;
  const peers = videos.filter(v => v.id !== current.id && v.isShort === current.isShort);
  const now = new Date();
  const age = (v: AnalyticsVideo) => v.publishedAt ? Math.max(0, (now.getTime() - v.publishedAt.getTime()) / 3600000) : null;
  const currentAge = age(current);
  const nearAge = peers.filter(v => { const hours = age(v); return hours != null && currentAge != null && Math.abs(hours-currentAge) <= Math.max(24,currentAge*0.25); });
  const rows = metricRows(current);
  const ranked = videos.filter(v => v.isShort === current.isShort).map(v => ({v, views: v.checkpoints.find(c => c.ageHours === 24)?.viewCount})).filter((v): v is {v: AnalyticsVideo; views: number} => v.views != null).sort((a,b) => b.views-a.views);
  return <section className="space-y-4" aria-label="Resultados em destaque">
    <div><h2 className="text-lg font-semibold">{videoId ? "O que os números dizem" : "Vídeo recente com dados disponíveis"}</h2>
      {!videoId && <Link href={"/meus-videos/" + current.id} className="text-sm text-red-300 hover:underline">{current.title ?? "Abrir vídeo"}</Link>}
      <p className="mt-1 max-w-3xl text-sm text-zinc-400">Veja onde este vídeo ficou acima ou abaixo dos outros {current.isShort ? "Shorts" : "vídeos longos"} do seu canal. Compare primeiro as 24 h; depois, veja em que momento o público saiu.</p>
    </div>
    {!videoId && current.id !== videos[0]?.id && <p className="text-xs text-zinc-400">O vídeo mais recente ainda não tem Analytics. <Link href={"/meus-videos/" + videos[0].id} className="link">Ver números disponíveis dele</Link></p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(row => {
      const value = row.get(current); const group = row.cumulative ? nearAge : peers;
      const valid = group.map(row.get).filter((v): v is number => v != null && Number.isFinite(v));
      const baseline = valid.length >= 2 ? mean(valid) : null;
      const verdict = comparison(value,baseline);
      const stayed = row.label === "Assistiram ao Short";
      const approximate = row.label.includes("horas") && current.checkpoints.some(c => c.ageHours === (row.label.includes("24") ? 24 : 48) && c.source === "analytics");
      return <div key={row.label} className="card p-4 space-y-1">
        <h3 className="text-sm text-zinc-300">{row.label}</h3>
        <p className="text-xl font-semibold tabular-nums">{value == null ? <span className="text-sm font-normal text-zinc-500">Ainda sem dado</span> : (approximate ? "≈ " : "") + number(value,row.unit)}</p>
        {stayed && value != null && <p className="text-xs text-zinc-400">{number(Math.max(0,100-value),"%")} deslizaram</p>}
        <p className="text-xs leading-relaxed text-zinc-400">{row.hint}</p>
        <p className={"text-xs font-medium " + verdict.color}>{verdict.label}</p>
        {baseline != null && <p className="text-xs text-zinc-500">Média: {number(baseline,row.unit)} · {valid.length} vídeos{row.cumulative ? " de idade próxima" : ""}</p>}
        {approximate && <p className="text-xs text-zinc-500">Estimativa pelos totais diários do Analytics.</p>}
      </div>;
    })}</div>
    {ranked.length >= 2 ? <div className="grid gap-3 sm:grid-cols-2">{[ranked[0],ranked.at(-1)!].map((item,i) => <Link key={i} href={"/meus-videos/"+item.v.id} className="card p-4">
      <span className={"text-xs " + (i===0 ? "text-emerald-300" : "text-amber-300")}>{i===0 ? "Melhor início" : "Pior início"} · primeiras 24 h</span><p className="mt-1 text-sm font-medium">{item.v.title}</p><span className="text-sm text-zinc-400">{number(item.views)} visualizações</span>
    </Link>)}</div> : <p className="text-xs text-zinc-500">Melhor e pior vídeo: ainda sem dados de 24 h em pelo menos dois vídeos do mesmo tipo.</p>}
    <Collapsible title="Como ler estas comparações"><p className="max-w-3xl text-xs leading-relaxed text-zinc-400">A média usa os outros vídeos do mesmo canal e tipo, sem contar este vídeo nem dados ausentes. São necessários dois vídeos com dado. “Na média” significa até 10% acima ou abaixo: é uma faixa de leitura, não uma meta do YouTube. Totais acumulados usam idades próximas (até 24 h de diferença ou 25% da idade atual). Retenção, tempo assistido e cliques usam o período disponível e podem mudar. Analytics pode atrasar 1–2 dias; número ausente não é zero. Mais alto costuma ser favorável, mas nenhum número sozinho explica o resultado.</p></Collapsible>
  </section>;
}
