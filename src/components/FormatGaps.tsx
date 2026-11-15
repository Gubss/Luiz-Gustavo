import Link from "next/link";
import { MIN_FORMAT_VIDEOS } from "@/lib/formats";
import type { GapHint } from "@/lib/classify";
import { ActionButton } from "@/app/video/[id]/forms";
import { findGapsAction } from "@/app/formatos/actions";

/** Formato rascunho (menos de 3 vídeos): que tipo de vídeo falta e candidatos no Radar de outliers. */
export function FormatGaps({ formatId, videos, gaps }: { formatId: string; videos: number; gaps: GapHint | null }) {
  return (
    <div className="space-y-2 rounded-md bg-amber-950/20 p-3 text-sm">
      <p className="text-amber-200">Faltam {MIN_FORMAT_VIDEOS - videos} vídeo(s) para sair do rascunho.</p>
      {gaps ? (
        <>
          <p className="text-zinc-200">
            <span className="text-zinc-400">Que tipo falta:</span> {gaps.faltam}
          </p>
          <p className="text-xs text-zinc-400">
            Procurar por: {gaps.palavrasChave.join(" · ")} ·{" "}
            <Link href={gaps.radarHref} className="text-red-400 hover:underline">
              abrir o Radar de outliers
            </Link>{" "}
            ·{" "}
            <Link href="/descobrir" className="text-red-400 hover:underline">
              Descobrir canais
            </Link>
          </p>
          {gaps.candidatos.length > 0 ? (
            <ul className="space-y-1">
              {gaps.candidatos.map((c) => (
                <li key={c.videoId}>
                  <Link href={`/video/${c.videoId}`} className="text-zinc-100 hover:underline">
                    {c.title}
                  </Link>{" "}
                  <span className="text-xs text-zinc-500">
                    {c.channel} · {c.mult} a média
                  </span>
                  <p className="text-xs text-zinc-400">{c.motivo} Abra e aperte “Estudar este vídeo”: o formato é sugerido no fim.</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-400">Nenhum outlier já coletado parece seguir este motor. Procure canais novos com as palavras acima.</p>
          )}
        </>
      ) : (
        <p className="text-xs text-zinc-400">A lista do que falta sai junto com a receita (ou aperte o botão).</p>
      )}
      <ActionButton action={findGapsAction.bind(null, formatId)} label={gaps ? "Refazer a lista do que falta" : "Ver o que falta"} busy="Começando…" className="btn-ghost" hint="Sonnet · ≈ US$ 0,01" />
    </div>
  );
}
