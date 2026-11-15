import Link from "next/link";
import { prisma } from "@/lib/db";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { fmtInt } from "@/lib/format";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import { MAX_FORMAT_VIDEOS, isDraft } from "@/lib/formats";
import { NONE, classifyCandidates, estimateClassify, gapHint, nicheStudiesForClassify, sameName } from "@/lib/classify";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { ActionButton } from "@/app/video/[id]/forms";
import { StateForm } from "@/components/StateForm";
import { EmptyState, FilterChip, FilterRow, PageHeader, one, type SP } from "@/components/ui";
import { FormatGaps } from "@/components/FormatGaps";
import { applyChoicesAction, classifyNicheAction } from "../actions";

const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`);
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
const estimateHint = (e: CostEstimate) => `${modelLabel(e.model)} · custo estimado ${usd(e.usd)} a ${usd(e.usdMax)} (≈ ${brl(e.usd)} a ${brl(e.usdMax)})`;

const CONF_ORDER: Record<string, number> = { alta: 0, média: 1, baixa: 2 };
const confTone = (c: string) =>
  c === "alta" ? "bg-emerald-600/30 text-emerald-200" : c === "média" ? "bg-amber-600/30 text-amber-200" : "bg-zinc-700 text-zinc-300";

export default async function ClassifyPage({ searchParams }: PageProps<"/formatos/classificar">) {
  const sp: SP = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!niches.length)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Classificar estudos em formatos" />
        <EmptyState title="Crie um nicho primeiro" />
      </div>
    );
  const niche = niches.find((n) => n.id === one(sp.niche)) ?? niches.find((n) => /3d|anima/i.test(n.name)) ?? niches[0];

  const [rows, candidates, jobs, formats] = await Promise.all([
    nicheStudiesForClassify(niche.id),
    classifyCandidates(niche.id),
    runningJobsFor([`classify:${niche.id}`]),
    prisma.videoFormat.findMany({
      where: { nicheId: niche.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { videos: true } }, recipes: { orderBy: { createdAt: "desc" }, take: 1, select: { version: true, createdAt: true } } },
    }),
  ]);
  const missing = rows.filter((r) => !r.suggestion).map((r) => r.study.id);
  const [estNew, estAll] = await Promise.all([estimateClassify(niche.id, missing), estimateClassify(niche.id, rows.map((r) => r.study.id))]);
  const classifyJob = jobs.find((j) => j.kind === "classify");
  const recipesJob = jobs.find((j) => j.kind === "recipes-batch");

  // ordem: sugestão (na ordem dos formatos), confiança, views
  const labelOrder = (l: string | undefined) => {
    if (!l) return 99;
    if (l === NONE) return 50;
    const i = candidates.findIndex((c) => sameName(c.name, l));
    return i < 0 ? 40 : i;
  };
  const sorted = [...rows].sort(
    (a, b) =>
      labelOrder(a.suggestion?.label) - labelOrder(b.suggestion?.label) ||
      (CONF_ORDER[a.suggestion?.confidence ?? ""] ?? 3) - (CONF_ORDER[b.suggestion?.confidence ?? ""] ?? 3) ||
      b.study.viewCount - a.study.viewCount,
  );
  // escolha pré-marcada: o que eu já decidi; senão a sugestão; o formato atual se não tiver sugestão
  const preset = (r: (typeof rows)[number]) => r.suggestion?.chosen ?? r.suggestion?.label ?? r.format?.name ?? "";
  // quem fica de reserva se gravar assim (mais de 5 no mesmo formato e tamanho)
  const reserve = new Set<string>();
  const seen = new Map<string, number>();
  for (const r of sorted) {
    const l = preset(r);
    if (!l || l === NONE) continue;
    const key = `${l.toLowerCase()}|${r.study.isShort ? "s" : "l"}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > MAX_FORMAT_VIDEOS) reserve.add(r.study.id);
  }
  const pending = rows.filter((r) => r.suggestion?.status === "pending").length;
  const counts = new Map<string, number>();
  for (const r of rows) if (r.suggestion) counts.set(r.suggestion.label, (counts.get(r.suggestion.label) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Classificar estudos em formatos"
        subtitle="O Radar lê a transcrição e o diagnóstico de cada estudo e sugere o formato, com uma frase de motivo. Nada é gravado até você conferir a lista e apertar Gravar."
        actions={
          <Link href={`/formatos?niche=${niche.id}`} className="btn-ghost">
            ← Formatos do nicho
          </Link>
        }
      />

      <FilterRow label="Nicho">
        {niches.map((n) => (
          <FilterChip key={n.id} href={`/formatos/classificar?niche=${n.id}`} active={n.id === niche.id}>
            {n.name}
          </FilterChip>
        ))}
      </FilterRow>

      <section className="card space-y-3">
        <h2 className="font-semibold">Formatos possíveis</h2>
        <ul className="space-y-1 text-sm">
          {candidates.map((c) => (
            <li key={c.name}>
              <span className="font-medium text-zinc-100">{c.name}</span>
              {!c.exists && <span className="badge ml-2 bg-sky-700/40 text-sky-200">será criado ao gravar</span>}
              <span className="text-zinc-400"> — {c.description || "sem descrição"}</span>
            </li>
          ))}
          <li className="text-zinc-400">
            <span className="font-medium text-zinc-200">nenhum</span> — não segue nenhum dos dois motores (fica fora dos formatos).
          </li>
        </ul>
        <div className="flex flex-wrap items-start gap-4 border-t border-line pt-3">
          {classifyJob ? (
            <RunningNote job={classifyJob} what="Sugestão de formatos" />
          ) : (
            <>
              {missing.length > 0 ? (
                <ActionButton
                  action={classifyNicheAction.bind(null, niche.id, false)}
                  label={`Sugerir formato dos ${missing.length} estudos sem sugestão`}
                  busy="Começando…"
                  hint={estimateHint(estNew)}
                />
              ) : (
                rows.length > 0 && <p className="self-center text-sm text-zinc-400">Todos os estudos já têm sugestão.</p>
              )}
              {rows.length > 0 && missing.length < rows.length && (
                <ActionButton
                  action={classifyNicheAction.bind(null, niche.id, true)}
                  label={`Refazer todas (${rows.length})`}
                  busy="Começando…"
                  className="btn-ghost"
                  hint={estimateHint(estAll)}
                />
              )}
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Vídeo em outra língua se classifica igual, pela transcrição no idioma original. Estudo novo (Estudar tudo / Diagnóstico) já ganha a sugestão sozinho
          quando o nicho tem formatos.
        </p>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            Estudos do nicho ({rows.length}){pending ? ` · ${pending} esperando você` : ""}
          </h2>
          {counts.size > 0 && (
            <p className="text-xs text-zinc-400">
              Sugestões: {[...counts].map(([l, n]) => `${l} ${n}`).join(" · ")}
            </p>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhum estudo com diagnóstico neste nicho ainda.</p>
        ) : (
          <StateForm action={applyChoicesAction.bind(null, niche.id)} label="Gravar e gerar as receitas" busy="Gravando…" formClassName="space-y-3"
            hint={`Cria os formatos que faltam, põe cada vídeo no escolhido (até ${MAX_FORMAT_VIDEOS} por formato) e gera as receitas (Opus, cerca de US$ 0,30 por formato).`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Estudo</th>
                    <th className="py-2 pr-3">Sugestão do Radar</th>
                    <th className="py-2">Gravar como</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const s = r.suggestion;
                    return (
                      <tr key={r.study.id} className="border-t border-line align-top">
                        <td className="max-w-xs py-2 pr-3">
                          <Link href={`/video/${r.study.id}`} className="text-zinc-100 hover:underline">
                            {r.study.title}
                          </Link>
                          <div className="text-xs text-zinc-500">
                            {r.study.channelTitle} · {r.study.isShort ? "Short" : "longo"} · {fmtInt(r.study.viewCount)} views
                            {r.language ? ` · ${r.language}` : " · sem transcrição"}
                            {r.format && (
                              <>
                                {" · está em "}
                                <Link href={`/formatos/${r.format.id}`} className="text-violet-300 hover:underline">
                                  {r.format.name}
                                </Link>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="max-w-md py-2 pr-3">
                          {s ? (
                            <>
                              <span className="font-medium text-zinc-100">{s.label}</span>
                              <span className={`badge ml-2 ${confTone(s.confidence)}`}>{s.confidence}</span>
                              {s.status !== "pending" && (
                                <span className="badge ml-1 bg-zinc-800 text-zinc-300">{s.status === "confirmed" ? "confirmada" : `trocada por ${s.chosen}`}</span>
                              )}
                              <p className="mt-0.5 text-xs text-zinc-400">{s.reason}</p>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-500">ainda sem sugestão</span>
                          )}
                        </td>
                        <td className="py-2">
                          <select name={`pick:${r.study.id}`} defaultValue={preset(r)} className="input w-auto py-1 text-sm" aria-label={`Formato de ${r.study.title}`}>
                            <option value="">decidir depois</option>
                            {candidates.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                            <option value={NONE}>nenhum</option>
                          </select>
                          {reserve.has(r.study.id) && <p className="mt-0.5 text-xs text-amber-300">fica de reserva (passa de {MAX_FORMAT_VIDEOS})</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </StateForm>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Formatos do nicho depois de gravar</h2>
        {recipesJob && <RunningNote job={recipesJob} what="Receitas dos formatos" />}
        {formats.length === 0 ? (
          <p className="text-sm text-zinc-400">Ainda nenhum. Eles nascem quando você grava a lista acima.</p>
        ) : (
          <ul className="space-y-3">
            {formats.map((f) => {
              const n = f._count.videos;
              return (
                <li key={f.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link href={`/formatos/${f.id}`} className="font-medium text-zinc-100 hover:underline">
                      {f.name}
                    </Link>
                    <span className="text-xs text-zinc-500">{formatLabel(f.length as PlaybookFormat, true)}</span>
                    <span className={`badge ${isDraft(n) ? "bg-amber-600/30 text-amber-200" : "bg-emerald-600/30 text-emerald-200"}`}>
                      {n} {n === 1 ? "vídeo" : "vídeos"}
                      {isDraft(n) ? " · rascunho" : ""}
                    </span>
                    <span className="text-xs text-zinc-400">{f.recipes[0] ? `receita v${f.recipes[0].version}` : "sem receita"}</span>
                  </div>
                  {isDraft(n) && (
                    <div className="mt-2">
                      <FormatGaps formatId={f.id} videos={n} gaps={gapHint(f)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
