import Link from "next/link";
import { FilterChip, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime } from "@/lib/format";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import { dataLevel, formatLabel, loadNicheStudies, type PlaybookFormat } from "@/lib/playbook";
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
  const nicheId = nicheParam === "none" ? null : (niches.find((n) => n.id === nicheParam)?.id ?? channel.nicheId);
  const fmtParam = one(sp.format);
  const format: PlaybookFormat = fmtParam === "short" || fmtParam === "long" ? fmtParam : channel.format === "long" ? "long" : "short";
  const count = [3, 5, 8].includes(Number(one(sp.n))) ? Number(one(sp.n)) : 5;
  const refId = one(sp.ref) || null;

  const [ctx, studies, recent] = await Promise.all([
    loadContext({ myChannelId: channel.id, nicheId, format, referenceId: refId }),
    nicheId ? loadNicheStudies(nicheId, format) : Promise.resolve([]),
    prisma.idea.findMany({
      where: { myChannelId: channel.id, status: { in: ["IDEA", "SCRIPT"] } },
      include: { publishedVideo: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const req = { myChannelId: channel.id, nicheId, format, referenceId: ctx.reference?.id ?? null, count };
  const est = await estimateIdeas(req);
  const [repeats, ownCount] = await Promise.all([repeatsForIdeas(recent), prisma.myChannelVideo.count({ where: { myChannelId: channel.id } })]);
  const ideasJob = (await runningJobsFor([channel.id])).find((j) => j.kind === "ideas");
  const gaps = profileGaps(channel, channel._count.scripts);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      canal: channel.id,
      niche: nicheParam,
      format,
      n: String(count),
      ref: ctx.reference?.id,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/gerador?${p}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Gerador de ideias"
        subtitle="Ideias e roteiros no formato do seu canal, usando o que funciona na cartilha."
        help={
          <p>
            Pega o <b>como</b> da cartilha (gancho, fórmula de título, ritmo, virada, fecho) e conta a história no <b>formato do seu canal</b>, com os
            seus personagens. Os vídeos estudados podem ser de outro estilo: o gerador usa a mecânica, não o formato.
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-zinc-500">Cartilha de:</span>
          {niches.map((n) => (
            <Chip key={n.id} href={href({ niche: n.id, ref: undefined })} active={n.id === nicheId}>
              {n.name}
              {n.id === channel.nicheId && <span className="text-xs text-zinc-500"> (do canal)</span>}
            </Chip>
          ))}
          <Chip href={href({ niche: "none", ref: undefined })} active={nicheId === null}>
            nenhuma
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-sm text-zinc-500">Formato:</span>
          <Chip href={href({ format: "short", ref: undefined })} active={format === "short"}>
            Shorts
          </Chip>
          <Chip href={href({ format: "long", ref: undefined })} active={format === "long"}>
            Vídeos longos
          </Chip>
        </div>
      </div>

      {/* O que entra no pedido */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Perfil do canal</div>
          <div className="font-medium">{channel.name}</div>
          <div className="text-zinc-400">
            {channel._count.scripts} {channel._count.scripts === 1 ? "roteiro publicado" : "roteiros publicados"} cadastrados
          </div>
          {gaps.length ? <div className="text-amber-300">Falta: {gaps.join(", ")}.</div> : <div className="text-emerald-300">Perfil completo.</div>}
          {ownCount ? (
            <div className="text-zinc-400">{ownCount} vídeos publicados lidos do YouTube: o gerador não repete esses temas.</div>
          ) : (
            <div className="text-amber-300">Leia os vídeos do seu canal no perfil para o gerador não repetir temas que você já fez.</div>
          )}
          <div className={ctx.learnings ? "text-emerald-300" : "text-zinc-500"}>
            {ctx.learnings
              ? `${ctx.learnings} ${ctx.learnings === 1 ? "lição" : "lições"} dos seus vídeos publicados entram no pedido.`
              : "Ainda sem lições dos seus vídeos (faça um diagnóstico em Meus vídeos)."}
          </div>
          <Link href={`/meus-canais/${channel.id}`} className="text-xs text-red-400 hover:underline">
            Editar perfil
          </Link>
          <Link href={`/meus-videos?canal=${channel.id}`} className="ml-3 text-xs text-red-400 hover:underline">
            Meus vídeos
          </Link>
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Cartilha ({formatLabel(format, true)})</div>
          {ctx.playbook ? (
            <>
              <div className="font-medium">{ctx.nicheName}</div>
              <div className="text-zinc-400">
                {ctx.playbook.diagnosisCount} {ctx.playbook.diagnosisCount === 1 ? "estudo" : "estudos"} · confiança{" "}
                {dataLevel(ctx.playbook.diagnosisCount).label} · {fmtDateTime(ctx.playbook.createdAt)}
              </div>
              {ctx.playbook.diagnosisCount <= 2 && <div className="text-amber-300">Base pequena: o gerador segue mais o seu perfil.</div>}
            </>
          ) : ctx.fallbackStudies ? (
            <div className="text-amber-300">
              Ainda sem cartilha nesse formato. Vou usar {ctx.fallbackStudies} {ctx.fallbackStudies === 1 ? "estudo" : "estudos"} direto.
            </div>
          ) : nicheId ? (
            <div className="text-amber-300">Sem cartilha nem estudos nesse formato. O gerador usa só o perfil do canal.</div>
          ) : (
            <div className="text-zinc-400">Nenhuma cartilha escolhida: usa só o perfil do canal.</div>
          )}
          {nicheId && (
            <Link href={`/cartilha?niche=${nicheId}&format=${format}`} className="text-xs text-red-400 hover:underline">
              Abrir cartilha
            </Link>
          )}
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <div className="text-xs text-zinc-500">Vídeo de referência (opcional)</div>
          {ctx.reference ? (
            <>
              <div className="font-medium">{ctx.reference.title}</div>
              <div className="text-zinc-400">{ctx.reference.channelTitle}</div>
              <Link href={href({ ref: undefined })} className="text-xs text-red-400 hover:underline">
                Tirar referência
              </Link>
            </>
          ) : (
            <div className="text-zinc-400">Nenhum. Escolha abaixo para adaptar um vídeo específico ao seu canal.</div>
          )}
        </div>
      </section>

      {studies.length > 0 && (
        <details className="card" open={!ctx.reference && studies.length <= 6}>
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-300">
            Adaptar um vídeo estudado ({studies.length} {formatLabel(format, studies.length !== 1)} no nicho)
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {studies.map((st) => (
              <li key={st.id}>
                <Link
                  href={href({ ref: st.id === ctx.reference?.id ? undefined : st.id })}
                  className={`flex items-center gap-3 px-4 py-2 hover:bg-raised ${st.id === ctx.reference?.id ? "bg-red-950/30" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={st.thumbnailUrl ?? `https://i.ytimg.com/vi/${st.externalId}/mqdefault.jpg`} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{st.title}</div>
                    <div className="text-xs text-zinc-500">
                      {st.channelTitle} · {fmtCompact(st.viewCount)} views
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400">{st.id === ctx.reference?.id ? "✓ referência" : "usar como referência"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Pedido */}
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Sugerir ideias</h2>
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
        {!ideasJob && (
        <StateForm
          action={generateIdeasAction.bind(null, req)}
          label={`Sugerir ${count} ideias`}
          busy="Começando…"
          hint={`${estimateHint(est)} · roda em segundo plano (até 2 min)`}
        >
          <div>
            <label className="label">Ponto de partida (opcional)</label>
            <textarea
              name="ponto"
              rows={2}
              className="input"
              placeholder="Ex.: mitos sobre dinossauros · algo sobre o espaço · uma ideia de cena · deixe vazio para o gerador escolher pela cartilha"
            />
          </div>
        </StateForm>
        )}
        <p className="text-xs text-zinc-500">
          Cada ideia vem com a cena no formato do canal, o gancho falado pelo personagem, 3 a 5 títulos com a fórmula usada e o que veio da
          cartilha × o que é do seu canal. Depois, abra a ideia para escrever o roteiro completo (outro custo, mostrado no botão).
        </p>
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
