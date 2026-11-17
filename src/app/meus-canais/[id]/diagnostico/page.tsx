import Link from "next/link";
import { notFound } from "next/navigation";
import { Collapsible, PageHeader, one, type SP } from "@/components/ui";
import { StateForm } from "@/components/StateForm";
import { RunningNote } from "@/components/RunningNote";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ActionButton } from "@/app/video/[id]/forms";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { runningJobsFor } from "@/lib/jobs";
import { getSettings } from "@/lib/settings";
import { channelLeaders } from "@/lib/my-insights";
import type { RetentionPoint } from "@/lib/google";
import { channelReports, estimateChannelReport, reportText, summarizeRetention, type MyDiagnosisContent } from "@/lib/my-diagnosis";
import { estimateHint, parse, usd, VerdictBadge } from "@/app/meus-videos/ui";
import { saveEditedDiagnosisAction, updateDiagnosisAction } from "./actions";

const TRIGGER: Record<string, string> = { manual: "gerado (botão)", auto: "gerado (automático)", editado: "editado por você" };
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const int = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** Markdown simples do diagnóstico: "## título", "- item" e parágrafos. */
function DiagnosisText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={`l${blocks.length}`} className="list-disc space-y-1 pl-5 text-zinc-300">
          {list.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) {
      flush();
      continue;
    }
    if (/^#{1,4}\s/.test(l)) {
      flush();
      blocks.push(
        <h3 key={`h${blocks.length}`} className="pt-2 text-sm font-semibold text-zinc-100">
          {l.replace(/^#+\s*/, "")}
        </h3>,
      );
    } else if (/^[-*]\s/.test(l)) list.push(l.replace(/^[-*]\s*/, ""));
    else {
      flush();
      blocks.push(
        <p key={`p${blocks.length}`} className="leading-relaxed text-zinc-200">
          {l}
        </p>,
      );
    }
  }
  flush();
  return <div className="space-y-2 text-[15px]">{blocks}</div>;
}

