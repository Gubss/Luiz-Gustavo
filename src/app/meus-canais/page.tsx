import Link from "next/link";
import { prisma } from "@/lib/db";
import { CHANNEL_STATUS as STATUS_LABEL, profileGaps } from "@/lib/generator";
import { createMyChannel } from "./actions";

export default async function MyChannelsPage() {
  const [channels, niches] = await Promise.all([
    prisma.myChannel.findMany({
      orderBy: { createdAt: "asc" },
      include: { niche: { select: { name: true } }, _count: { select: { scripts: true, ideas: true } } },
    }),
    prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Meus canais</h1>
        <p className="text-sm text-zinc-400">
          O perfil de cada canal (personagens, formatos de história, tom e roteiros já publicados) é o que o gerador usa para adaptar a cartilha
          ao seu jeito de contar.
        </p>
      </header>

      <div className="card divide-y divide-line">
        {channels.length === 0 && <p className="px-5 py-4 text-sm text-zinc-400">Nenhum canal seu cadastrado ainda.</p>}
        {channels.map((c) => {
          const gaps = profileGaps(c, c._count.scripts);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link href={`/meus-canais/${c.id}`} className="font-medium hover:text-red-400">
                  {c.name}
                </Link>
                <div className="text-xs text-zinc-500">
                  {c.niche?.name ?? "sem nicho"} · {c.format === "long" ? "vídeos longos" : "Shorts"} · {STATUS_LABEL[c.status] ?? c.status} ·{" "}
                  {c._count.scripts} {c._count.scripts === 1 ? "roteiro" : "roteiros"} · {c._count.ideas} {c._count.ideas === 1 ? "ideia" : "ideias"}
                </div>
                {gaps.length > 0 && <div className="mt-1 text-xs text-amber-300">Perfil incompleto: falta {gaps.join(", ")}.</div>}
              </div>
              <Link href={`/meus-canais/${c.id}`} className="btn-secondary">
                Perfil
              </Link>
              <Link href={`/meus-videos?canal=${c.id}`} className="btn-secondary">
                Meus vídeos
              </Link>
              <Link href={`/meus-canais/${c.id}/diagnostico`} className="btn-secondary">
                Diagnóstico do canal
              </Link>
              <Link href={`/gerador?canal=${c.id}`} className="btn-primary">
                Gerar ideias
              </Link>
            </div>
          );
        })}
      </div>

      <form action={createMyChannel} className="card grid gap-3 p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Novo canal meu</h2>
        <div>
          <label className="label">Nome</label>
          <input name="name" required className="input" placeholder="Ex.: Família do Theo" />
        </div>
        <div>
          <label className="label">URL (opcional)</label>
          <input name="url" className="input" placeholder="https://www.youtube.com/@meucanal" />
        </div>
        <div>
          <label className="label">Nicho (de onde vem a cartilha)</label>
          <select name="nicheId" className="input" defaultValue={niches[0]?.id ?? ""}>
            <option value="">— sem nicho —</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Formato principal</label>
          <select name="format" className="input" defaultValue="short">
            <option value="short">Shorts</option>
            <option value="long">Vídeos longos</option>
          </select>
        </div>
        <button className="btn-primary self-start">Criar e preencher o perfil</button>
      </form>
    </div>
  );
}
