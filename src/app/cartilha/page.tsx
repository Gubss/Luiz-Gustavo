import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime, fmtMult } from "@/lib/format";
import { modelLabel } from "@/lib/claude";
import {
  changedSince,
  computePlaybookStats,
  dataLevel,
  formatLabel,
  loadNicheStudies,
  studyCounts,
  type Med,
  type PlaybookContent,
  type PlaybookFormat,
  type PlaybookStats,
  type Share,
} from "@/lib/playbook";
import { Chevron, Collapsible, EmptyState, FilterChip, PageHeader } from "@/components/ui";
import { ClampText } from "@/components/ui-client";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (n: number | null) => (n == null ? "—" : String(n).replace(".", ","));
const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`);
const mmss = (s: number | null) => (s == null ? "—" : s < 90 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}min${String(Math.round(s % 60)).padStart(2, "0")}`);

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const Chip = FilterChip;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-raised p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{hint}</div>}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-zinc-300">{children}</h3>;
}

const range = (m: Med, unit = "", f: (n: number | null) => string = num) =>
  m.n > 1 && m.min != null ? `de ${f(m.min)}${unit} a ${f(m.max)}${unit} · ${m.n} estudos` : m.n === 1 ? "1 estudo" : "sem dado";
const share = (s: Share) => (s.n ? `${s.yes} de ${s.n}` : "—");

const LEVEL_STYLE: Record<string, string> = {
  none: "bg-zinc-800 text-zinc-300",
  preliminary: "bg-amber-600/30 text-amber-200",
  initial: "bg-sky-700/30 text-sky-200",
  good: "bg-emerald-600/30 text-emerald-200",
  solid: "bg-emerald-600/50 text-emerald-100",
};

const PART_LABEL: Record<string, string> = { gancho: "Gancho", virada: "Virada", desenvolvimento: "Desenvolvimento", climax: "Clímax", fecho: "Fecho" };

