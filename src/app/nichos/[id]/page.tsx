import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { channelUrl } from "@/lib/youtube";
import { fmtCompact, fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { findSimilarTitles } from "@/lib/catalog";
import {
  addChannels,
  addMyChannel,
  deleteMyChannel,
  deleteNiche,
  refreshNicheChannels,
  removeChannel,
  updateMyChannelStatus,
  updateNiche,
} from "../actions";
import { AddChannelsForm, ConfirmDelete, RefreshButton, StatusSelect } from "./forms";

const STATUS_LABEL: Record<string, string> = {
  PRODUCTION: "Em produção",
  VALIDATING: "Validando formato",
  RESEARCH: "Em pesquisa",
};

export default async function NichePage({ params, searchParams }: PageProps<"/nichos/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tema = typeof sp.tema === "string" ? sp.tema.trim() : "";
  const niche = await prisma.niche.findUnique({
    where: { id },
    include: {
      channels: {
        include: { channel: { include: { _count: { select: { catalog: true, videos: true } } } } },
        orderBy: { addedAt: "asc" },
      },
      myChannels: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!niche) notFound();
  const matches = tema ? await findSimilarTitles(tema, { nicheId: niche.id }) : [];

  const channels = niche.channels
    .map((nc) => nc.channel)
    .sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/nichos" className="hover:text-zinc-300">
          Nichos
        </Link>
        <span>/</span>
        <span className="text-zinc-300">{niche.name}</span>
      </div>

      {/* Dados do nicho */}
      <section className="card p-5">
        <form action={updateNiche.bind(null, niche.id)} className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <div>
            <label className="label">Nome</label>
            <input name="name" defaultValue={niche.name} required className="input text-base font-semibold" />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input name="description" defaultValue={niche.description ?? ""} className="input" />
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary">Salvar</button>
          </div>
        </form>
        <div className="mt-3 flex justify-end">
          <ConfirmDelete
            action={deleteNiche.bind(null, niche.id)}
            label="Excluir nicho"
            message={`Excluir o nicho "${niche.name}"? Canais que só estão nele também serão removidos.`}
          />
        </div>
      </section>

      {/* Canais monitorados */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Canais monitorados <span className="text-zinc-500">({channels.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/cartilha?niche=${niche.id}`} className="btn-secondary">
              Cartilha do nicho
            </Link>
            <Link href={`/descobrir?niche=${niche.id}`} className="btn-secondary">
              Descobrir canais parecidos
            </Link>
            {channels.length > 0 && <RefreshButton action={refreshNicheChannels.bind(null, niche.id)} />}
          </div>
        </div>

        <div className="card p-5">
          <AddChannelsForm action={addChannels.bind(null, niche.id)} />
        </div>

        {channels.length > 0 && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3 text-right">Inscritos</th>
                  <th className="px-4 py-3 text-right">Vídeos</th>
                  <th className="px-4 py-3 text-right">Views totais</th>
                  <th className="px-4 py-3 text-right" title="Vídeos com estatísticas coletadas / títulos no catálogo">Coletados / catálogo</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {channels.map((c) => (
                  <tr key={c.id} className="hover:bg-raised">
                    <td className="px-4 py-3">
                      <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="flex items-center gap-3">
                        {c.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnailUrl} alt="" className="h-9 w-9 rounded-full" />
                        )}
                        <span>
                          <span className="block font-medium hover:underline">{c.title}</span>
                          <span className="block text-xs text-zinc-500">{c.handle ?? c.externalId}</span>
                        </span>
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" title={fmtInt(c.subscriberCount)}>
                      {c.hiddenSubscribers ? <span className="text-zinc-500">oculto</span> : fmtCompact(c.subscriberCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(c.videoCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCompact(c.viewCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {c._count.videos} / {c._count.catalog}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmtDateTime(c.statsFetchedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={removeChannel.bind(null, niche.id, c.id)}>
                        <button className="btn-ghost px-2 py-1 text-xs" title="Remover do nicho">
                          Remover
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Conferir tema no catálogo */}
      <section className="space-y-3" id="tema">
        <h2 className="text-xl font-semibold">Esse tema já foi feito?</h2>
        <form action={`/nichos/${niche.id}#tema`} className="flex gap-2">
          <input
            name="tema"
            defaultValue={tema}
            className="input"
            placeholder="Ex.: o que acontece se o elevador despencar"
          />
          <button className="btn-secondary">Conferir</button>
        </form>
        <p className="text-xs text-zinc-500">
          Procura nos títulos de todos os vídeos dos canais deste nicho (catálogo completo, não só os recentes).
        </p>
        {tema && (
          <div className="card divide-y divide-line">
            {matches.length === 0 ? (
              <p className="p-4 text-sm text-emerald-400">Nenhum título parecido encontrado nos canais deste nicho.</p>
            ) : (
              matches.map((m) => (
                <a
                  key={m.externalId}
                  href={`https://www.youtube.com/watch?v=${m.externalId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-4 px-4 py-2 text-sm hover:bg-raised"
                >
                  <span className={`w-12 shrink-0 text-right font-bold tabular-nums ${m.score >= 0.75 ? "text-red-400" : "text-amber-400"}`}>
                    {Math.round(m.score * 100)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.title}</span>
                    <span className="text-xs text-zinc-500">
                      {m.channelTitle} · {fmtDate(m.publishedAt)} · em comum: {m.shared.join(", ")}
                    </span>
                  </span>
                </a>
              ))
            )}
          </div>
        )}
      </section>

      {/* Meus canais */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Meus canais neste nicho <span className="text-zinc-500">({niche.myChannels.length})</span>
        </h2>
        <div className="card divide-y divide-line">
          {niche.myChannels.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/meus-canais/${m.id}`} className="font-medium hover:text-red-400">
                  {m.name}
                </Link>
                <span className="ml-2 text-xs text-zinc-500">
                  <Link href={`/meus-canais/${m.id}`} className="hover:underline">perfil</Link> ·{" "}
                  <Link href={`/gerador?canal=${m.id}`} className="hover:underline">gerar ideias</Link>
                </span>
                {m.url && (
                  <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 hover:underline">
                    {m.url}
                  </a>
                )}
              </div>
              <StatusSelect action={updateMyChannelStatus.bind(null, niche.id, m.id)} value={m.status} />
              <form action={deleteMyChannel.bind(null, niche.id, m.id)}>
                <button className="btn-ghost px-2 py-1 text-xs">Excluir</button>
              </form>
            </div>
          ))}
          <form action={addMyChannel.bind(null, niche.id)} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <div>
              <label className="label">Nome do meu canal</label>
              <input name="name" required className="input" placeholder="Ex.: Curiosidades em 3D" />
            </div>
            <div>
              <label className="label">URL (opcional)</label>
              <input name="url" className="input" placeholder="https://www.youtube.com/@meucanal" />
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue="RESEARCH" className="input">
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-secondary">Adicionar</button>
          </form>
        </div>
      </section>
    </div>
  );
}
