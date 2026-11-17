import Link from "next/link";
import { NO_DIRECTION, STUDY_MAX } from "@/lib/direction-study";
import { importDirectionAction, requestDirectionAction } from "../actions";
import { FormatGaps } from "@/components/FormatGaps";
import { gapHint } from "@/lib/classify";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import {
  MAX_FORMAT_VIDEOS,
  MIN_FORMAT_VIDEOS,
  computeSpeech,
  estimateRecipe,
  formatStudies,
  isDraft,
  loadTranscripts,
  recipeChanges,
  studiesForFormat,
  type RecipeContent,
  type RecipeStats,
} from "@/lib/formats";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { ActionButton } from "@/app/video/[id]/forms";
import { ConfirmDelete } from "@/app/nichos/[id]/forms";
import { StateForm } from "@/components/StateForm";
import { Collapsible } from "@/components/ui";
import { WorkSection } from "@/components/workflow";
import { ClampText } from "@/components/ui-client";
import {
  addVideoToFormatAction,
  deleteFormatAction,
  generateRecipeAction,
  removeVideoFromFormatAction,
  saveChannelHowAction,
  updateFormatAction,
} from "../actions";

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

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-zinc-300">{children}</h3>;
}

function Refs({ ids, videoIds }: { ids: number[]; videoIds: string[] }) {
  if (!ids.length) return null;
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{ids.length === 1 ? "1 vídeo" : `${ids.length} vídeos`}</span>
      {ids.map((i) =>
        videoIds[i - 1] ? (
          <Link key={i} href={`/video/${videoIds[i - 1]}`} className="text-[10px] text-zinc-500 hover:text-red-400">
            #{i}
          </Link>
        ) : null,
      )}
    </span>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return <blockquote className="border-l-2 border-red-500/70 pl-2 text-zinc-400 italic">{children}</blockquote>;
}