/** Medidas calculadas em código (grátis, aparecem mesmo sem gerar a cartilha). */
function StatsPanel({ st }: { st: PlaybookStats }) {
  const t = st.title;
  const parts = st.structure.filter((p) => p.endPct.value != null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Views (mediana)" value={fmtCompact(st.views.value)} hint={range(st.views, "", fmtCompact)} />
        <Tile label="x média do canal" value={fmtMult(st.multAvg.value)} hint={range(st.multAvg, "x")} />
        <Tile label="Duração" value={mmss(st.durationSec.value)} hint={range(st.durationSec, "s")} />
        <Tile label="Palavras/s" value={num(st.wordsPerSec.value)} hint={range(st.wordsPerSec)} />
        <Tile label="Algo novo a cada" value={st.beatInterval.value != null ? `${num(st.beatInterval.value)}s` : "—"} hint={range(st.beatInterval, "s")} />
        <Tile label="Maior buraco" value={st.maxGap.value != null ? `${num(st.maxGap.value)}s` : "—"} hint={range(st.maxGap, "s")} />
      </div>
      <Collapsible title={<span className="text-sm">Ver todas as medidas (título, abertura, gatilhos, esqueleto)</span>} bodyClassName="mt-4 space-y-4">
      <div className="grid gap-4 text-sm md:grid-cols-3">
        <div>
          <H3>Título</H3>
          <ul className="space-y-0.5 text-zinc-300">
            <li>
              {num(t.chars.value)} caracteres · {num(t.words.value)} palavras <span className="text-zinc-500">(mediana)</span>
            </li>
            <li>Pergunta: {share(t.question)}</li>
            <li>Número: {share(t.number)}</li>
            <li>Fala com “você”: {share(t.secondPerson)}</li>
            <li>Começa com “E se…”: {share(t.whatIf)}</li>
            <li>CAIXA ALTA: {share(t.caps)}</li>
            <li>Dois-pontos / travessão: {share(t.colonOrDash)}</li>
          </ul>
        </div>
        <div>
          <H3>Abertura e fecho</H3>
          <ul className="space-y-0.5 text-zinc-300">
            <li>Primeira fala em: {st.firstWordAt.value != null ? `${num(st.firstWordAt.value)}s` : "—"}</li>
            <li>
              Palavras nos primeiros {st.format === "short" ? "3" : "30"}s: {num(st.openingWords.value)}
            </li>
            <li>Ritmo começo · meio · fim: {st.pace.map((p) => num(p.value)).join(" · ")} palavras/s</li>
            <li>Fecho com chamada: {share(st.closingCta)}</li>
            <li>Termina em pergunta: {share(st.closingQuestion)}</li>
          </ul>
        </div>
        <div>
          <H3>Gatilhos e ganchos</H3>
          {st.triggers.length === 0 && st.hookTechniques.length === 0 ? (
            <p className="text-zinc-500">Sem dado.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {st.triggers.slice(0, 12).map((x) => (
                <span key={x.label} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {x.label} {x.count > 1 && <span className="text-zinc-500">×{x.count}</span>}
                </span>
              ))}
            </div>
          )}
          {st.hookTechniques.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
              {st.hookTechniques.slice(0, 6).map((x) => (
                <li key={x.label}>
                  gancho: {x.label} {x.count > 1 && `(×${x.count})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {parts.length > 0 && (
        <div>
          <H3>Esqueleto típico (onde cada parte termina)</H3>
          <div className="flex h-3 overflow-hidden rounded bg-zinc-800">
            {parts.map((p, i) => {
              const prev = i ? (parts[i - 1].endPct.value ?? 0) : 0;
              return (
                <div
                  key={p.part}
                  title={`${PART_LABEL[p.part]} até ${p.endPct.value}%`}
                  className={["bg-red-500", "bg-amber-500", "bg-sky-600", "bg-fuchsia-500", "bg-emerald-500"][i]}
                  style={{ width: `${Math.max(1, (p.endPct.value ?? 0) - prev)}%` }}
                />
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {parts.map((p) => `${PART_LABEL[p.part]} até ${p.endPct.value}%`).join(" · ")} da duração ({parts[0].endPct.n}{" "}
            {parts[0].endPct.n === 1 ? "estudo com esqueleto" : "estudos com esqueleto"})
          </p>
        </div>
      )}
      </Collapsible>
    </div>
  );
}

function Refs({ ids, studyIds, titles, total }: { ids: number[]; studyIds: string[]; titles: Map<string, { title: string; channel: string }>; total: number }) {
  if (!ids.length) return null;
  const channels = new Set(ids.map((i) => titles.get(studyIds[i - 1] ?? "")?.channel).filter(Boolean));
  const strong = total >= 3 && ids.length >= Math.max(2, Math.ceil(total / 2));
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${strong ? "bg-emerald-600/30 text-emerald-200" : ids.length === 1 ? "bg-zinc-800 text-zinc-400" : "bg-sky-700/30 text-sky-200"}`}>
        {ids.length === 1 ? "visto em 1 estudo" : `visto em ${ids.length} de ${total}`}
      </span>
      {ids.length > 1 && channels.size === 1 && (
        <span className="rounded bg-amber-600/20 px-1.5 py-0.5 text-[10px] text-amber-200" title="Pode ser o estilo desse canal, não do nicho">
          todos do mesmo canal
        </span>
      )}
      {ids.map((i) => {
        const vid = studyIds[i - 1];
        return vid ? (
          <Link key={i} href={`/video/${vid}`} title={titles.get(vid) ? `${titles.get(vid)!.title} · ${titles.get(vid)!.channel}` : ""} className="text-[10px] text-zinc-500 hover:text-red-400">
            #{i}
          </Link>
        ) : null;
      })}
    </span>
  );
}

function Item({ head, children }: { head: React.ReactNode; children?: React.ReactNode }) {
  if (!children) return <li className="rounded-lg border border-line px-3 py-2">{head}</li>;
  return (
    <li className="rounded-lg border border-line">
      <details className="group">
        <summary className="flex items-start gap-2 px-3 py-2 hover:bg-raised">
          <span className="mt-1">
            <Chevron />
          </span>
          <span className="min-w-0 flex-1">{head}</span>
        </summary>
        <div className="space-y-1 px-3 pt-1 pb-3 pl-8">{children}</div>
      </details>
    </li>
  );
}

function PlaybookView({ c, studyIds, titles, total }: { c: PlaybookContent; studyIds: string[]; titles: Map<string, { title: string; channel: string }>; total: number }) {
  const R = (ids: number[]) => <Refs ids={ids} studyIds={studyIds} titles={titles} total={total} />;
  const box = "rounded-lg border border-line p-4";
  return (
    <div className="space-y-4 text-sm">
      <ClampText lines={4} className="text-[15px] leading-relaxed text-zinc-200">
        {c.resumo}
      </ClampText>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <H3>Ganchos ({c.ganchos.length})</H3>
          <ul className="space-y-1.5">
            {c.ganchos.map((g, i) => (
              <Item
                key={i}
                head={
                  <span className="font-medium text-zinc-100">
                    {g.padrao}
                    {R(g.estudos)}
                  </span>
                }
              >
                <p className="text-zinc-300">{g.comoFazer}</p>
                {g.exemplos.map((e, j) => (
                  <blockquote key={j} className="border-l-2 border-red-500/70 pl-2 text-zinc-400 italic">
                    {e}
                  </blockquote>
                ))}
              </Item>
            ))}
          </ul>
        </div>
        <div>
          <H3>Fórmulas de título ({c.formulasDeTitulo.length})</H3>
          <ul className="space-y-1.5">
            {c.formulasDeTitulo.map((f, i) => (
              <Item
                key={i}
                head={
                  <span>
                    <span className="font-mono text-xs leading-relaxed text-amber-200">{f.formula}</span>
                    {R(f.estudos)}
                  </span>
                }
              >
                <p className="text-zinc-300">{f.porqueFunciona}</p>
                {f.exemplos.length > 0 && <p className="text-xs text-zinc-500">Ex.: {f.exemplos.join(" · ")}</p>}
              </Item>
            ))}
          </ul>
        </div>
      </div>

      {c.checklist.length > 0 && (
        <Collapsible title={`Checklist antes de gravar (${c.checklist.length})`} className={box}>
          <ul className="space-y-1 text-zinc-200">
            {c.checklist.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-500">☐</span>
                {x}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <Collapsible title="Estrutura, ritmo e fecho" meta={`${c.estrutura.partes.length} partes`} className={box}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <H3>Estrutura</H3>
            <p className="mb-2 text-zinc-300">{c.estrutura.resumo}</p>
            <ol className="space-y-1">
              {c.estrutura.partes.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 text-zinc-500">
                    {p.parte} <span className="text-xs">({p.quando})</span>
                  </span>
                  <span className="text-zinc-200">{p.oQueFazer}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <div>
              <H3>Ritmo</H3>
              <p className="text-zinc-300">{c.ritmo.resumo}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-200">
                {c.ritmo.regras.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <H3>Fecho</H3>
              <p className="text-zinc-300">{c.fecho.resumo}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-200">
                {c.fecho.regras.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Collapsible>

      {(c.thumbnail.length > 0 || c.temasQueFuncionam.length > 0 || c.evitar.length > 0) && (
        <Collapsible title="Thumbnail, temas que funcionam e o que evitar" className={box}>
          <div className="grid gap-4 md:grid-cols-3">
            {c.thumbnail.length > 0 && (
              <div>
                <H3>Thumbnail</H3>
                <ul className="space-y-1 text-zinc-200">
                  {c.thumbnail.map((t, i) => (
                    <li key={i}>
                      {t.padrao}
                      {R(t.estudos)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.temasQueFuncionam.length > 0 && (
              <div>
                <H3>Temas que funcionam</H3>
                <ul className="space-y-1 text-zinc-200">
                  {c.temasQueFuncionam.map((t, i) => (
                    <li key={i}>
                      {t.tema}
                      {R(t.estudos)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.evitar.length > 0 && (
              <div>
                <H3>Evitar</H3>
                <ul className="space-y-1 text-zinc-200">
                  {c.evitar.map((t, i) => (
                    <li key={i}>
                      {t.erro}
                      {R(t.estudos)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Collapsible>
      )}

      {(c.publicoPede.length > 0 || c.lacunas.length > 0) && (
        <Collapsible title="O que o público pede e o que ainda falta saber" className={box}>
          <div className="grid gap-4 md:grid-cols-2">
            {c.publicoPede.length > 0 && (
              <div>
                <H3>O público pede</H3>
                <ul className="list-disc space-y-1 pl-5 text-zinc-200">
                  {c.publicoPede.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.lacunas.length > 0 && (
              <div>
                <H3>O que ainda falta saber</H3>
                <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
                  {c.lacunas.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

export default async function PlaybookPage({ searchParams }: PageProps<"/cartilha">) {
  const sp: SP = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

  if (niches.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Cartilha do nicho" />
        <EmptyState
          title="Crie um nicho primeiro"
          action={
            <Link href="/nichos" className="btn-primary">
              Ir para Nichos e canais
            </Link>
          }
        >
          Depois estude alguns vídeos dele.
        </EmptyState>
      </div>
    );

  const niche = niches.find((n) => n.id === one(sp.niche)) ?? niches[0];
  const counts = await studyCounts(niche.id);
  const fmtParam = one(sp.format);
  const format: PlaybookFormat =
    fmtParam === "short" || fmtParam === "long" ? fmtParam : counts.long.ready > counts.short.ready ? "long" : "short";

  const [studies, versions] = await Promise.all([
    loadNicheStudies(niche.id, format),
    prisma.nichePlaybook.findMany({
      where: { nicheId: niche.id, format },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, diagnosisCount: true, costUsd: true, model: true },
    }),
  ]);
  const stats = computePlaybookStats(format, studies);
  const level = dataLevel(studies.length);
  const chosenId = one(sp.v);
  const pbMeta = versions.find((v) => v.id === chosenId) ?? versions[0];
  const playbook = pbMeta ? await prisma.nichePlaybook.findUnique({ where: { id: pbMeta.id } }) : null;
  const content = parse<PlaybookContent>(playbook?.content);
  const pbStats = parse<PlaybookStats>(playbook?.stats);
  const pbStudyIds = parse<string[]>(playbook?.studyIds) ?? [];
  const isLatest = !!playbook && playbook.id === versions[0]?.id;
  const changes = playbook && isLatest ? changedSince(studies, playbook) : null;
  const hasChanges = !!changes && changes.added + changes.updated + changes.removed > 0;
  const titleRows = pbStudyIds.length
    ? await prisma.video.findMany({ where: { id: { in: pbStudyIds } }, select: { id: true, title: true, channel: { select: { title: true } } } })
    : [];
  const titles = new Map(titleRows.map((r) => [r.id, { title: r.title, channel: r.channel.title }]));
  const pending = counts[format].pending;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { niche: niche.id, format, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/cartilha?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Cartilha do nicho (histórico)"
        subtitle="A cartilha antiga juntava todos os estudos numa coisa só. Fica guardada só para consulta: o gerador agora usa os formatos."
        help={
          <p>
            Junta os estudos do nicho (Estudos de vídeo) e o Claude resume o padrão. Shorts e vídeos longos têm cartilhas separadas. As medidas
            (duração, ritmo, título) são calculadas direto dos estudos, sem custo. As marcas &ldquo;visto em X de Y&rdquo; mostram em quantos estudos
            cada padrão apareceu; clique no #número para abrir o estudo.
          </p>
        }
      />

      <p className="rounded-lg border border-violet-800 bg-violet-950/30 p-3 text-sm text-violet-200">
        Agora cada formato tem a sua receita e o nicho tem uma regra geral (só o que é comum a todos os formatos).{" "}
        <Link href={`/formatos?niche=${niche.id}&format=${format}`} className="underline">
          Abrir Formatos do nicho
        </Link>{" "}
        ·{" "}
        <Link href={`/formatos/limpeza?niche=${niche.id}`} className="underline">
          Apagar a cartilha antiga e as ideias sem formato (com cópia de segurança antes)
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {niches.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-zinc-500">Nicho</span>
            {niches.map((n) => (
              <Chip key={n.id} href={`/cartilha?niche=${n.id}`} active={n.id === niche.id}>
                {n.name}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Formato</span>
          <Chip href={href({ format: "short", v: undefined })} active={format === "short"}>
            Shorts <span className="text-zinc-500">{counts.short.ready}</span>
          </Chip>
          <Chip href={href({ format: "long", v: undefined })} active={format === "long"}>
            Vídeos longos <span className="text-zinc-500">{counts.long.ready}</span>
          </Chip>
        </div>
      </div>

      {/* Cartilha */}
      <section className="card space-y-4 p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Cartilha de {formatLabel(format, true)}</h2>
          {playbook && (
            <span className="text-xs text-zinc-500">
              {modelLabel(playbook.model)} · {fmtDateTime(playbook.createdAt)} · {playbook.diagnosisCount}{" "}
              {playbook.diagnosisCount === 1 ? "estudo" : "estudos"} · custou {usd(playbook.costUsd)}
            </span>
          )}
        </header>

        {playbook && !isLatest && (
          <p className="text-sm text-zinc-400">
            Você está vendo uma versão antiga.{" "}
            <Link href={href({ v: undefined })} className="text-red-400 hover:underline">
              Ver a mais recente
            </Link>
          </p>
        )}
        {hasChanges && changes && (
          <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            Mudou desde esta cartilha (que não é mais gerada):
            {changes.added > 0 && ` ${changes.added} ${changes.added === 1 ? "estudo novo" : "estudos novos"}`}
            {changes.updated > 0 && `${changes.added ? "," : ""} ${changes.updated} ${changes.updated === 1 ? "refeito" : "refeitos"}`}
            {changes.removed > 0 && `${changes.added + changes.updated ? "," : ""} ${changes.removed} fora da base`}. Os vídeos novos entram nos formatos.
          </p>
        )}

        {content && pbStats ? (
          <>
            <PlaybookView c={content} studyIds={pbStudyIds} titles={titles} total={playbook!.diagnosisCount} />
            {playbook?.markdown && (
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar (Markdown)</summary>
                <textarea readOnly rows={16} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={playbook.markdown} />
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">
            Nenhuma cartilha antiga para esse tipo de vídeo.
          </p>
        )}

        {versions.length > 1 && (
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Versões anteriores ({versions.length - 1})</summary>
            <ul className="divide-y divide-line text-sm">
              {versions.map((v, i) => (
                <li key={v.id}>
                  <Link href={href({ v: i === 0 ? undefined : v.id })} className={`flex justify-between px-3 py-2 hover:bg-raised ${v.id === playbook?.id ? "text-white" : "text-zinc-400"}`}>
                    <span>
                      {fmtDateTime(v.createdAt)} · {v.diagnosisCount} {v.diagnosisCount === 1 ? "estudo" : "estudos"}
                      {i === 0 && " · mais recente"}
                    </span>
                    <span className="text-xs text-zinc-500">{usd(v.costUsd)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Base de estudos */}
      <section className="card space-y-3 p-5">
        <Collapsible
          title={
            <span className="text-base">
              Base: {studies.length} {studies.length === 1 ? "estudo" : "estudos"} de {formatLabel(format, true)}
            </span>
          }
          meta={<span className={`badge ${LEVEL_STYLE[level.key]}`}>confiança {level.label}</span>}
          open={studies.length === 0}
          bodyClassName="mt-3 space-y-3"
        >
        <p className="text-sm text-zinc-400">{level.hint}</p>
        {pending > 0 && (
          <p className="text-sm text-amber-300">
            {pending} {pending === 1 ? "vídeo tem" : "vídeos têm"} transcrição mas ainda não tem diagnóstico — só entram na cartilha depois do diagnóstico.
          </p>
        )}
        {studies.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Como começar: no{" "}
            <Link href="/radar" className="text-red-400 hover:underline">
              radar
            </Link>
            , clique em “Estudar” num {formatLabel(format)} que estourou e gere o diagnóstico. Vídeo estudado por link (fora do radar)? Na página
            dele, escolha o nicho em “Entra na cartilha de”.
          </p>
        ) : (
          <ol className="divide-y divide-line rounded-lg border border-line">
              {studies.map((st, i) => (
                <li key={st.id}>
                  <Link href={`/video/${st.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-raised">
                    <span className="w-6 shrink-0 text-xs text-zinc-500">#{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={st.thumbnailUrl ?? `https://i.ytimg.com/vi/${st.externalId}/mqdefault.jpg`} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{st.title}</div>
                      <div className="text-xs text-zinc-500">
                        {st.channelTitle} · {fmtCompact(st.viewCount)} views
                        {st.metrics?.channel?.multAvg != null && ` · ${fmtMult(st.metrics.channel.multAvg)} a média do canal`}
                        {!st.hasTranscript && " · sem transcrição"}
                        {!st.content && " · importado (só texto)"}
                        {st.comments && " · com comentários"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
        )}
        </Collapsible>
      </section>

      {/* Medidas */}
      {studies.length > 0 && (
        <section className="card space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Medidas dos estudos</h2>
            <span className="text-xs text-zinc-500">calculadas sem custo · mediana de todos</span>
          </div>
          <StatsPanel st={stats} />
        </section>
      )}
    </div>
  );
}
