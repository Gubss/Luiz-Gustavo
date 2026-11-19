import { sceneLine } from "@/lib/direction-study";
import { ideaExport } from "@/lib/script-export";
import Link from "next/link";
import { Collapsible } from "@/components/ui";
import { CopyScript, FlowSteps, OpenSection, ReturnInput, WorkSection } from "@/components/workflow";
import { ClampText, Menu } from "@/components/ui-client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { findSimilarTitles } from "@/lib/catalog";
import { estimateScript, scriptPending, type FormatMeta, type IdeaData, type ScriptContent, type ScriptMetrics, type ScriptReview, type VoiceCheck } from "@/lib/generator";
import type { PlaybookStats } from "@/lib/playbook";
import type { OwnStory } from "@/lib/own-story";
import { formatsOfNiche, isDraft } from "@/lib/formats";
import type { PlaybookFormat } from "@/lib/playbook";

/** Formatos do nicho para regenerar uma ideia sem formato: prontos primeiro, cada um com uma linha de descrição. */
async function formatChoicesFor(nicheId: string, length: PlaybookFormat) {
  const formats = await formatsOfNiche(nicheId, length);
  const recipes = await prisma.formatRecipe.findMany({
    where: { id: { in: formats.flatMap((f) => f.recipes.map((r) => r.id)) } },
    select: { id: true, content: true },
  });
  const resumo = new Map(recipes.map((r) => [r.id, parse<{ resumo?: string }>(r.content)?.resumo ?? ""]));
  const oneLine = (t: string) => {
    const first = t.split(/(?<=[.!?])\s/)[0] ?? t;
    return first.length > 180 ? first.slice(0, 178) + "…" : first;
  };
  const rows = formats.map((f) => ({
    ...f,
    ready: !isDraft(f._count.videos) && f.recipes.length > 0,
    line: oneLine(f.description || resumo.get(f.recipes[0]?.id ?? "") || ""),
  }));
  const ready = rows.filter((r) => r.ready);
  return ready.length ? ready : rows;
}
import { StateForm } from "@/components/StateForm";
import { FormatTag, PublishedNote, RepeatWarning, StatusBadge } from "@/components/IdeaCard";
import { repeatsForIdeas } from "@/lib/my-catalog";
import { DeleteIdeaButton } from "./forms";
import {
  deleteIdea,
  deleteLessonAction,
  generateScriptAction,
  linkPublishedAction,
  returnIdeaAction,
  saveIdeaNotes,
  regenerateWithFormatAction,
  setIdeaStatus,
  unlinkPublishedAction,
  originalOpeningAction,
} from "@/app/gerador/actions";
import { openingCheck } from "@/lib/own-story";
import { ActionButton } from "@/app/video/[id]/forms";
import { publishedCandidates } from "@/lib/my-catalog";
import { spokenLines } from "@/lib/script-lines";
import { LineDiff } from "@/components/LineDiff";
import { storyLines } from "@/lib/line-diff";
import { VersionReview } from "./version-review";
import { IdeaStatusSelect, ScriptTabs } from "./forms";
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



/** Roteiro × medidas da receita do formato (tudo calculado em código). */
function MetricsVsPlaybook({ m, st, label }: { m: ScriptMetrics; st: PlaybookStats | null; label: string }) {
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
            <th className="py-1 font-normal">{label} (mediana)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
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
        referência; vale conferir (os tempos são uma previsão do roteiro, não da animação final).
      </p>
    </div>
  );
}

