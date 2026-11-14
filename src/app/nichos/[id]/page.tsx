import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { channelUrl } from "@/lib/youtube";
import { fmtCompact, fmtDateTime, fmtInt } from "@/lib/format";
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

export default async function NichePage({ params }: PageProps<"/nichos/[id]">) {
  const { id } = await params;
  const niche = await prisma.niche.findUnique({
    where: { id },
    include: {
      channels: { include: { channel: true }, orderBy: { addedAt: "asc" } },
      myChannels: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!niche) notFound();

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
          {channels.length > 0 && <RefreshButton action={refreshNicheChannels.bind(null, niche.id)} />}
        </div>

        <div className="card p-5">
          <AddChannelsForm action={addChannels.bind(null, niche.id)} />
        </div>

        {channels.length > 0 && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3 text-right">Inscritos</th>
                  <th className="px-4 py-3 text-right">Vídeos</th>
                  <th className="px-4 py-3 text-right">Views totais</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {channels.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-900">
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

      {/* Meus canais */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Meus canais neste nicho <span className="text-zinc-500">({niche.myChannels.length})</span>
        </h2>
        <div className="card divide-y divide-zinc-800">
          {niche.myChannels.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.name}</div>
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