export default async function ChannelDiagnosisPage({ params, searchParams }: PageProps<"/meus-canais/[id]/diagnostico">) {
  const { id } = await params;
  const sp: SP = await searchParams;
  const c = await prisma.myChannel.findUnique({ where: { id } });
  if (!c) notFound();
  const [reports, videos, jobs, s] = await Promise.all([
    channelReports(id),
    prisma.myVideo.findMany({
      where: { myChannelId: id },
      orderBy: { publishedAt: "desc" },
      include: { checkpoints: true, diagnoses: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    runningJobsFor([id]),
    getSettings(),
  ]);
  const est = videos.length ? await estimateChannelReport(id) : null;
  const job = jobs.find((j) => j.kind === "my-channel-report");
  const current = reports.find((r) => r.id === one(sp.d)) ?? reports[0] ?? null;
  const isLatest = current?.id === reports[0]?.id;
  const text = current ? reportText(current) : "";
  const editedFrom = current?.trigger === "editado" ? parse<{ geradoEm?: string }>(current.inputs)?.geradoEm : null;
  const leaders = channelLeaders(videos);
  const rows = videos.slice(0, 40).map((v) => {
    const ret = summarizeRetention(parse<RetentionPoint[]>(v.retention) ?? [], v.durationSec);
    const d = parse<MyDiagnosisContent>(v.diagnoses[0]?.content);
    const eng = v.viewCount && (v.likeCount != null || v.commentCount != null) ? (((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount) * 1000 : null;
    return { v, ret, d, eng };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {job && <AutoRefresh everySec={15} />}
      <Link href={`/meus-canais/${id}`} className="text-xs text-zinc-500 hover:text-zinc-300">
        ← {c.name}
      </Link>
      <PageHeader
        title="Diagnóstico do canal"
        subtitle="Views, retenção, onde a audiência sai, engajamento e o veredito de cada vídeo. Você pode editar o texto: a versão editada vale para o gerador e para o formato a partir do diagnóstico."
      />

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {current ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-1 text-lg font-semibold tabular-nums text-red-200">{day(current.createdAt)}</span>
                {current.trigger === "editado" ? (
                  <span className="rounded-full border border-sky-700 bg-sky-950/50 px-2 py-0.5 text-xs text-sky-200">editado por você</span>
                ) : (
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{TRIGGER[current.trigger] ?? current.trigger}</span>
                )}
                {isLatest ? <span className="text-xs text-emerald-300">diagnóstico atual</span> : <span className="text-xs text-amber-300">versão antiga</span>}
              </div>
              <p className="text-xs text-zinc-500">
                {fmtDateTime(current.createdAt)} · {current.videoCount} vídeos
                {editedFrom ? ` · editado a partir do gerado em ${fmtDateTime(editedFrom)}` : ""}
                {current.costUsd ? ` · custou ${usd(current.costUsd)}` : ""}
                {current._count.formats ? ` · ${current._count.formats} formato(s) nasceram dele` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Ainda não há diagnóstico deste canal.</p>
          )}
          <div className="min-w-0 basis-full space-y-2 sm:basis-80">
            {job ? (
              <RunningNote job={job} what="Diagnóstico do canal" />
            ) : est ? (
              <ActionButton
                action={updateDiagnosisAction.bind(null, id)}
                label={current ? "Atualizar diagnóstico" : "Fazer diagnóstico do canal"}
                busy="Começando…"
                hint={`Custo antes de começar: ${est.videos} vídeos · ${estimateHint(est)}${!s.anthropicApiKey ? " · falta a chave da Anthropic" : ""}`}
                className={current ? "btn-secondary" : "btn-primary"}
              />
            ) : (
              <p className="text-sm text-zinc-500">
                Ligue o canal e atualize em{" "}
                <Link href={`/meus-videos?canal=${id}`} className="underline">
                  Meus vídeos
                </Link>{" "}
                para ler os vídeos.
              </p>
            )}
          </div>
        </div>

        {current && (
          <>
            <div className="border-t border-line pt-4">
              <DiagnosisText text={text} />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Link href={`/formatos/novo?modo=diagnostico&canal=${id}&d=${current.id}`} className="btn-primary">
                Criar formato a partir deste diagnóstico
              </Link>
            </div>
            <Collapsible title="Editar o texto deste diagnóstico" meta="sem IA · US$ 0" className="rounded-lg border border-line p-4">
              <StateForm action={saveEditedDiagnosisAction.bind(null, id, current.id)} label="Salvar a minha versão" hint="Vira um diagnóstico novo no histórico, marcado “editado por você”. O original fica guardado.">
                <textarea name="texto" rows={18} className="input font-mono text-xs" defaultValue={text} aria-label="Texto do diagnóstico" />
              </StateForm>
            </Collapsible>
          </>
        )}
      </section>

      {leaders.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">Quem foi melhor</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {leaders.map((l) => (
              <Link key={l.key} href={`/meus-videos/${l.videoId}/insights`} className="rounded-lg border border-line bg-ink/60 p-3 hover:border-red-800">
                <div className="text-xs text-zinc-500">{l.label}</div>
                <div className="text-lg font-semibold tabular-nums text-emerald-300">{l.value}</div>
                <div className="line-clamp-2 text-xs text-zinc-300">{l.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="text-lg font-semibold">Vídeo a vídeo</h2>
            <p className="text-sm text-zinc-400">Números medidos agora (sem IA). Retenção: % que ainda assiste aos 3 s, na metade e no fim; maior queda = onde mais gente sai.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Vídeo</th>
                  <th className="py-1 pr-3 text-right font-normal">Views</th>
                  <th className="py-1 pr-3 text-right font-normal">% visto</th>
                  <th className="py-1 pr-3 text-right font-normal">3s / 50% / fim</th>
                  <th className="py-1 pr-3 font-normal">Onde saem</th>
                  <th className="py-1 pr-3 text-right font-normal">Engaj./mil</th>
                  <th className="py-1 font-normal">Veredito</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, ret, d, eng }) => (
                  <tr key={v.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3">
                      <Link href={`/meus-videos/${v.id}/insights`} className="line-clamp-2 hover:text-red-300">
                        {v.title}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{int(v.viewCount)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{v.avgViewPercent == null ? "—" : `${Math.round(v.avgViewPercent)}%`}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{ret ? `${pct(ret.at3s)} / ${pct(ret.at50)} / ${pct(ret.end)}` : "—"}</td>
                    <td className="py-1.5 pr-3 text-xs text-zinc-400">
                      {ret?.drops[0] ? `${pct(ret.drops[0].from)} → ${pct(ret.drops[0].to)} entre ${Math.round(ret.drops[0].fromSec)}s e ${Math.round(ret.drops[0].toSec)}s` : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{eng == null ? "—" : eng.toFixed(1).replace(".", ",")}</td>
                    <td className="py-1.5">{d ? <VerdictBadge v={d.veredito} /> : <span className="text-xs text-zinc-600">sem diagnóstico</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Histórico</h2>
        {reports.length ? (
          <ul className="divide-y divide-line text-sm">
            {reports.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${r.id === current?.id ? "text-zinc-100" : "text-zinc-400"}`}>
                <Link href={`/meus-canais/${id}/diagnostico?d=${r.id}`} className="font-medium tabular-nums hover:text-red-300">
                  {fmtDateTime(r.createdAt)}
                </Link>
                <span className={r.trigger === "editado" ? "text-sky-300" : ""}>{TRIGGER[r.trigger] ?? r.trigger}</span>
                <span className="text-xs text-zinc-500">
                  {r.videoCount} vídeos{r.costUsd ? ` · ${usd(r.costUsd)}` : ""}
                  {r._count.formats ? ` · ${r._count.formats} formato(s)` : ""}
                </span>
                {r.id === reports[0].id && <span className="text-xs text-emerald-300">atual</span>}
                {r.id === current?.id && <span className="text-xs text-zinc-500">(aberto)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum ainda.</p>
        )}
      </section>
    </div>
  );
}
