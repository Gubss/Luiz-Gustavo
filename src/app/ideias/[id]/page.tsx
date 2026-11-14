import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { findSimilarTitles } from "@/lib/catalog";
import { estimateScript, type IdeaData, type ScriptContent, type ScriptMetrics } from "@/lib/generator";
import type { PlaybookStats } from "@/lib/playbook";
import { StateForm } from "@/components/StateForm";
import { PublishedNote, RepeatWarning, StatusBadge } from "@/components/IdeaCard";
import { repeatsForIdeas } from "@/lib/my-catalog";
import { ConfirmDelete } from "@/app/nichos/[id]/forms";
import { deleteIdea, generateScriptAction, linkPublishedAction, saveIdeaNotes, setIdeaStatus, unlinkPublishedAction } from "@/app/gerador/actions";
import { publishedCandidates } from "@/lib/my-catalog";
import { IdeaStatusSelect } from "./forms";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`);
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
const estimateHint = (e: CostEstimate) => `${modelLabel(e.model)} · custo estimado ${usd(e.usd)} a ${usd(e.usdMax)} (≈ ${brl(e.usd)} a ${brl(e.usdMax)})`;
const num = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
}

const PART_STYLE: Record<string, string> = {
  gancho: "text-red-300",
  virada: "text-amber-300",
  desenvolvimento: "text-sky-300",
  clímax: "text-fuchsia-300",
  fecho: "text-emerald-300",
};

/** Roteiro × medidas da cartilha (tudo calculado em código). */
function MetricsVsPlaybook({ m, st }: { m: ScriptMetrics; st: PlaybookStats | null }) {
  const rows: { label: string; mine: string; target: string; warn?: boolean }[] = [];
  const near = (a: number | null, b: number | null, tol: number) => a == null || b == null || Math.abs(a - b) <= b * tol;
  rows.push({
    label: "Duração",
    mine: `${m.durationSec}s`,
    target: st?.durationSec.value != null ? `${num(st.durationSec.value)}s` : "—",
    warn: !near(m.durationSec, st?.durationSec.value ?? null, 0.35),
  });
  rows.push({
    label: "Palavras por segundo",
    mine: num(m.wordsPerSec),
    target: num(st?.wordsPerSec.value),
    warn: !near(m.wordsPerSec, st?.wordsPerSec.value ?? null, 0.3),
  });
  rows.push({
    label: "Duração média de cada cena",
    mine: m.avgSceneSec != null ? `${num(m.avgSceneSec)}s` : "—",
    target: st?.beatInterval.value != null ? `algo novo a cada ${num(st.beatInterval.value)}s` : "—",
    warn: m.avgSceneSec != null && st?.beatInterval.value != null && m.avgSceneSec > st.beatInterval.value * 1.5,
  });
  rows.push({
    label: "Cena mais longa",
    mine: m.maxSceneSec != null ? `${num(m.maxSceneSec)}s` : "—",
    target: st?.maxGap.value != null ? `maior buraco ${num(st.maxGap.value)}s` : "—",
    warn: m.maxSceneSec != null && st?.maxGap.value != null && m.maxSceneSec > st.maxGap.value * 1.3,
  });
  rows.push({ label: "Gancho termina em", mine: m.hookEndsAt != null ? `${num(m.hookEndsAt)}s` : "—", target: st?.format === "short" ? "até ~3s" : "até ~30s" });
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 font-normal">Medida</th>
            <th className="py-1 font-normal">Este roteiro</th>
            <th className="py-1 font-normal">Cartilha (mediana)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-zinc-800">
              <td className="py-1 text-zinc-400">{r.label}</td>
              <td className={`py-1 tabular-nums ${r.warn ? "text-amber-300" : "text-zinc-100"}`}>
                {r.mine} {r.warn && "⚠"}
              </td>
              <td className="py-1 tabular-nums text-zinc-400">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-500">
        {m.words} palavras em {m.scenes} cenas. Falas: {m.speakers.map((s) => `${s.name} ${s.lines} (${s.words} palavras)`).join(" · ") || "—"}. ⚠ = longe da
        cartilha; vale conferir (os tempos são uma previsão do roteiro, não da animação final).
      </p>
    </div>
  );
}

function ScriptView({ c }: { c: ScriptContent }) {
  const scenes = [...c.cenas].sort((a, b) => a.inicio - b.inicio);
  return (
    <div className="space-y-6 text-sm">
      <p className="text-base text-zinc-200">{c.resumo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="w-20 py-1 font-normal">Tempo</th>
              <th className="py-1 font-normal">Fala</th>
              <th className="py-1 font-normal">Na animação</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((s, i) => (
              <tr key={i} className="border-t border-zinc-800 align-top">
                <td className="py-2 pr-2 text-xs tabular-nums text-zinc-500">
                  {mmss(s.inicio)}–{mmss(s.fim)}
                  <div className={PART_STYLE[s.parte] ?? ""}>{s.parte}</div>
                </td>
                <td className="py-2 pr-4">
                  {s.fala.trim() ? (
                    <>
                      <span className="font-semibold text-zinc-100">{s.personagem || "—"}:</span> <span className="text-zinc-200">{s.fala}</span>
                    </>
                  ) : (
                    <span className="text-zinc-600">(sem fala)</span>
                  )}
                  {s.textoNaTela.trim() && <div className="mt-1 text-xs text-amber-300">na tela: {s.textoNaTela}</div>}
                </td>
                <td className="py-2 text-zinc-400">
                  {s.acao}
                  {s.novidade && <div className="mt-1 text-xs text-zinc-500">novo aqui: {s.novidade}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H3>Checklist da cartilha</H3>
          <ul className="space-y-1">
            {c.checklist.map((x, i) => (
              <li key={i} className={x.ok ? "text-zinc-200" : "text-amber-300"}>
                {x.ok ? "✓" : "✗"} {x.item}
                {x.comentario && <span className="text-xs text-zinc-500"> — {x.comentario}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div>
            <H3>Como a cartilha virou cena</H3>
            <p className="text-zinc-300">{c.adaptacao}</p>
          </div>
          {c.conferirFatos.length > 0 && (
            <div>
              <H3>Conferir antes de publicar</H3>
              <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
                {c.conferirFatos.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <H3>Capa</H3>
          <p className="text-zinc-300">{c.capa}</p>
        </div>
        <div>
          <H3>Descrição</H3>
          <p className="whitespace-pre-line text-zinc-300">{c.descricao}</p>
          <p className="mt-1 text-xs text-sky-300">{c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        </div>
        <div>
          <H3>Dicas de produção</H3>
          <ul className="list-disc space-y-1 pl-5 text-zinc-300">
            {c.dicasDeProducao.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      {c.titulosAlternativos.length > 0 && <p className="text-xs text-zinc-500">Títulos alternativos: {c.titulosAlternativos.join(" · ")}</p>}
    </div>
  );
}

export default async function IdeaPage({ params }: PageProps<"/ideias/[id]">) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({ where: { id }, include: { myChannel: true, niche: true, publishedVideo: true } });
  if (!idea) notFound();
  const d = parse<IdeaData>(idea.ideaData);
  const titles = parse<string[]>(idea.titles) ?? [];
  const sd = parse<ScriptContent & { metrics?: ScriptMetrics; playbookId?: string | null }>(idea.scriptData);
  const refIds = parse<string[]>(idea.referenceIds) ?? [];
  const pbId = sd?.playbookId ?? idea.playbookId;

  const [refs, playbook, similar, est, jobs] = await Promise.all([
    refIds.length ? prisma.video.findMany({ where: { id: { in: refIds } }, select: { id: true, title: true, channel: { select: { title: true } } } }) : [],
    pbId ? prisma.nichePlaybook.findUnique({ where: { id: pbId }, select: { stats: true, diagnosisCount: true, createdAt: true } }) : null,
    findSimilarTitles(`${idea.theme} ${idea.chosenTitle ?? ""}`, { nicheId: idea.nicheId ?? undefined, limit: 5 }),
    idea.myChannelId ? estimateScript(idea.id) : null,
    runningJobsFor([idea.id]),
  ]);
  const scriptJob = jobs.find((j) => j.kind === "script");
  const repeats = (await repeatsForIdeas([idea])).get(idea.id) ?? [];
  const cands = idea.publishedVideo ? null : await publishedCandidates(idea);
  const pbStats = parse<PlaybookStats>(playbook?.stats);
  const allTitles = [...new Set([...(idea.chosenTitle ? [idea.chosenTitle] : []), ...titles])];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={idea.myChannelId ? `/ideias?canal=${idea.myChannelId}` : "/ideias"} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Banco de ideias
          </Link>
          <h1 className="text-2xl font-bold">{idea.chosenTitle || titles[0] || idea.theme}</h1>
          <p className="text-sm text-zinc-400">
            {idea.theme} · {idea.myChannel ? <Link href={`/meus-canais/${idea.myChannel.id}`} className="hover:underline">{idea.myChannel.name}</Link> : "sem canal"} ·{" "}
            {idea.format === "long" ? "vídeo longo" : "Short"} · criada {fmtDateTime(idea.createdAt)}
            {idea.niche && ` · cartilha de ${idea.niche.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={idea.status} />
          <IdeaStatusSelect action={setIdeaStatus.bind(null, idea.id)} value={idea.status} />
        </div>
      </header>

      {/* A ideia */}
      <section className="card space-y-4 p-5 text-sm">
        <h2 className="text-lg font-semibold">A ideia</h2>
        {!idea.publishedVideo && <RepeatWarning repeats={repeats} />}
        {d ? (
          <>
            <p className="text-base text-zinc-200">{d.premissa}</p>
            <div className="text-xs text-zinc-500">Formato de história: {d.formatoDeHistoria}</div>
            <blockquote className="border-l-2 border-red-500 pl-2 italic text-zinc-300">
              {d.gancho} <span className="not-italic text-xs text-zinc-500">· gancho: {d.ganchoPadrao}</span>
            </blockquote>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded bg-zinc-950/60 p-3">
                <div className="text-xs text-zinc-500">Vem da cartilha / referência</div>
                <div className="text-zinc-200">{d.adaptacao.daCartilha}</div>
              </div>
              <div className="rounded bg-zinc-950/60 p-3">
                <div className="text-xs text-zinc-500">É do seu canal</div>
                <div className="text-zinc-200">{d.adaptacao.doCanal}</div>
              </div>
            </div>
            <p className="text-zinc-300">
              <span className="text-zinc-500">Por que pode funcionar: </span>
              {d.porQueVaiFuncionar}
            </p>
            {d.risco && <p className="text-amber-300/90">Risco: {d.risco}</p>}
            {d.ponto && <p className="text-xs text-zinc-500">Ponto de partida pedido: {d.ponto}</p>}
          </>
        ) : (
          <p className="text-zinc-300">{idea.justification ?? "—"}</p>
        )}
        {refs.length > 0 && (
          <p className="text-xs text-zinc-500">
            Referência:{" "}
            {refs.map((r) => (
              <Link key={r.id} href={`/video/${r.id}`} className="text-red-400 hover:underline">
                {r.title} ({r.channel.title})
              </Link>
            ))}
          </p>
        )}
        <div>
          <H3>Já foi feito? (títulos parecidos nos canais monitorados)</H3>
          {similar.length === 0 ? (
            <p className="text-xs text-zinc-500">Nada parecido no catálogo dos canais do nicho (checagem por palavras, grátis).</p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {similar.map((m) => (
                <li key={m.externalId}>
                  <a href={`https://www.youtube.com/watch?v=${m.externalId}`} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-red-400">
                    {m.title}
                  </a>{" "}
                  <span className="text-zinc-500">
                    · {m.channelTitle} · em comum: {m.shared.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Roteiro */}
      <section className="card space-y-4 p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Roteiro</h2>
          {idea.script && (
            <span className="text-xs text-zinc-500">
              {modelLabel(idea.scriptModel)} · custo acumulado {usd(idea.scriptCostUsd)}
            </span>
          )}
        </header>

        {sd ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <a href={`/api/ideias/${idea.id}/roteiro`} download className="btn-secondary">
                Baixar roteiro (.md) para o Maestri
              </a>
              <span className="text-xs text-zinc-500">Vai o roteiro cena a cena + personagens, estilo visual e tom do canal.</span>
            </div>
            {sd.metrics && (
              <div className="rounded-lg border border-zinc-800 p-4">
                <H3>Medidas do roteiro × cartilha</H3>
                <MetricsVsPlaybook m={sd.metrics} st={pbStats} />
              </div>
            )}
            <ScriptView c={sd} />
            {idea.script && (
              <details className="rounded-lg border border-zinc-800">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar</summary>
                <textarea readOnly rows={18} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={idea.script} />
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">Ainda sem roteiro.</p>
        )}

        {scriptJob ? (
          <RunningNote job={scriptJob} what="Roteiro" />
        ) : est ? (
          <div className={sd ? "border-t border-zinc-800 pt-4" : ""}>
            <StateForm
              action={generateScriptAction.bind(null, idea.id)}
              label={sd ? "Escrever de novo" : "Escrever roteiro"}
              busy="Começando…"
              hint={`${estimateHint(est)} · roda em segundo plano (até 3 min)`}
              className={sd ? "btn-secondary" : "btn-primary"}
            >
              <div>
                <label className="label">Título</label>
                <div className="space-y-1 text-sm">
                  {allTitles.map((t, i) => (
                    <label key={t} className="flex items-center gap-2">
                      <input type="radio" name="title" value={t} defaultChecked={i === 0} />
                      <span>{t}</span>
                    </label>
                  ))}
                  <input name="customTitle" className="input mt-1" placeholder="…ou escreva outro título (opcional)" />
                </div>
              </div>
              <div>
                <label className="label">Pedido extra (opcional)</label>
                <textarea name="extra" rows={2} className="input" placeholder="Ex.: mais curto, até 35s · coloca a irmã no final · fala do pai mais engraçada" />
              </div>
            </StateForm>
          </div>
        ) : (
          <p className="text-sm text-amber-300">Essa ideia não está ligada a um canal seu, então não dá para escrever o roteiro.</p>
        )}
      </section>

      {/* Virou vídeo? */}
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Virou vídeo no seu canal?</h2>
        {idea.publishedVideo ? (
          <div className="flex flex-wrap items-center gap-3">
            <PublishedNote v={idea.publishedVideo} />
            <form action={unlinkPublishedAction.bind(null, idea.id)}>
              <button className="btn-ghost px-2 py-1 text-xs">Desfazer</button>
            </form>
          </div>
        ) : !idea.myChannelId ? (
          <p className="text-sm text-zinc-500">Essa ideia não está ligada a um canal seu.</p>
        ) : (
          <StateForm action={linkPublishedAction.bind(null, idea.id)} label="Marcar como publicada" className="btn-secondary">
            <p className="text-sm text-zinc-400">
              Quando postar, ligue a ideia ao vídeo. Assim o banco mostra o que já foi usado, com as views, e o gerador não sugere esse tema de novo.
            </p>
            {cands && cands.recent.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Vídeo do canal</label>
                  <select name="videoId" className="input" defaultValue={cands.suggested[0]?.id ?? ""}>
                    <option value="">— escolha —</option>
                    {cands.suggested.length > 0 && (
                      <optgroup label="Parecidos com esta ideia">
                        {cands.suggested.map((v) => (
                          <option key={`s${v.id}`} value={v.id}>
                            {v.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Mais recentes">
                      {cands.recent.map((v) => (
                        <option key={v.id} value={v.id}>
                          {fmtDateTime(v.publishedAt).split(" ")[0]} · {v.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="label">…ou cole o link</label>
                  <input name="link" className="input" placeholder="https://youtube.com/shorts/…" />
                </div>
              </div>
            ) : (
              <div>
                <label className="label">Link do vídeo</label>
                <input name="link" className="input" placeholder="https://youtube.com/shorts/…" />
                <p className="mt-1 text-xs text-amber-300">
                  A lista de vídeos do canal ainda não foi lida.{" "}
                  <Link href={`/meus-canais/${idea.myChannelId}`} className="underline">
                    Leia no perfil do canal
                  </Link>{" "}
                  (o vídeo novo precisa estar lá).
                </p>
              </div>
            )}
          </StateForm>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Anotações</h2>
        <StateForm action={saveIdeaNotes.bind(null, idea.id)} label="Salvar" className="btn-secondary">
          <textarea name="notes" rows={3} className="input" defaultValue={idea.notes ?? ""} placeholder="O que mudar, quando gravar, link do vídeo publicado…" />
        </StateForm>
      </section>

      <div className="flex justify-end">
        <ConfirmDelete action={deleteIdea.bind(null, idea.id)} label="Apagar ideia" message="Apagar esta ideia e o roteiro dela?" />
      </div>
    </div>
  );
}