function RecipeView({ c, videoIds }: { c: RecipeContent; videoIds: string[] }) {
  const R = (ids: number[]) => <Refs ids={ids} videoIds={videoIds} />;
  const box = "rounded-lg border border-line p-4";
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div className={box}>
          <H3>Como abre{R(c.abertura.estudos)}</H3>
          <p className="text-zinc-200">{c.abertura.comoAbre}</p>
          <p className="mt-1 text-xs text-zinc-500">Primeiro quadro: {c.abertura.primeiroQuadro}</p>
          <div className="mt-2 space-y-1">
            {c.abertura.exemplos.map((e, i) => (
              <Quote key={i}>{e}</Quote>
            ))}
          </div>
        </div>
        <div className={box}>
          <H3>Quem narra</H3>
          <p className="text-zinc-200">
            {c.narrador.quem} · <span className="text-violet-200">{c.narrador.pessoa}</span>
          </p>
          <p className="mt-1 text-zinc-400">{c.narrador.comoFala}</p>
          <div className="mt-2 space-y-1">
            {c.narrador.exemplos.map((e, i) => (
              <Quote key={i}>{e}</Quote>
            ))}
          </div>
        </div>
      </div>
      <div className={box}>
        <H3>O motor (na ordem)</H3>
        <ol className="space-y-1">
          {c.motor.map((m, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 shrink-0 text-zinc-500">{i + 1}.</span>
              <span>
                <span className="font-medium text-zinc-100">{m.passo}</span> <span className="text-xs text-zinc-500">({m.quando})</span>
                <span className="block text-zinc-300">{m.oQueAcontece}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={box}>
          <H3>O que se repete</H3>
          <ul className="space-y-1.5">
            {c.repeticoes.map((r, i) => (
              <li key={i}>
                <span className="text-zinc-100">{r.oQue}</span>
                {r.aCadaSegundos > 0 && <span className="text-amber-200"> · a cada ~{num(r.aCadaSegundos)}s</span>}
                {R(r.estudos)}
                {r.exemplos.length > 0 && <span className="block text-xs text-zinc-500">{r.exemplos.map((e) => `“${e}”`).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className={box}>
          <H3>Como a tensão cresce</H3>
          <p className="text-zinc-200">{c.tensao.comoCresce}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-300">
            {c.tensao.regras.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={box}>
          <H3>Como fecha</H3>
          <p className="text-zinc-200">{c.fecho.comoFecha}</p>
          <div className="mt-2 space-y-1">
            {c.fecho.exemplos.map((e, i) => (
              <Quote key={i}>{e}</Quote>
            ))}
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-300">
            {c.fecho.regras.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div className={box}>
          <H3>Por que viralizou</H3>
          <ul className="space-y-1.5">
            {c.porQueViralizou.map((p, i) => (
              <li key={i}>
                <span className="text-zinc-100">{p.hipotese}</span>
                {R(p.estudos)}
                <span className="block text-xs text-zinc-500">{p.evidencia}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Collapsible title={`Regras, o que evitar e checklist do formato (${c.checklist.length})`} className={box}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <H3>Regras</H3>
            <ul className="list-disc space-y-1 pl-5 text-zinc-200">
              {c.regras.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <H3>Evitar</H3>
            <ul className="space-y-1 text-zinc-200">
              {c.evitar.map((e, i) => (
                <li key={i}>
                  {e.erro}
                  {R(e.estudos)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <H3>Checklist</H3>
            <ul className="space-y-1 text-zinc-200">
              {c.checklist.map((x, i) => (
                <li key={i}>☐ {x}</li>
              ))}
            </ul>
          </div>
        </div>
        {c.lacunas.length > 0 && (
          <div className="mt-4">
            <H3>O que ainda falta saber</H3>
            <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
              {c.lacunas.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </Collapsible>
    </div>
  );
}

export default async function FormatPage({ params, searchParams }: PageProps<"/formatos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const f = await prisma.videoFormat.findUnique({ where: { id }, include: { niche: true, channels: true } });
  if (!f) notFound();
  const length = f.length as PlaybookFormat;

  const [studies, candidates, recipes, channels, s, jobs] = await Promise.all([
    formatStudies(f.id),
    studiesForFormat(f.nicheId, length),
    prisma.formatRecipe.findMany({ where: { formatId: f.id }, orderBy: { createdAt: "desc" }, select: { id: true, version: true, createdAt: true, costUsd: true, model: true } }),
    prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, nicheId: true } }),
    getSettings(),
    runningJobsFor([f.id]),
  ]);
  const transcripts = await loadTranscripts(studies.map((x) => x.id));
  const speech = computeSpeech(studies, transcripts);
  const draft = isDraft(studies.length);
  const chosen = recipes.find((r) => r.id === (Array.isArray(sp.v) ? sp.v[0] : sp.v)) ?? recipes[0];
  const recipe = chosen ? await prisma.formatRecipe.findUnique({ where: { id: chosen.id } }) : null;
  const content = parse<RecipeContent>(recipe?.content);
  const rStats = parse<RecipeStats>(recipe?.stats);
  const recipeVideoIds = parse<string[]>(recipe?.videoIds) ?? [];
  const isLatest = !!recipe && recipe.id === recipes[0]?.id;
  const changes = recipe && isLatest ? recipeChanges(studies.map((x) => x.id), recipe) : null;
  const hasChanges = !!changes && changes.added + changes.removed > 0;
  const est = studies.length ? await estimateRecipe(f.id) : null;
  const job = jobs.find((j) => j.kind === "recipe");
  const toAdd = candidates.filter((c) => !studies.some((x) => x.id === c.id));
  const full = studies.length >= MAX_FORMAT_VIDEOS;
  // Canais do mesmo nicho primeiro
  const myChannels = [...channels].sort((a, b) => Number(b.nicheId === f.nicheId) - Number(a.nicheId === f.nicheId));
  const howOf = new Map(f.channels.map((c) => [c.myChannelId, c.howText]));
  const missingHow = myChannels.some((c) => c.nicheId === f.nicheId && !howOf.get(c.id));
  // Uma ação principal por vez, na ordem do trabalho.
  const next =
    studies.length < MIN_FORMAT_VIDEOS
      ? { text: `Ponha mais ${MIN_FORMAT_VIDEOS - studies.length} ${MIN_FORMAT_VIDEOS - studies.length === 1 ? "vídeo estudado" : "vídeos estudados"} que contam do mesmo jeito. Com ${MIN_FORMAT_VIDEOS} a receita fica confiável.`, href: "#fmt-videos", cta: "Pôr vídeos" }
      : !content
        ? { text: "Os vídeos já bastam. Gere a receita: o passo a passo que o roteiro vai seguir.", href: "#fmt-receita", cta: "Ir para a receita" }
        : hasChanges
          ? { text: "Os vídeos mudaram desde a receita. Gere de novo para ela valer para os vídeos atuais.", href: "#fmt-receita", cta: "Ir para a receita" }
          : missingHow
            ? { text: "A receita está pronta. Falta escrever como o seu canal faz este formato (quem narra, o que nunca pode).", href: "#fmt-meu-jeito", cta: "Escrever o meu jeito" }
            : { text: "Receita pronta. Gere ideias neste formato.", href: `/gerador?niche=${f.nicheId}&format=${length}&formato=${f.id}`, cta: "Gerar ideias" };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-1">
        <Link href={`/formatos?niche=${f.nicheId}&format=${length}`} className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Formatos de {f.niche.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{f.name}</h1>
          <span className={`badge ${draft ? "bg-amber-600/30 text-amber-200" : "bg-emerald-600/30 text-emerald-200"}`}>{draft ? "rascunho" : "pronto"}</span>
        </div>
        <p className="text-sm text-zinc-400">
          {formatLabel(length, true)} · nicho {f.niche.name} · {studies.length} {studies.length === 1 ? "vídeo" : "vídeos"}
          {draft && ` · com ${MIN_FORMAT_VIDEOS} ou mais sai do rascunho`}
          {f.description && ` · ${f.description}`}
        </p>
      </header>

      <section className="card space-y-3 p-5">
        <h2 className="text-base font-semibold">O que isso quer dizer pra você</h2>
        {content ? (
          <ClampText lines={3} className="text-[15px] leading-relaxed text-zinc-200">
            {content.resumo}
          </ClampText>
        ) : (
          <p className="text-sm text-zinc-300">Formato é um jeito de contar que se repete no nicho. A receita, tirada dos vídeos abaixo, é o passo a passo que o roteiro segue.</p>
        )}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-500/5 p-4 ring-1 ring-emerald-500/20">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-300">O que fazer agora</h3>
            <p className="text-sm text-zinc-200">{next.text}</p>
          </div>
          <Link href={next.href} className="btn-primary btn-sm">
            {next.cta}
          </Link>
        </div>
      </section>

      {/* Vídeos */}
      <section className="card space-y-4 p-5" aria-labelledby="direction-title">
        <h2 id="direction-title" className="text-lg font-semibold">Estudo de direção</h2>
        {!f.directionStudy?.trim() ? <p role="status" className="text-amber-300">{NO_DIRECTION}</p> : <p className="text-emerald-300">Estudo importado: os próximos roteiros terão direção por cena.</p>}
        <StateForm action={importDirectionAction.bind(null, f.id)} label="Importar estudo pronto">
          <label className="label" htmlFor="direction-study">Cole o estudo de direção</label>
          <textarea id="direction-study" name="directionStudy" className="input" rows={7} maxLength={STUDY_MAX} defaultValue={f.directionStudy ?? ""} />
          <label className="label" htmlFor="direction-file">Ou envie o estudo em .md (substitui o texto colado)</label>
          <input id="direction-file" type="file" name="studyFile" accept=".md,text/markdown" className="input" />
        </StateForm>
        <details>
          <summary className="cursor-pointer text-sm">Pedir estudo de direção</summary>
          <StateForm action={requestDirectionAction.bind(null, f.id)} label="Pedir estudo de direção" hint="O GEPETO faz o estudo fora do Radar, sem API.">
            <label className="label" htmlFor="direction-links">Até 5 links de vídeo do formato, um por linha</label>
            <textarea id="direction-links" name="links" className="input" rows={5} required maxLength={10000} />
          </StateForm>
        </details>
      </section>

      <WorkSection id="fmt-videos" title={`1 · Vídeos do formato (${studies.length})`} open={studies.length < MIN_FORMAT_VIDEOS}>
        <p className="-mt-2 text-xs text-zinc-500">
          De {MIN_FORMAT_VIDEOS} a {MAX_FORMAT_VIDEOS} vídeos. Cada vídeo fica em um formato só por nicho.
        </p>
        {studies.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhum ainda. Escolha abaixo os vídeos estudados que seguem esta mesma estrutura.</p>
        ) : (
          <ol className="divide-y divide-line rounded-lg border border-line">
            {studies.map((st, i) => {
              const sv = speech.perVideo.find((v) => v.id === st.id);
              return (
                <li key={st.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 shrink-0 text-xs text-zinc-500">#{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={st.thumbnailUrl ?? `https://i.ytimg.com/vi/${st.externalId}/mqdefault.jpg`} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                  <Link href={`/video/${st.id}`} className="min-w-0 flex-1 hover:text-red-300">
                    <div className="truncate text-sm">{st.title}</div>
                    <div className="text-xs text-zinc-500">
                      {st.channelTitle} · {fmtCompact(st.viewCount)} views
                      {!st.hasTranscript && " · sem transcrição (a receita fica sem medidas de fala deste vídeo)"}
                      {sv && sv.repeats.length > 0 && ` · repete: ${sv.repeats.slice(0, 3).map((r) => `“${r.phrase}” ×${r.count}`).join(", ")}`}
                    </div>
                  </Link>
                  <form action={removeVideoFromFormatAction.bind(null, f.id, st.id)}>
                    <button className="btn-ghost px-2 py-1 text-xs text-zinc-500 hover:text-red-400">Tirar</button>
                  </form>
                </li>
              );
            })}
          </ol>
        )}
        {draft && <FormatGaps formatId={f.id} videos={studies.length} gaps={gapHint(f)} />}
        <Collapsible
          title={<span className="text-sm">Adicionar vídeos estudados</span>}
          meta={`${toAdd.length} ${toAdd.length === 1 ? "disponível" : "disponíveis"}`}
          open={studies.length < MIN_FORMAT_VIDEOS && toAdd.length > 0}
        >
          {full && <p className="mb-2 text-sm text-amber-300">O formato já tem {MAX_FORMAT_VIDEOS} vídeos. Tire um para pôr outro.</p>}
          {toAdd.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Nenhum outro {formatLabel(length)} estudado neste nicho. Estude mais vídeos no{" "}
              <Link href="/radar" className="text-red-400 hover:underline">
                radar
              </Link>{" "}
              ou por link em{" "}
              <Link href="/estudos" className="text-red-400 hover:underline">
                Estudos
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {toAdd.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.thumbnailUrl ?? `https://i.ytimg.com/vi/${c.externalId}/mqdefault.jpg`} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                  <Link href={`/video/${c.id}`} className="min-w-0 flex-1 hover:text-red-300">
                    <div className="truncate text-sm">{c.title}</div>
                    <div className="text-xs text-zinc-500">
                      {c.channelTitle} · {fmtCompact(c.viewCount)} views
                      {c.inFormat && <span className="text-amber-300"> · está em “{c.inFormat.name}”</span>}
                    </div>
                  </Link>
                  {!full && (
                    <form action={addVideoToFormatAction.bind(null, f.id, c.id)}>
                      <button className="btn-secondary px-2 py-1 text-xs">{c.inFormat ? "Mover para cá" : "Adicionar"}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      </WorkSection>

      {/* Receita */}
      <WorkSection id="fmt-receita" title="2 · Receita (o passo a passo do formato)" open={studies.length >= MIN_FORMAT_VIDEOS}>
        <header>
          {recipe && (
            <span className="text-xs text-zinc-500">
              v{recipe.version} · {modelLabel(recipe.model)} · {fmtDateTime(recipe.createdAt)} · {recipeVideoIds.length} {recipeVideoIds.length === 1 ? "vídeo" : "vídeos"} · custou{" "}
              {usd(recipe.costUsd)}
            </span>
          )}
        </header>
        {recipe && !isLatest && (
          <p className="text-sm text-zinc-400">
            Você está vendo uma versão antiga.{" "}
            <Link href={`/formatos/${f.id}`} className="text-red-400 hover:underline">
              Ver a mais recente
            </Link>
          </p>
        )}
        {hasChanges && changes && (
          <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            Mudou desde esta receita:
            {changes.added > 0 && ` ${changes.added} ${changes.added === 1 ? "vídeo novo" : "vídeos novos"}`}
            {changes.removed > 0 && `${changes.added ? "," : ""} ${changes.removed} ${changes.removed === 1 ? "saiu" : "saíram"}`}. Gere de novo para incluir.
          </p>
        )}
        {content ? (
          <>
            <RecipeView c={content} videoIds={recipeVideoIds} />
            {rStats && (
              <p className="text-xs text-zinc-500">
                Medido nos vídeos: duração {num(rStats.durationSec.value)}s · {num(rStats.wordsPerSec.value)} palavras/s · algo novo a cada {num(rStats.beatInterval.value)}s ·{" "}
                {num(rStats.speech?.sentence.wordsPerSentence)} palavras por frase
              </p>
            )}
            {recipe?.markdown && (
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar (Markdown)</summary>
                <textarea readOnly rows={16} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={recipe.markdown} />
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">{studies.length ? "Nenhuma receita gerada ainda." : "Escolha os vídeos primeiro."}</p>
        )}
        {job ? (
          <RunningNote job={job} what="Receita" />
        ) : est ? (
          <div className={content ? "border-t border-line pt-4" : ""}>
            {!s.anthropicApiKey && (
              <p className="mb-3 text-sm text-amber-300">
                Falta a chave da Anthropic: cole a chave em <Link href="/configuracoes#chaves" className="underline">Configurações</Link>.
              </p>
            )}
            {draft && (
              <p className="mb-3 text-sm text-amber-300">
                Com {studies.length} {studies.length === 1 ? "vídeo" : "vídeos"} a receita sai como rascunho. Dá para gerar agora e de novo depois de pôr mais vídeos.
              </p>
            )}
            <ActionButton
              action={generateRecipeAction.bind(null, f.id)}
              label={content ? (hasChanges ? "Gerar de novo com os vídeos atuais" : "Gerar de novo") : "Gerar receita"}
              busy="Começando…"
              hint={`${estimateHint(est)}. Roda em segundo plano; pode sair da página.`}
              className={content && !hasChanges ? "btn-secondary" : "btn-primary"}
            />
          </div>
        ) : null}
        {recipes.length > 1 && (
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Versões anteriores ({recipes.length - 1})</summary>
            <ul className="divide-y divide-line text-sm">
              {recipes.map((r, i) => (
                <li key={r.id}>
                  <Link href={i === 0 ? `/formatos/${f.id}` : `/formatos/${f.id}?v=${r.id}`} className={`flex justify-between px-3 py-2 hover:bg-raised ${r.id === recipe?.id ? "text-white" : "text-zinc-400"}`}>
                    <span>
                      v{r.version} · {fmtDateTime(r.createdAt)}
                      {i === 0 && " · mais recente"}
                    </span>
                    <span className="text-xs text-zinc-500">{usd(r.costUsd)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </WorkSection>

      {/* Medidas de fala */}
      {speech.perVideo.length > 0 && (
        <WorkSection id="fmt-fala" title="Frases que se repetem nos vídeos">
          <p className="-mt-2 text-xs text-zinc-500">
            Contado nas legendas, sem custo. {num(speech.sentence.wordsPerSentence)} palavras por frase em média; {speech.sentence.shortPct ?? "—"}% das frases têm 1 a 3
            palavras (frase curta prende mais em Short).
          </p>
          <ul className="space-y-2 text-sm">
            {speech.perVideo.map((v) => (
              <li key={v.id}>
                <span className="text-zinc-200">{v.title}</span>
                <ul className="mt-0.5 flex flex-wrap gap-1.5">
                  {v.repeats.length === 0 && <li className="text-xs text-zinc-500">nada se repete 3 ou mais vezes</li>}
                  {v.repeats.map((r) => (
                    <li key={r.phrase} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300" title={r.times.length ? `em ${r.times.join(", ")}s` : ""}>
                      “{r.phrase}” ×{r.count}
                      {r.gap ? <span className="text-zinc-500"> · a cada ~{num(r.gap)}s</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {speech.shared.length > 0 && (
            <p className="text-xs text-zinc-400">Aparece em 2 ou mais vídeos: {speech.shared.slice(0, 10).map((x) => `“${x.phrase}” (${x.videos})`).join(", ")}</p>
          )}
        </WorkSection>
      )}

      {/* Como o meu canal faz */}
      <WorkSection id="fmt-meu-jeito" title="3 · Como o meu canal faz este formato" open={missingHow}>
        <p className="-mt-2 text-sm text-zinc-400">
          Quem da família entra, quem narra, a ordem, bordões, fecho e o que nunca pode. Vale mais que a receita quando os dois discordam.
        </p>
        {myChannels.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum canal seu cadastrado.{" "}
            <Link href="/meus-canais" className="text-red-400 hover:underline">
              Cadastrar
            </Link>
          </p>
        ) : (
          myChannels.map((c) => (
            <Collapsible
              key={c.id}
              title={<span className="text-sm font-medium">{c.name}</span>}
              meta={howOf.get(c.id) ? `${howOf.get(c.id)!.split(/\s+/).length} palavras` : "vazio"}
              className="rounded-lg border border-line p-3"
              open={!howOf.get(c.id) && c.nicheId === f.nicheId}
            >
              <StateForm action={saveChannelHowAction.bind(null, f.id, c.id)} label="Salvar" className="btn-secondary">
                <textarea
                  name="howText"
                  rows={10}
                  className="input font-mono text-xs"
                  defaultValue={howOf.get(c.id) ?? ""}
                  placeholder={"Cole aqui o texto do formato no seu canal. Ex.:\nO motor (sempre nesta ordem): 1. Primeira frase: o desastre já aconteceu… \nO fecho: pergunta falada de duas opções…\nO que nunca pode: ensinar; furo de lógica…"}
                />
              </StateForm>
            </Collapsible>
          ))
        )}
      </WorkSection>

      {/* Editar */}
      <Collapsible title="Editar nome e descrição, ou apagar o formato" className="card p-4">
        <StateForm action={updateFormatAction.bind(null, f.id)} label="Salvar" className="btn-secondary">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nome</label>
              <input name="name" className="input" defaultValue={f.name} />
            </div>
            <div>
              <label className="label">Descrição curta</label>
              <input name="description" className="input" defaultValue={f.description ?? ""} />
            </div>
          </div>
        </StateForm>
        <div className="mt-4 border-t border-line pt-4">
          <ConfirmDelete
            action={deleteFormatAction.bind(null, f.id)}
            label="Apagar formato"
            message={`Apagar o formato "${f.name}" e as receitas dele? Os vídeos estudados continuam salvos; as ideias ficam sem formato.`}
          />
        </div>
      </Collapsible>
    </div>
  );
}
