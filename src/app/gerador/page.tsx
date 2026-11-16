import Link from "next/link";
import { NO_DIRECTION } from "@/lib/direction-study";
import { Collapsible, FilterChip, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import { formatStudies, formatsOfNiche, isDraft } from "@/lib/formats";
import { estimateIdeas, loadContext, profileGaps } from "@/lib/generator";
import { StateForm } from "@/components/StateForm";
import { IdeaCard } from "@/components/IdeaCard";
import { repeatsForIdeas } from "@/lib/my-catalog";
import { generateIdeasAction } from "./actions";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (n: number) => `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`;
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
const estimateHint = (e: CostEstimate) => `${modelLabel(e.model)} · custo estimado ${usd(e.usd)} a ${usd(e.usdMax)} (≈ ${brl(e.usd)} a ${brl(e.usdMax)})`;

const Chip = FilterChip;

export default async function GeneratorPage({ searchParams }: PageProps<"/gerador">) {
  const sp: SP = await searchParams;
  const [channels, niches, s] = await Promise.all([
    prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { scripts: true } } } }),
    prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  if (channels.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Gerador</h1>
        <p className="text-zinc-400">
          Cadastre seu canal primeiro em{" "}
          <Link href="/meus-canais" className="text-red-400 hover:underline">
            Meus canais
          </Link>{" "}
          e preencha o perfil (personagens, formatos de história, roteiros já publicados).
        </p>
      </div>
    );

  const channel = channels.find((c) => c.id === one(sp.canal)) ?? channels[0];
  const nicheParam = one(sp.niche);
  const nicheId = niches.find((n) => n.id === nicheParam)?.id ?? channel.nicheId ?? niches[0]?.id ?? null;
  const fmtParam = one(sp.format);
  const format: PlaybookFormat = fmtParam === "short" || fmtParam === "long" ? fmtParam : channel.format === "long" ? "long" : "short";
  const count = [3, 5, 8].includes(Number(one(sp.n))) ? Number(one(sp.n)) : 5;
  const refId = one(sp.ref) || null;

  const formats = nicheId ? await formatsOfNiche(nicheId, format) : [];
  const formatId = formats.find((f) => f.id === one(sp.formato))?.id ?? null;

  const [ctx, studies, recent] = await Promise.all([
    formatId ? loadContext({ myChannelId: channel.id, formatId, referenceId: refId }) : Promise.resolve(null),
    formatId ? formatStudies(formatId) : Promise.resolve([]),
    prisma.idea.findMany({
      where: { myChannelId: channel.id, status: { in: ["IDEA", "SCRIPT", "RETURNED"] } },
      include: { publishedVideo: true, videoFormat: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const req = formatId ? { myChannelId: channel.id, formatId, referenceId: ctx?.reference?.id ?? null, count } : null;
  const est = req ? await estimateIdeas(req) : null;
  const [repeats, ownCount] = await Promise.all([repeatsForIdeas(recent), prisma.myChannelVideo.count({ where: { myChannelId: channel.id } })]);
  const ideasJob = (await runningJobsFor([channel.id])).find((j) => j.kind === "ideas");
  const gaps = profileGaps(channel, channel._count.scripts);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      canal: channel.id,
      niche: nicheId ?? undefined,
      format,
      formato: formatId ?? undefined,
      n: String(count),
      ref: ctx?.reference?.id,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/gerador?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Gerador de ideias"
        subtitle="3 · Escolha o canal e o formato para gerar ideias."
        help={
          <p>
            Escolha um <b>formato</b> (uma receita tirada de 3 a 8 vídeos parecidos). O roteiro segue só essa receita, aplica a <b>regra geral do
            nicho</b> (o que é comum a todos os formatos) e conta a história com os <b>seus personagens</b>, no tom dos seus roteiros aprovados.
            Nunca mistura dois formatos.
          </p>
        }
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-zinc-500">Canal:</span>
          {channels.map((c) => (
            <Chip key={c.id} href={`/gerador?canal=${c.id}`} active={c.id === channel.id}>
              {c.name}
            </Chip>
          ))}
        </div>
        {niches.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm text-zinc-500">Nicho:</span>
            {niches.map((n) => (
              <Chip key={n.id} href={href({ niche: n.id, formato: undefined, ref: undefined })} active={n.id === nicheId}>
                {n.name}
                {n.id === channel.nicheId && <span className="text-xs text-zinc-500"> (do canal)</span>}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-zinc-500">Tipo:</span>
          <Chip href={href({ format: "short", formato: undefined, ref: undefined })} active={format === "short"}>
            Shorts
          </Chip>
          <Chip href={href({ format: "long", formato: undefined, ref: undefined })} active={format === "long"}>
            Vídeos longos
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm font-medium text-zinc-300">Formato:</span>
          {formats.map((f) => (
            <Chip key={f.id} href={href({ formato: f.id, ref: undefined })} active={f.id === formatId}>
              {f.name}
              {isDraft(f._count.videos) && <span className="text-xs text-amber-300"> rascunho</span>}
            </Chip>
          ))}
          {formats.length === 0 && (
            <span className="text-sm text-amber-300">
              Nenhum formato de {formatLabel(format, true)} neste nicho.{" "}
              <Link href={nicheId ? `/formatos?niche=${nicheId}&format=${format}` : "/formatos"} className="underline">
                Crie em Formatos do nicho
              </Link>
              .
            </span>
          )}
          {formats.length > 0 && !formatId && <span className="text-sm text-amber-300">Escolha um formato</span>}
        </div>
      </div>

      {ctx && !ctx.videoFormat.directionStudy?.trim() && <p role="status" className="text-sm text-amber-300">{NO_DIRECTION}. <Link className="underline" href={`/formatos/${ctx.videoFormat.id}`}>Abrir formato</Link></p>}
      <Collapsible title="Opções avançadas e referências" className="card p-4">
      {/* O que entra no pedido */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Perfil do canal</div>
          <div className="font-medium">{channel.name}</div>
          <div className="text-zinc-400">
            {channel._count.scripts} {channel._count.scripts === 1 ? "roteiro aprovado" : "roteiros aprovados"} cadastrados
            {ctx && ` · ${ctx.voiceScripts.count} ${ctx.voiceScripts.sameFormat ? "deste formato" : "sem formato marcado"} entram como amostra de voz`}
          </div>
          {gaps.length ? <div className="text-amber-300">Falta: {gaps.join(", ")}.</div> : <div className="text-emerald-300">Perfil completo.</div>}
          {ownCount ? (
            <div className="text-zinc-400">{ownCount} vídeos publicados lidos do YouTube: o gerador não repete esses temas.</div>
          ) : (
            <div className="text-amber-300">Leia os vídeos do seu canal no perfil para o gerador não repetir temas que você já fez.</div>
          )}
          {ctx && (
            <div className={ctx.lessons ? "text-emerald-300" : "text-zinc-500"}>
              {ctx.lessons ? `${ctx.lessons} ${ctx.lessons === 1 ? "ponto de devolução" : "pontos de devolução"} do Estúdio entram (valem mais que a receita).` : "Nenhuma devolução do Estúdio ainda."}
            </div>
          )}
          {ctx && (
            <div className={ctx.learnings ? "text-emerald-300" : "text-zinc-500"}>
              {ctx.learnings
                ? `${ctx.learnings} ${ctx.learnings === 1 ? "lição" : "lições"} dos seus vídeos publicados entram no pedido.`
                : "Ainda sem lições dos seus vídeos (faça um diagnóstico em Meus vídeos)."}
            </div>
          )}
          <Link href={`/meus-canais/${channel.id}`} className="text-xs text-red-400 hover:underline">
            Editar perfil
          </Link>
          <Link href={`/meus-videos?canal=${channel.id}`} className="ml-3 text-xs text-red-400 hover:underline">
            Meus vídeos
          </Link>
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Formato ({formatLabel(format, true)})</div>
          {ctx ? (
            <>
              <div className="font-medium">{ctx.videoFormat.name}</div>
              <div className="text-zinc-400">
                {ctx.videoFormat.videos} {ctx.videoFormat.videos === 1 ? "vídeo" : "vídeos"}
                {ctx.recipe ? ` · receita v${ctx.recipe.version} de ${fmtDateTime(ctx.recipe.createdAt)}` : " · sem receita ainda"}
              </div>
              {ctx.meta.draft && <div className="text-amber-300">Rascunho (menos de 3 vídeos): o gerador segue mais os seus roteiros aprovados.</div>}
              {!ctx.recipe && ctx.fallbackStudies > 0 && (
                <div className="text-amber-300">Sem receita: vou usar {ctx.fallbackStudies} {ctx.fallbackStudies === 1 ? "estudo" : "estudos"} do formato direto.</div>
              )}
              <div className={ctx.rule ? "text-zinc-400" : "text-zinc-500"}>
                {ctx.rule ? `Regra geral do nicho v${ctx.rule.version} entra junto.` : "Sem regra geral do nicho ainda (precisa de 2 formatos prontos)."}
              </div>
              <div className={ctx.channelHow ? "text-emerald-300" : "text-amber-300"}>
                {ctx.channelHow ? "Como o seu canal faz este formato: preenchido." : "Falta escrever como o seu canal faz este formato."}
              </div>
              <Link href={`/formatos/${ctx.videoFormat.id}`} className="text-xs text-red-400 hover:underline">
                Abrir formato
              </Link>
            </>
          ) : (
            <div className="text-zinc-400">Escolha um formato acima. O roteiro segue a receita de um formato só.</div>
          )}
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Vídeo do formato para adaptar (opcional)</div>
          {ctx?.reference ? (
            <>
              <div className="font-medium">{ctx.reference.title}</div>
              <div className="text-zinc-400">{ctx.reference.channelTitle}</div>
              <Link href={href({ ref: undefined })} className="text-xs text-red-400 hover:underline">
                Tirar
              </Link>
            </>
          ) : (
            <div className="text-zinc-400">Nenhum. Serve para pegar o tema ou a história de um vídeo do formato; a estrutura continua a da receita.</div>
          )}
        </div>
      </section>

      {studies.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-300">
            Adaptar um vídeo do formato ({studies.length} {studies.length === 1 ? "vídeo" : "vídeos"} em {ctx?.videoFormat.name})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {studies.map((st) => (
              <li key={st.id}>
                <Link
                  href={href({ ref: st.id === ctx?.reference?.id ? undefined : st.id })}
                  className={`flex items-center gap-3 px-4 py-2 hover:bg-raised ${st.id === ctx?.reference?.id ? "bg-red-950/30" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={st.thumbnailUrl ?? `https://i.ytimg.com/vi/${st.externalId}/mqdefault.jpg`} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{st.title}</div>
                    <div className="text-xs text-zinc-500">
                      {st.channelTitle} · {fmtCompact(st.viewCount)} views
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400">{st.id === ctx?.reference?.id ? "✓ escolhido" : "adaptar este"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      </Collapsible>

      {/* Pedido */}
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Gerar ideias</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Quantas:</span>
          {[3, 5, 8].map((n) => (
            <Chip key={n} href={href({ n: String(n) })} active={n === count}>
              {n}
            </Chip>
          ))}
        </div>
        {!s.anthropicApiKey && (
          <p className="text-sm text-amber-300">
            Falta a chave da Anthropic: cole a chave em <Link href="/configuracoes#chaves" className="underline">Configurações</Link> (não precisa reiniciar).
          </p>
        )}
        {ideasJob && <RunningNote job={ideasJob} what="Geração de ideias" />}
        {!ideasJob && (!req || !est) && <p className="text-sm text-amber-300">Escolha um formato acima para sugerir ideias.</p>}
        {!ideasJob && req && est && (
        <StateForm
          action={generateIdeasAction.bind(null, req)}
          label={`Gerar ${count} ideias`}
          busy="Começando…"
          hint={`${estimateHint(est)} · roda em segundo plano (até 2 min)`}
        >
          <div>
            <label className="label">Ponto de partida (opcional)</label>
            <textarea
              name="ponto"
              rows={2}
              className="input"
              placeholder="Ex.: o pote de sorvete da avó. Deixe vazio para receber sugestões."
            />
          </div>
        </StateForm>
        )}

      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Ideias recentes de {channel.name}</h2>
          <Link href={`/ideias?canal=${channel.id}`} className="text-sm text-red-400 hover:underline">
            Banco de ideias →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhuma ainda.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map((i) => (
              <IdeaCard key={i.id} idea={i} repeats={repeats.get(i.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
