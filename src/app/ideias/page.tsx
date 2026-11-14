import Link from "next/link";
import { prisma } from "@/lib/db";
import { IDEA_STATUS } from "@/lib/idea-status";
import { IdeaCard } from "@/components/IdeaCard";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-red-500 bg-red-600/20 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function IdeasPage({ searchParams }: PageProps<"/ideias">) {
  const sp: SP = await searchParams;
  const canal = one(sp.canal);
  const status = one(sp.status);
  const [channels, ideas, counts] = await Promise.all([
    prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.idea.findMany({
      where: {
        ...(canal ? { myChannelId: canal } : {}),
        ...(status ? { status } : { status: { not: "DISCARDED" } }),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.idea.groupBy({ by: ["status"], where: canal ? { myChannelId: canal } : {}, _count: true }),
  ]);
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ canal, status, ...patch })) if (v) p.set(k, v);
    return `/ideias${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Banco de ideias</h1>
          <p className="text-sm text-zinc-400">Todas as ideias e roteiros gerados. Mude o status conforme for produzindo.</p>
        </div>
        <Link href={canal ? `/gerador?canal=${canal}` : "/gerador"} className="btn-primary">
          Gerar mais ideias
        </Link>
      </header>

      {channels.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Canal:</span>
          <Chip href={href({ canal: undefined })} active={!canal}>
            todos
          </Chip>
          {channels.map((c) => (
            <Chip key={c.id} href={href({ canal: c.id })} active={canal === c.id}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Status:</span>
        <Chip href={href({ status: undefined })} active={!status}>
          ativas
        </Chip>
        {Object.entries(IDEA_STATUS).map(([k, l]) => (
          <Chip key={k} href={href({ status: k })} active={status === k}>
            {l} ({countOf(k)})
          </Chip>
        ))}
      </div>

      {ideas.length === 0 ? (
        <div className="card p-10 text-center text-zinc-400">
          Nenhuma ideia aqui. Use o{" "}
          <Link href="/gerador" className="text-red-400 hover:underline">
            Gerador
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} channelName={channels.length > 1 && i.myChannelId ? names.get(i.myChannelId) : null} />
          ))}
        </div>
      )}
    </div>
  );
}
