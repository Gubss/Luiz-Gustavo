import Link from "next/link";
import { prisma } from "@/lib/db";
import { createNiche } from "./actions";

export default async function NichesPage() {
  const niches = await prisma.niche.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { channels: true, myChannels: true } },
      channels: { take: 6, include: { channel: { select: { thumbnailUrl: true, title: true } } } },
    },
  });
  const totalChannels = await prisma.channel.count();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nichos e canais</h1>
          <p className="text-sm text-zinc-400">
            {niches.length} nicho{niches.length === 1 ? "" : "s"} · {totalChannels} canal
            {totalChannels === 1 ? "" : "is"} monitorado{totalChannels === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {niches.map((n) => {
          return (
            <Link key={n.id} href={`/nichos/${n.id}`} className="card p-5 transition hover:border-zinc-600">
              <h2 className="text-lg font-semibold">{n.name}</h2>
              {n.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{n.description}</p>}
              <div className="mt-4 flex -space-x-2">
                {n.channels.map((c, i) =>
                  c.channel.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={c.channel.thumbnailUrl}
                      alt={c.channel.title}
                      title={c.channel.title}
                      className="h-8 w-8 rounded-full border-2 border-zinc-900"
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-zinc-400">
                <span>{n._count.channels} monitorados</span>
                <span>{n._count.myChannels} meus</span>
              </div>
            </Link>
          );
        })}

        <form action={createNiche} className="card flex flex-col gap-3 border-dashed p-5">
          <h2 className="font-semibold">Novo nicho</h2>
          <input name="name" required placeholder="Ex.: Curiosidades 3D animadas (shorts)" className="input" />
          <textarea name="description" rows={2} placeholder="Descrição (opcional)" className="input" />
          <button className="btn-primary self-start">Criar nicho</button>
        </form>
      </div>
    </div>
  );
}