/** Segunda passada: leitura de espectador (modelo barato) + conferência de lógica e graça em código. */
function ReviewPanel({ r }: { r: ScriptReview }) {
  const left = r.final.problems;
  const good = !r.error && !left.length;
  return (
    <div className={`rounded-lg border p-3 text-sm ${good ? "border-line" : "border-amber-700 bg-amber-950/30"}`}>
      <div className={good ? "text-emerald-300" : "font-medium text-amber-200"}>
        {r.error
          ? "⚠ A leitura de espectador falhou: confira o roteiro com atenção."
          : r.rewritten
            ? `Reescrito uma vez depois da leitura (${r.points.length} ${r.points.length === 1 ? "ponto" : "pontos"})${left.length ? ` · ainda ${left.length} para olhar` : " · agora passa"}`
            : `✓ Passou de primeira: ${r.laughs} risadas com reação da família`}
      </div>
      {r.critique && <p className="mt-1 text-xs text-zinc-400">{r.critique.veredito}</p>}
      {r.critique && r.critique.risadas.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-zinc-400">Onde o espectador riu (1ª versão):</div>
          <ul className="mt-0.5 space-y-0.5 text-xs text-zinc-300">
            {r.critique.risadas.map((x, i) => (
              <li key={i}>
                Cena {x.cena}: esperava {x.esperado}, mas {x.aconteceu}
                {x.reacao.trim() ? <span className="text-zinc-500"> · {x.reacao}</span> : <span className="text-amber-300"> · ninguém reage</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.points.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-amber-200">{r.rewritten ? "O que mandou reescrever:" : "Pontos:"}</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
            {r.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {r.rewritten && left.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-amber-200">Ainda no roteiro final (conferência em código):</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
            {left.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Conferência da voz feita em código depois de gerar: frases longas, frases/bordões repetidos e falas copiadas. */
function VoicePanel({ v }: { v: VoiceCheck }) {
  const issues = v.long.length + v.repeats.length + v.copied.length;
  return (
    <div className={`rounded-lg border p-3 text-sm ${issues ? "border-amber-700 bg-amber-950/30" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={issues ? "font-medium text-amber-200" : "text-emerald-300"}>
          {issues ? `⚠ Voz: ${issues} ${issues === 1 ? "ponto para olhar" : "pontos para olhar"}` : "✓ Voz: frases curtas e nada repetido"}
        </span>
        <span className="text-xs text-zinc-500">
          {num(v.sentence.wordsPerSentence)} palavras por frase
          {v.target != null && ` · alvo ${num(v.target)} (${v.targetFrom})`}
        </span>
      </div>
      {v.repeats.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-amber-200">Frase ou bordão que já saiu em roteiro publicado:</div>
          <ul className="mt-0.5 space-y-0.5 text-xs text-zinc-300">
            {v.repeats.map((o, i) => (
              <li key={i}>
                “{o.sentence}” <span className="text-zinc-500">· {o.kind} em {o.source}: “{o.match}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.copied.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-amber-200">Fala copiada de um vídeo estudado (as amostras servem só para o ritmo):</div>
          <ul className="mt-0.5 space-y-0.5 text-xs text-zinc-300">
            {v.copied.map((o, i) => (
              <li key={i}>
                “{o.sentence}” <span className="text-zinc-500">· {o.source}: “{o.match}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.long.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-amber-200">Frase longa demais para falar num fôlego:</div>
          <ul className="mt-0.5 space-y-0.5 text-xs text-zinc-300">
            {v.long.map((l, i) => (
              <li key={i}>
                {l.who ? <span className="text-zinc-500">{l.who}: </span> : null}“{l.sentence}” <span className="text-zinc-500">· {l.words} palavras</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function ScriptView({c}: {c:ScriptContent;formatName?:string|null}) {
 return <ScriptTabs spoken={<div className="space-y-3">{spokenLines(c).map(l=><p key={l.n}><strong>{l.who}:</strong> {l.text}</p>)}</div>} animation={<div>{(c.planoCenas?.length||c.cenas.length)>0&&<p className="mb-3 text-amber-300">Direção legada para consulta. Prepare e confira as etapas vinculadas à versão aprovada abaixo antes de produzir.</p>}{c.planoCenas?.length ? c.planoCenas.map((scene,i)=><p key={i}>{sceneLine(scene,i)}</p>) : c.cenas.length?c.cenas.map((s,i)=><p key={i}>{s.inicio}–{s.fim}s (estimado): {s.acao}</p>):<p>Veja abaixo “Direção da versão atual” para preparar ou consultar cena, fotografia, som e integração.</p>}</div>}/>;
}

/** (a) A história do Gubs que deu origem à ideia: o que fica preservado e o texto inteiro. */
function StoryPanel({ s }: { s: OwnStory }) {
  return (
    <div className="space-y-2 rounded-lg border border-sky-900/60 bg-sky-950/10 p-3 text-sm">
      <div className="text-xs text-sky-300">
        Sua história · {s.manterFalas ? "falas mantidas (só corta e reordena)" : "falas podem ser reescritas, menos as do Preservar"}
      </div>
      {s.preservar.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500">Preservar</div>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {s.preservar.map((p) => (
              <li key={p} className="badge bg-zinc-800 text-zinc-200">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Collapsible title="Ver o texto inteiro" className="rounded border border-line p-2">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">{s.text}</pre>
      </Collapsible>
    </div>
  );
}

/** Adendo B: abertura original × sugerida, com o motivo e "usar a original" (sem IA). */
function OpeningPanel({ ideaId, versionId, story, c }: { ideaId: string; versionId: string | null; story: OwnStory; c: ScriptContent }) {
  const chk = openingCheck(story, spokenLines(c).map((l) => ({ personagem: l.who, fala: l.text })));
  if (!chk) return null;
  if (chk.mantida)
    return (
      <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-200 lg:col-span-2">
        Abre com a sua abertura original{story.manterAbertura ? " (você pediu para manter)" : ""}.
      </p>
    );
  const block = (title: string, ls: { who: string; text: string }[], cls: string) => (
    <div className={`min-w-0 rounded-lg border p-3 ${cls}`}>
      <div className="mb-1 text-xs font-medium text-zinc-400">{title}</div>
      {ls.map((l, i) => (
        <p key={i} className="text-sm text-zinc-100">
          <strong>{l.who}:</strong> {l.text}
        </p>
      ))}
    </div>
  );
  return (
    <div className="space-y-3 rounded-lg border border-amber-700/60 bg-amber-950/10 p-4 lg:col-span-2" id="abertura">
      <h3 className="text-sm font-semibold text-zinc-200">O gerador trocou a sua abertura</h3>
      {c.mudancas?.abertura && <p className="text-sm text-amber-200">Motivo: {c.mudancas.abertura}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {block("Sua abertura (original)", chk.original, "border-emerald-800/60")}
        {block("Abertura sugerida", chk.sugerida, "border-sky-800/60")}
      </div>
      {versionId && (
        <ActionButton
          action={originalOpeningAction.bind(null, ideaId, versionId)}
          label="Usar a original"
          busy="Trocando…"
          hint="Sem IA · US$ 0 · troca só a abertura e grava como nova versão"
          className="btn-secondary btn-sm"
        />
      )}
    </div>
  );
}

/** (a) Lado direito: o que mudou da história, em linguagem leiga, com a conferência em código das falas. */
function StoryChangesPanel({ c }: { c: ScriptContent }) {
  const m = c.mudancas!;
  const cmp = c.comparacao;
  const item = (title: string, body: React.ReactNode) => (
    <div>
      <div className="text-xs font-medium text-zinc-400">{title}</div>
      <div className="mt-0.5 text-zinc-200">{body}</div>
    </div>
  );
  const list = (xs: string[], empty: string) => (xs.length ? <ul className="list-disc space-y-0.5 pl-4">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="text-zinc-500">{empty}</span>);
  return (
    <div className="space-y-3 text-sm">
      {item("Abertura", m.abertura)}
      {item(
        "Ganchos (onde planta → onde paga)",
        m.ganchos.length ? (
          <ol className="list-decimal space-y-1 pl-4">
            {m.ganchos.map((g, i) => (
              <li key={i}>
                {g.pergunta} <span className="text-zinc-500">· {g.plantadoEm} → {g.pagoEm}</span>
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-amber-300">Nenhum gancho aberto listado.</span>
        ),
      )}
      {item("O que saiu", list(m.cortes, "Nada foi cortado."))}
      {item("O que mudou de lugar", list(m.reordenado, "A ordem é a da história."))}
      {m.falasReescritas.length > 0 &&
        item(
          "Falas reescritas",
          <ul className="space-y-1">
            {m.falasReescritas.map((f, i) => (
              <li key={i}>
                <span className="text-zinc-500 line-through">{f.antes}</span> → {f.depois}
              </li>
            ))}
          </ul>,
        )}
      {item("Falas novas", list(m.falasNovas, "Nenhuma."))}
      {item("Final", m.final)}
      {cmp && (
        <div className="space-y-1 rounded border border-line p-2">
          <div className="text-xs font-medium text-zinc-400">Conferido sem IA</div>
          <p>
            {cmp.iguais} de {cmp.total} falas da sua história ficaram iguais.
          </p>
          {cmp.marcadas.map((f) => (
            <p key={f.fala} className={f.ok ? "text-emerald-300" : "text-red-300"}>
              {f.ok ? "✓" : "✗ faltou:"} “{f.fala}”
            </p>
          ))}
          {cmp.fora.length > 0 && (
            <Collapsible title={`Falas da história que não estão iguais (${cmp.fora.length})`}>
              <ul className="space-y-0.5 text-xs text-zinc-400">
                {cmp.fora.map((f, i) => (
                  <li key={i}>
                    {f.who}: {f.text}
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
        </div>
      )}
      {c.preservados && c.preservados.length > 0 && (
        <Collapsible title="Onde entrou cada item do Preservar">
          <ul className="space-y-0.5 text-xs">
            {c.preservados.map((p, i) => (
              <li key={i} className={p.onde ? "text-zinc-300" : "text-red-300"}>
                {p.item}: {p.onde || "não entrou"}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

export default async function IdeaPage({ params }: PageProps<"/ideias/[id]">) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: { myChannel: true, niche: true, publishedVideo: true, videoFormat: true, lessons: { orderBy: { createdAt: "asc" } } },
  });
  if (!idea) notFound();
  const d = parse<IdeaData>(idea.ideaData);
  const titles = parse<string[]>(idea.titles) ?? [];
  const scriptForCopy=idea.script?await ideaExport(idea.id):null;
  const sd = parse<ScriptContent & { metrics?: ScriptMetrics; playbookId?: string | null; voice?: VoiceCheck; review?: ScriptReview; meta?: FormatMeta }>(idea.scriptData);
  const refIds = parse<string[]>(idea.referenceIds) ?? [];
  const pbId = sd?.playbookId ?? idea.playbookId;
  const recipeId = sd?.meta?.recipeId ?? idea.recipeId;
  const nicheForFormats = idea.nicheId ?? idea.myChannel?.nicheId ?? null;

  const [refs, playbook, recipe, similar, est, jobs, formatChoices] = await Promise.all([
    refIds.length ? prisma.video.findMany({ where: { id: { in: refIds } }, select: { id: true, title: true, channel: { select: { title: true } } } }) : [],
    !recipeId && pbId ? prisma.nichePlaybook.findUnique({ where: { id: pbId }, select: { stats: true, diagnosisCount: true, createdAt: true } }) : null,
    recipeId ? prisma.formatRecipe.findUnique({ where: { id: recipeId }, select: { stats: true, version: true } }) : null,
    findSimilarTitles(`${idea.theme} ${idea.chosenTitle ?? ""}`, { nicheId: idea.nicheId ?? undefined, limit: 5 }),
    idea.myChannelId && idea.formatId ? estimateScript(idea.id) : null,
    runningJobsFor([idea.id]),
    (!idea.formatId || sd?.formatoCombina?.combina === false) && nicheForFormats ? formatChoicesFor(nicheForFormats, idea.format === "long" ? "long" : "short") : Promise.resolve([]),
  ]);
  const scriptJob = jobs.find((j) => j.kind === "script");
  const repeats = (await repeatsForIdeas([idea])).get(idea.id) ?? [];
  const cands = idea.publishedVideo ? null : await publishedCandidates(idea);
  const pbStats = parse<PlaybookStats>(recipe?.stats ?? playbook?.stats);
  const pbLabel = recipe ? `Receita v${recipe.version}` : "Cartilha";
  const pending = sd ? scriptPending(sd) : null;
  const allTitles = [...new Set([...(idea.chosenTitle ? [idea.chosenTitle] : []), ...titles])];
  const currentStep = idea.publishedVideo || idea.status === "PUBLISHED" ? 7 : idea.status === "PRODUCED" ? 6 : idea.status === "RETURNED" ? 4 : sd ? 5 : 4;
  // Trocar o formato: ideia de antes dos formatos, ou o roteiro avisou que o formato não combina com o tema.
  const otherFormats = formatChoices.filter((f) => f.id !== idea.formatId);
  const formatForm = (
          <StateForm
            action={regenerateWithFormatAction.bind(null, idea.id)}
            label="Escrever neste formato"
            busy="Começando…"
            hint="Uma geração · mesmo custo de escrever um roteiro · roda em segundo plano (até 3 min)"
          >
            <fieldset>
              <legend className="label">Qual formato usar?</legend>
              <div className="space-y-2">
                {otherFormats.map((f) => (
                  <label key={f.id} className="flex items-start gap-2 rounded-lg border border-line p-2 text-sm hover:border-zinc-500">
                    <input type="radio" name="formatId" value={f.id} required className="mt-1" />
                    <span>
                      <span className="font-medium text-zinc-100">{f.name}</span>
                      {!f.ready && <span className="badge ml-2 bg-amber-600/30 text-amber-200">{f.recipes.length ? "rascunho" : "sem receita"}</span>}
                      <span className="block text-xs text-zinc-400">{f.line || "Sem descrição."}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!otherFormats.some((f) => f.ready) && (
                <p className="mt-1 text-xs text-amber-300">Nenhum formato pronto ainda (3+ vídeos e receita); estes ainda são rascunho.</p>
              )}
            </fieldset>
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
              <textarea name="extra" rows={2} className="input" placeholder="Ex.: mais curto, até 35s · coloca a avó no final" />
            </div>
            {otherFormats.some((f) => !f.recipes.length) && <NoRecipeConfirm onlyIf />}
          </StateForm>
  );
  const scriptForm = est ? (
            <StateForm
              action={generateScriptAction.bind(null, idea.id)}
              label={sd ? "Escrever história nova" : "Escrever roteiro"}
              busy="Começando…"
              hint={`${estimateHint(est)} · uma versão · em segundo plano`}
              className="btn-primary"
            >
              <input type="hidden" name="mode" value="nova" />
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
              {est.noRecipe && <NoRecipeConfirm />}
            </StateForm>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={idea.myChannelId ? `/ideias?canal=${idea.myChannelId}` : "/ideias"} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Banco de ideias
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{idea.chosenTitle || titles[0] || idea.theme}</h1>
          <p className="text-sm text-zinc-400">
            {idea.myChannel ? <Link href={`/meus-canais/${idea.myChannel.id}`} className="hover:underline">{idea.myChannel.name}</Link> : "sem canal"} ·{" "}
            {idea.format === "long" ? "vídeo longo" : "Short"} · criada {fmtDateTime(idea.createdAt)}
            {idea.niche && ` · nicho ${idea.niche.name}`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {idea.videoFormat ? (
              <Link href={`/formatos/${idea.videoFormat.id}`}>
                <FormatTag name={idea.videoFormat.name} />
              </Link>
            ) : (
              <FormatTag name={null} />
            )}
            {pending && (pending.unchecked > 0 || pending.facts > 0) && (
              <span className="badge bg-amber-600/20 text-amber-200">
                Pendências: {pending.unchecked > 0 && `${pending.unchecked} ${pending.unchecked === 1 ? "caixa desmarcada" : "caixas desmarcadas"}`}
                {pending.unchecked > 0 && pending.facts > 0 && " · "}
                {pending.facts > 0 && `${pending.facts} ${pending.facts === 1 ? "fato para conferir" : "fatos para conferir"}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={idea.status} />
          <Menu><div className="p-2"><label className="label">Alterar estado</label><IdeaStatusSelect action={setIdeaStatus.bind(null, idea.id)} value={idea.status} /></div></Menu>
        </div>
      </header>

      <FlowSteps current={currentStep} referenceDone={refs.length > 0} />
      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        <span className="card px-3 py-2">Custo do roteiro <strong className="ml-2 text-zinc-200">{usd(idea.scriptCostUsd)}</strong></span>
        <span className="card px-3 py-2">Etapa atual <strong className="ml-2 text-zinc-200">{currentStep} de 7</strong></span>
      </div>

      {/* A ideia */}
      <WorkSection id="ideia" title="3 · Ideia">
        
        {!idea.publishedVideo && <RepeatWarning repeats={repeats} />}
        {d ? (
          <>
            <ClampText lines={3} className="text-[15px] leading-relaxed text-zinc-200">
              {d.premissa}
            </ClampText>
            {d.gancho && (
              <blockquote className="border-l-2 border-red-500/70 pl-2 text-zinc-300 italic">
                {d.gancho} <span className="block text-xs text-zinc-500 not-italic">Gancho: {d.ganchoPadrao}</span>
              </blockquote>
            )}
            {d.doGubs && <p className="text-xs text-sky-300">Ideia sua: o texto vai como premissa obrigatória, com as regras gerais (abertura, ganchos, final em loop).</p>}
            {d.historia && <StoryPanel s={d.historia} />}
            <Collapsible title="De onde veio, por que pode funcionar e riscos" className="rounded-lg border border-line p-4" bodyClassName="mt-3 space-y-3">
            <div className="text-xs text-zinc-500">{idea.formatId ? "Como segue o motor do formato" : "Formato de história"}: {d.formatoDeHistoria}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded bg-ink/60 p-3">
                <div className="text-xs text-zinc-500">{idea.formatId ? "Vem da receita do formato" : "Vem da cartilha / referência"}</div>
                <div className="text-zinc-200">{d.adaptacao.daCartilha}</div>
              </div>
              <div className="rounded bg-ink/60 p-3">
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
            </Collapsible>
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
        <Collapsible
          title={<span className="text-sm">Já foi feito? Títulos parecidos nos canais monitorados</span>}
          meta={similar.length ? `${similar.length} parecido${similar.length === 1 ? "" : "s"}` : "nada parecido"}
        >
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
        </Collapsible>
      </WorkSection>

      {/* Roteiro */}
      <WorkSection id="roteiro" title="4 · Roteiro e direção" open={true} version={idea.projectCode ?? idea.status}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-zinc-400">{sd ? "Roteiro falado" : "Escolha o título e escreva o roteiro"}</span>
          {idea.script && (
            <span className="text-xs text-zinc-500">
              {modelLabel(idea.scriptModel)} · custo acumulado {usd(idea.scriptCostUsd)}
            </span>
          )}
        </header>

        {sd ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <CopyScript url={`/api/ideias/${idea.id}/roteiro`} />
              <a href={`/api/ideias/${idea.id}/roteiro`} download className="btn-secondary btn-sm">
                Baixar roteiro para leitura
              </a>
              
            </div>
            {sd.review && <Collapsible title="Leitura de espectador (lógica e graça)"><ReviewPanel r={sd.review} /></Collapsible>}
            {sd.voice && <Collapsible title="Conferência das falas"><VoicePanel v={sd.voice} /></Collapsible>}
            {sd.mudancas ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">O que o gerador escreveu</h3>
                  <ScriptView c={sd} formatName={sd.meta?.formatName ?? idea.videoFormat?.name} />
                </div>
                <div className="min-w-0 rounded-lg border border-sky-900/60 bg-sky-950/10 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">O que mudou da sua história</h3>
                  <StoryChangesPanel c={sd} />
                </div>
                {d?.historia && (
                  <OpeningPanel ideaId={idea.id} versionId={idea.currentVersionId} story={d.historia} c={sd} />
                )}
                {d?.historia && (
                  <div className="min-w-0 rounded-lg border border-line p-4 lg:col-span-2" id="comparacao-linhas">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-200">Sua história × roteiro, linha a linha</h3>
                    <LineDiff original={storyLines(d.historia)} generated={spokenLines(sd).map((l) => ({ who: l.who, text: l.text }))} />
                  </div>
                )}
              </div>
            ) : (
              <ScriptView c={sd} formatName={sd.meta?.formatName ?? idea.videoFormat?.name} />
            )}
             <VersionReview idea={idea} />
            {sd.metrics && (
              <Collapsible title={`Medidas do roteiro × ${recipe ? "receita do formato" : "cartilha"}`} className="rounded-lg border border-line p-4">
                <MetricsVsPlaybook m={sd.metrics} st={pbStats} label={pbLabel} />
              </Collapsible>
            )}
            {idea.script && (
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar</summary>
                <textarea readOnly rows={18} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" value={scriptForCopy??""} />
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">Ainda sem roteiro.</p>
        )}

        {scriptJob ? (
          <RunningNote job={scriptJob} what="Roteiro" />
        ) : est ? (
          <div className={sd ? "border-t border-line pt-4" : ""}>
            {sd ? (
              <>
                <Collapsible title="Escrever história nova">
                  {scriptForm}
                </Collapsible>
                {sd.formatoCombina?.combina === false && otherFormats.length > 0 && (
                  <Collapsible title="Escrever em outro formato" open>
                    <p className="mb-3 text-sm text-amber-300">O roteiro avisou que o formato pode não combinar com o tema. O tema fica; só o jeito de contar muda.</p>
                    {formatForm}
                  </Collapsible>
                )}
              </>
            ) : (
              scriptForm
            )}
          </div>
        ) : !idea.myChannelId ? (
          <p className="text-sm text-amber-300">Essa ideia não está ligada a um canal seu, então não dá para escrever o roteiro.</p>
        ) : !idea.formatId ? (
          <div className="space-y-3 border-t border-line pt-4">
            <p className="text-sm text-amber-300">
              Esta ideia é de antes dos formatos. Para {sd ? "regenerar" : "escrever"} o roteiro, escolha primeiro o formato: o tema da ideia fica, só o jeito de
              contar muda (segue o motor da receita do formato).
            </p>
            {otherFormats.length ? (
              formatForm
            ) : (
              <p className="text-sm text-zinc-400">
                Nenhum formato criado neste nicho ainda.{" "}
                <Link href={nicheForFormats ? `/formatos?niche=${nicheForFormats}` : "/formatos"} className="text-red-400 hover:underline">
                  Criar em Formatos do nicho
                </Link>
              </p>
            )}
          </div>
        ) : null}
      </WorkSection>

      {/* Devolução do Estúdio */}
      {idea.myChannelId && (idea.script || idea.lessons.length > 0) && (
        <WorkSection id="revisao" title="5 · Revisão do Estúdio" open={currentStep === 5} version={idea.status}>
          <p className="text-sm text-zinc-400">Leia o roteiro, confira as pendências e leve ao Estúdio.</p>
          <OpenSection target="roteiro">Ler roteiro</OpenSection>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-zinc-400">Aprove o roteiro e a direção nas etapas 4.1 e 4.2 antes de produzir.</span>
            {idea.returnedAt && <span className="text-xs text-zinc-500">devolvida em {fmtDateTime(idea.returnedAt)}</span>}
          </header>
          {idea.lessons.length > 0 && (
            <Collapsible title="Viraram regra do canal" meta={`${idea.lessons.length} ${idea.lessons.length === 1 ? "regra" : "regras"}`}>
              <p className="mb-1 text-xs text-zinc-500">
                Pontos deste roteiro que viraram regra do canal: entram em toda ideia e roteiro (em todos os formatos, se marcados &quot;canal todo&quot;), com peso maior que a receita do formato. Os pontos &quot;só este roteiro&quot; ficam na devolução do projeto.
              </p>
              <ul className="space-y-1 text-sm">
                {idea.lessons.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 rounded border border-line px-3 py-1.5">
                    <span className="text-zinc-200">{l.text}</span>
                    <form action={deleteLessonAction.bind(null, l.id)}>
                      <button className="btn-ghost px-2 py-0.5 text-xs text-zinc-500 hover:text-red-400" title="Tirar este ponto dos aprendizados">
                        tirar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}
          <Collapsible
            title="Devolver"
          >
            <StateForm action={returnIdeaAction.bind(null, idea.id)} label="Registrar devolução" className="btn-secondary">
              <ReturnInput />
            </StateForm>
          </Collapsible>
        </WorkSection>
      )}

      <WorkSection id="producao" title="6 · Produção" open={currentStep === 6} version={idea.status}>
        <p className="text-sm text-zinc-400">Depois de aprovar o roteiro, leve o .md ao Estúdio para produzir.</p>
        {idea.script && <a href={`/api/ideias/${idea.id}/roteiro`} download className="btn-secondary btn-sm">Baixar .md</a>}
        <IdeaStatusSelect action={setIdeaStatus.bind(null, idea.id)} value={idea.status} />
      </WorkSection>

      {/* Virou vídeo? */}
      <WorkSection id="publicacao" title="7 · Virou vídeo no seu canal?" open={currentStep === 7} version={idea.status}>
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
      </WorkSection>

      <WorkSection id="anotacoes" title="Anotações">
        <StateForm action={saveIdeaNotes.bind(null, idea.id)} label="Salvar" className="btn-secondary">
          <textarea name="notes" rows={3} className="input" defaultValue={idea.notes ?? ""} placeholder="O que mudar, quando gravar, link do vídeo publicado…" />
        </StateForm>
      </WorkSection>

      <div className="flex justify-end">
        <DeleteIdeaButton action={deleteIdea.bind(null, idea.id)} label="Apagar ideia" className="btn-danger" />
      </div>
    </div>
  );
}

/** Formato sem receita: aviso e confirmação obrigatória antes de escrever o roteiro. */
function NoRecipeConfirm({ onlyIf = false }: { onlyIf?: boolean }) {
  return (
    <div className="rounded-lg border border-amber-600/40 bg-amber-950/30 p-3 text-sm text-amber-100">
      <p>
        {onlyIf ? "Se escolher um formato marcado “sem receita”: " : "Este formato ainda não tem receita. "}o roteiro sai só da descrição e dos estudos dos vídeos, e costuma
        sair pior. O melhor é criar a receita antes, em Formatos.
      </p>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" name="noRecipeOk" className="mt-1" required={!onlyIf} />
        <span>Entendi, escrever mesmo sem receita</span>
      </label>
    </div>
  );
}               <input type="hidden" name="mode" value="nova" />

