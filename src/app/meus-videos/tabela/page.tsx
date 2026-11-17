import Link from "next/link";
import { prisma } from "@/lib/db";
import { FilterChip, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { buildRows } from "@/lib/my-table";
import { VideoTable } from "./VideoTable";

export const dynamic = "force-dynamic";

export default async function MyVideosTablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const canal = Array.isArray(sp.canal) ? sp.canal[0] : sp.canal;
  const channels = await prisma.myChannel.findMany({ orderBy: { createdAt: "asc" } });
  if (!channels.length)
    return (
      <p className="text-zinc-400">
        Nenhum canal ainda.{" "}
        <Link href="/meus-videos" className="text-red-400 hover:underline">
          Voltar
        </Link>
      </p>
    );
  const c = channels.find((x) => x.id === canal) ?? channels[0];
  const videos = await prisma.myVideo.findMany({
    where: { myChannelId: c.id },
    orderBy: { publishedAt: "desc" },
    include: { checkpoints: true, diagnoses: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } } },
  });
  const rows = buildRows(videos);
  const hasBoth = videos.some((v) => v.isShort) && videos.some((v) => !v.isShort);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader title="Tabela completa" subtitle={`${c.name} · todos os vídeos e todos os números que o Radar já guardou, lado a lado.`} />
      <AutoRefresh everySec={120} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/meus-videos?canal=${c.id}`} className="text-sm text-red-400 hover:underline">
          ← Meus vídeos
        </Link>
        {channels.length > 1 &&
          channels.map((x) => (
            <FilterChip key={x.id} href={`/meus-videos/tabela?canal=${x.id}`} active={x.id === c.id}>
              {x.name}
            </FilterChip>
          ))}
      </div>
      {rows.length ? <VideoTable rows={rows} hasBoth={hasBoth} /> : <p className="text-sm text-zinc-500">Nenhum vídeo lido ainda.</p>}
    </div>
  );
}
