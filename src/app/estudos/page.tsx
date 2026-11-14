import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime } from "@/lib/format";
import { claudeSpendThisMonth, usdToBrl } from "@/lib/claude";
import { studyByLinkAction } from "@/app/video/actions";
import { StudyLinkForm } from "@/app/video/[id]/forms";

export default async function StudiesPage() {
  const [videos, spend] = await Promise.all([
    prisma.video.findMany({
      where: { OR: [{ transcript: { isNot: null } }, { diagnosis: { isNot: null } }] },
      include: {
        channel: { select: { title: true } },
        transcript: { select: { source: true, wordCount: true, updatedAt: true } },
        diagnosis: { select: { diagnosedAt: true, commentsAnalyzedAt: true, source: true, updatedAt: true, costUsd: true, commentsCostUsd: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    claudeSpendThisMonth(),
  ]);
  const last = (v: (typeof videos)[number]) =>
    Math.max(v.transcript?.updatedAt.getTime() ?? 0, v.diagnosis?.updatedAt.getTime() ?? 0);
  videos.sort((a, b) => last(b) - last(a));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Estudos de vídeo</h1>
          <p className="text-sm text-zinc-400">
            Transcrição, diagnóstico e comentários. Abra um vídeo pelo botão “Estudar” no radar ou nos favoritos, ou cole um link abaixo.
          </p>
        </div>
        <div className="text-right text-sm text-zinc-400">
          Gasto com o Claude este mês:{" "}
          <span className="font-semibold text-zinc-100">
            US$ {spend.usd.toFixed(2).replace(".", ",")} (≈ R$ {(spend.usd * usdToBrl()).toFixed(2).replace(".", ",")})
          </span>
          <div className="text-xs text-zinc-500">{spend.calls} chamadas</div>
        </div>
      </header>

      <div className="card p-4">
        <StudyLinkForm action={studyByLinkAction} />
      </div>

      {videos.length === 0 ? (
        <div className="card p-10 text-center text-zinc-400">
          Nenhum vídeo estudado ainda. Vá ao <Link href="/radar" className="text-red-400 hover:underline">radar</Link> e clique em “Estudar” num outlier.
        </div>
      ) : (
        <div className="card divide-y divide-zinc-800">
          {videos.map((v) => (
            <Link key={v.id} href={`/video/${v.id}`} className="flex items-center gap-4 p-3 hover:bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/mqdefault.jpg`} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{v.title}</div>
                <div className="text-xs text-zinc-500">
                  {v.channel.title} · {fmtCompact(v.viewCount)} views · {v.isShort ? "Short" : "longo"} · {fmtDateTime(new Date(last(v)))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1 text-[11px]">
                {v.transcript && <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">transcrição{v.transcript.source === "import" ? " (importada)" : ""}</span>}
                {(v.diagnosis?.diagnosedAt || v.diagnosis?.source === "import") && <span className="rounded bg-red-600/30 px-2 py-0.5 text-red-200">diagnóstico</span>}
                {v.diagnosis?.commentsAnalyzedAt && <span className="rounded bg-sky-700/30 px-2 py-0.5 text-sky-200">comentários</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
