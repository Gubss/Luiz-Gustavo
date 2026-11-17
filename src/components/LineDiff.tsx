import { diffCounts, diffLines, type DiffKind, type DiffLine } from "@/lib/line-diff";

const STYLE: Record<DiffKind, { row: string; dot: string; label: string }> = {
  igual: { row: "border-emerald-700/60 bg-emerald-950/30", dot: "bg-emerald-500", label: "igual ao original" },
  alterada: { row: "border-amber-600/60 bg-amber-950/30", dot: "bg-amber-400", label: "alterada para encaixar" },
  nova: { row: "border-sky-600/60 bg-sky-950/30", dot: "bg-sky-400", label: "linha nova" },
  saiu: { row: "border-red-800/60 bg-red-950/20", dot: "bg-red-500", label: "saiu do original" },
};

function MovedTag({ at }: { at?: number }) {
  return (
    <span className="mr-2 inline-block whitespace-nowrap rounded-full border border-zinc-500 px-1.5 py-px align-middle text-[11px] text-zinc-300">
      ↕ mudou de lugar{at != null ? ` · era a fala ${at + 1}` : ""}
    </span>
  );
}

/** História × roteiro, linha a linha, com cor por linha (sem IA: semelhança de texto). */
export function LineDiff({ original, generated }: { original: DiffLine[]; generated: DiffLine[] }) {
  const rows = diffLines(original, generated);
  const c = diffCounts(rows);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300" aria-label="Legenda das cores">
        {(Object.keys(STYLE) as DiffKind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STYLE[k].dot}`} />
            {STYLE[k].label} <span className="text-zinc-500">({c[k]})</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <MovedTag /> fala do original em outra posição <span className="text-zinc-500">({c.movida})</span>
        </li>
      </ul>
      <ol className="space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={i} className={`rounded border-l-4 px-3 py-1.5 ${STYLE[r.kind].row}`} title={r.moved ? `${STYLE[r.kind].label} · mudou de lugar` : STYLE[r.kind].label}>
            {r.moved && <MovedTag at={r.originalIndex} />}
            <span className={r.kind === "saiu" ? "text-red-300 line-through decoration-red-400/70" : "text-zinc-100"}>
              {r.who && <strong className="mr-1">{r.who}:</strong>}
              {r.text}
            </span>
            {r.kind === "alterada" && r.original && (
              <div className="mt-0.5 text-xs text-zinc-400">
                original: {r.originalWho && r.originalWho !== r.who ? <strong>{r.originalWho}: </strong> : null}
                {r.original}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
