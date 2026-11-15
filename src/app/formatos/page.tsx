import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import { formatLabel, loadNicheStudies, type PlaybookFormat } from "@/lib/playbook";
import { MIN_FORMAT_VIDEOS, estimateRule, formatsOfNiche, isDraft, readyFormats, type RuleContent } from "@/lib/formats";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { ActionButton } from "@/app/video/[id]/forms";
import { StateForm } from "@/components/StateForm";
import { Collapsible, EmptyState, FilterChip, PageHeader, Tabs, one, type SP } from "@/components/ui";
import { ClampText } from "@/components/ui-client";
import { createFormatAction, generateRuleAction } from "./actions";

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

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-zinc-300">{children}</h3>;
}

function RuleView({ c }: { c: RuleContent }) {
  return (
    <div className="space-y-4 text-sm">
      <ClampText lines={4} className="text-[15px] leading-relaxed text-zinc-200">
        {c.resumo}
      </ClampText>
      <div>
        <H3>Vale para todos os formatos (isto entra no gerador)</H3>
        {c.comum.length === 0 ? (
          <p className="text-zinc-400">Nada em comum o bastante para virar regra.</p>
        ) : (
          <ul className="space-y-2">
            {c.comum.map((x, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div>
                  <span className="badge mr-2 bg-emerald-600/30 text-emerald-200">{x.tema}</span>
                  <span className="text-zinc-100">{x.regra}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{x.porque}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                  {x.emCadaFormato.map((e, j) => (
                    <li key={j}>
                      <span className="text-zinc-300">{e.formato}:</span> {e.como}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H3>É de cada formato (não vira regra)</H3>
          <ul className="space-y-1.5 text-zinc-300">
            {c.especificos.map((e, i) => (
              <li key={i}>
                <span className="font-medium text-zinc-100">{e.formato}:</span> {e.oQueEDele.join(" · ")}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          {c.conflitos.length > 0 && (
            <div>
              <H3>Onde os formatos fazem o contrário</H3>
              <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
                {c.conflitos.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <H3>Checklist da regra geral</H3>
            <ul className="space-y-1 text-zinc-200">
              {c.checklist.map((x, i) => (
                <li key={i}>☐ {x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function FormatsPage({ searchParams }: PageProps<"/formatos">) {
  const sp: SP = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (niches.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Formatos do nicho" />
        <EmptyState
          title="Crie um nicho primeiro"
          action={
            <Link href="/nichos" className="btn-primary">
              Ir para Nichos e canais
            </Link>
          }
        >
          Depois estude alguns vídeos dele e junte os parecidos em formatos.
        </EmptyState>
      </div>
    );

  const niche = niches.find((n) => n.id === one(sp.niche)) ?? niches[0];
  const fmtParam = one(sp.format);
  const length: PlaybookFormat = fmtParam === "long" ? "long" : "short";
  const tab = one(sp.aba) === "regra" ? "regra" : "formatos";

  const [formats, studies, ready, rules, s, jobs] = await Promise.all([
    formatsOfNiche(niche.id, length),
    loadNicheStudies(niche.id, length),
    readyFormats(niche.id, length),
    prisma.nicheRule.findMany({ where: { nicheId: niche.id, length }, orderBy: { createdAt: "desc" } }),
    getSettings(),
    runningJobsFor([`${niche.id}:${length}`]),
  ]);
  const inAnyFormat = new Set(
    (await prisma.formatVideo.findMany({ where: { nicheId: niche.id }, select: { videoId: true } })).map((x) => x.videoId),
  );
  const loose = studies.filter((x) => !inAnyFormat.has(x.id)).length;
  const chosenRule = rules.find((r) => r.id === one(sp.v)) ?? rules[0] ?? null;
  const ruleContent = parse<RuleContent>(chosenRule?.content);
  const ruleEst = ready.length >= 2 ? await estimateRule(niche.id, length) : null;
  const ruleJob = jobs.find((j) => j.kind === "rule");
  const ruleStale =
    !!rules[0] &&
    ((parse<string[]>(rules[0].recipeIds) ?? []).sort().join() !== ready.map((r) => r.recipe.id).sort().join());

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { niche: niche.id, format: length, aba: tab === "regra" ? "regra" : undefined, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/formatos?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Formatos do nicho"
        subtitle="Cada formato é uma receita de vídeo tirada de 3 a 5 vídeos que seguem a mesma estrutura."
        help={
          <p>
            <b>Camada 1, formatos:</b> você escolhe quais vídeos estudados entram em cada formato e o Radar escreve a receita (como abre, quem narra,
            o que se repete e a cada quantos segundos, como a tensão cresce, como fecha e por que viralizou). Com menos de {MIN_FORMAT_VIDEOS} vídeos o
            formato fica como rascunho. <b>Camada 2, regra geral:</b> com 2 ou mais formatos prontos, o Radar compara as receitas e só o que é comum a
            todos vira regra. No gerador você escolhe um formato e o roteiro segue só ele.
          </p>
        }
        actions={
          <>
          <Link href={`/formatos/classificar?niche=${niche.id}`} className="btn-secondary">
            Classificar estudos automaticamente
          </Link>
          <Link href={`/cartilha?niche=${niche.id}&format=${length}`} className="text-xs text-zinc-500 hover:text-zinc-300" title="A cartilha antiga juntava todos os estudos. Fica guardada só para consulta.">
            Cartilha antiga (histórico)
          </Link>
          <Link href={`/formatos/limpeza?niche=${niche.id}`} className="text-xs text-zinc-500 hover:text-zinc-300" title="Apaga a cartilha antiga e as ideias sem formato, com cópia de segurança antes.">
            Limpeza
          </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {niches.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-zinc-500">Nicho</span>
            {niches.map((n) => (
              <FilterChip key={n.id} href={`/formatos?niche=${n.id}&format=${length}`} active={n.id === niche.id}>
                {n.name}
              </FilterChip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Tipo</span>
          <FilterChip href={href({ format: "short", v: undefined })} active={length === "short"}>
            Shorts
          </FilterChip>
          <FilterChip href={href({ format: "long", v: undefined })} active={length === "long"}>
            Vídeos longos
          </FilterChip>
        </div>
      </div>

      <Tabs
        items={[
          { href: href({ aba: undefined, v: undefined }), label: "Formatos", count: formats.length, active: tab === "formatos" },
          { href: href({ aba: "regra", v: undefined }), label: "Regra geral do nicho", active: tab === "regra" },
        ]}
      />

      {tab === "formatos" ? (
        <>
          {formats.length === 0 ? (
            <EmptyState title={`Nenhum formato de ${formatLabel(length, true)} em ${niche.name}`}>
              Crie o primeiro abaixo, dê um nome (ex.: “desastre em cadeia”) e escolha de 3 a 5 vídeos estudados que seguem a mesma estrutura.
            </EmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {formats.map((f) => {
                const draft = isDraft(f._count.videos);
                const r = f.recipes[0];
                return (
                  <Link key={f.id} href={`/formatos/${f.id}`} className="card flex flex-col gap-2 p-4 hover:border-zinc-600">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-semibold">{f.name}</span>
                      <span className={`badge shrink-0 ${draft ? "bg-amber-600/30 text-amber-200" : "bg-emerald-600/30 text-emerald-200"}`}>
                        {draft ? "rascunho" : "pronto"}
                      </span>
                    </div>
                    {f.description && <p className="line-clamp-2 text-sm text-zinc-400">{f.description}</p>}
                    <div className="mt-auto text-xs text-zinc-500">
                      {f._count.videos} {f._count.videos === 1 ? "vídeo" : "vídeos"}
                      {draft && ` (faltam ${MIN_FORMAT_VIDEOS - f._count.videos} para sair do rascunho)`} ·{" "}
                      {r ? `receita v${r.version} de ${fmtDateTime(r.createdAt)}` : "sem receita ainda"}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {loose > 0 && (
            <p className="text-sm text-zinc-400">
              {loose} {loose === 1 ? "vídeo estudado" : "vídeos estudados"} de {formatLabel(length, true)} neste nicho ainda {loose === 1 ? "não está" : "não estão"} em nenhum formato.{" "}
              <Link href={`/formatos/classificar?niche=${niche.id}`} className="text-red-400 hover:underline">
                Deixar o Radar sugerir
              </Link>
            </p>
          )}
          <Collapsible title="Novo formato" className="card p-4" open={formats.length === 0}>
            <StateForm action={createFormatAction.bind(null, niche.id, length)} label="Criar formato" busy="Criando…">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Nome</label>
                  <input name="name" className="input" placeholder="Ex.: desastre em cadeia" />
                </div>
                <div>
                  <label className="label">Descrição curta (opcional)</label>
                  <input name="description" className="input" placeholder="Ex.: uma coisa pequena sai do controle e piora a cada tentativa" />
                </div>
              </div>
              <p className="text-xs text-zinc-500">Formato de {formatLabel(length, true)} em {niche.name}. Depois de criar, escolha os vídeos.</p>
            </StateForm>
          </Collapsible>
        </>
      ) : (
        <section className="card space-y-4 p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Regra geral de {formatLabel(length, true)} em {niche.name}</h2>
            {chosenRule && (
              <span className="text-xs text-zinc-500">
                v{chosenRule.version} · {fmtDateTime(chosenRule.createdAt)} · comparou {(parse<string[]>(chosenRule.formatNames) ?? []).join(", ")} · custou{" "}
                {usd(chosenRule.costUsd)}
              </span>
            )}
          </header>
          <p className="text-sm text-zinc-400">
            Formatos prontos ({MIN_FORMAT_VIDEOS}+ vídeos e receita gerada): {ready.length ? ready.map((r) => r.format.name).join(", ") : "nenhum"}.
            {ready.length < 2 && " A regra geral precisa de pelo menos 2. Rascunho não conta."}
          </p>
          {ruleStale && <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">Algum formato mudou de receita desde esta regra. Gere de novo para comparar as receitas atuais.</p>}
          {ruleContent ? <RuleView c={ruleContent} /> : <p className="text-sm text-zinc-400">Nenhuma regra geral gerada ainda.</p>}
          {ruleJob ? (
            <RunningNote job={ruleJob} what="Regra geral" />
          ) : ruleEst ? (
            <div className="border-t border-line pt-4">
              {!s.anthropicApiKey && (
                <p className="mb-3 text-sm text-amber-300">
                  Falta a chave da Anthropic: cole a chave em <Link href="/configuracoes#chaves" className="underline">Configurações</Link>.
                </p>
              )}
              <ActionButton
                action={generateRuleAction.bind(null, niche.id, length)}
                label={ruleContent ? "Gerar de novo" : "Gerar regra geral"}
                busy="Começando…"
                hint={`${estimateHint(ruleEst)} · roda em segundo plano`}
                className={ruleContent && !ruleStale ? "btn-secondary" : "btn-primary"}
              />
            </div>
          ) : null}
          {rules.length > 1 && (
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Versões anteriores ({rules.length - 1})</summary>
              <ul className="divide-y divide-line text-sm">
                {rules.map((r, i) => (
                  <li key={r.id}>
                    <Link href={href({ v: i === 0 ? undefined : r.id })} className={`flex justify-between px-3 py-2 hover:bg-raised ${r.id === chosenRule?.id ? "text-white" : "text-zinc-400"}`}>
                      <span>
                        v{r.version} · {fmtDateTime(r.createdAt)} · {(parse<string[]>(r.formatNames) ?? []).join(", ")}
                      </span>
                      <span className="text-xs text-zinc-500">{usd(r.costUsd)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {chosenRule?.markdown && (
            <details className="rounded-lg border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar (Markdown)</summary>
              <textarea readOnly rows={14} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={chosenRule.markdown} />
            </details>
          )}
        </section>
      )}
    </div>
  );
}
