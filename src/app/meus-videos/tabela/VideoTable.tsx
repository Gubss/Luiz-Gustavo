"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COLUMNS, columnExtremes, sortRows, type Column, type TableRow } from "@/lib/my-table-columns";

const nf = new Intl.NumberFormat("pt-BR");
const dt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function age(h: number | null) {
  if (h == null) return "";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)} dias`;
}

function show(c: Column, v: number) {
  switch (c.kind) {
    case "pct":
      return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: c.key === "engagement" ? 1 : 0 })}%`;
    case "time":
      return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
    case "ratio":
      return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}x`;
    default:
      return nf.format(Math.round(v));
  }
}

// mesmas cores do VerdictBadge (../ui), copiadas aqui porque aquele arquivo puxa código do servidor
const VERDICT: Record<string, string> = {
  "acima do normal": "border-emerald-700 bg-emerald-950/50 text-emerald-300",
  "no normal": "border-zinc-700 bg-zinc-800/60 text-zinc-300",
  "abaixo do normal": "border-red-800 bg-red-950/50 text-red-300",
  "cedo demais": "border-amber-700 bg-amber-950/40 text-amber-300",
};
const VerdictBadge = ({ v }: { v: string }) => (
  <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${VERDICT[v] ?? VERDICT["no normal"]}`}>{v}</span>
);

type Filter = "todos" | "shorts" | "longos";

export function VideoTable({ rows, hasBoth }: { rows: TableRow[]; hasBoth: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(hasBoth ? "shorts" : "todos");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "published", dir: "desc" });

  const visible = useMemo(() => {
    const f = rows.filter((r) => filter === "todos" || (filter === "shorts" ? r.isShort : !r.isShort));
    return sortRows(f, sort.key, sort.dir);
  }, [rows, filter, sort]);
  const ext = useMemo(() => columnExtremes(visible), [visible]);

  const clickSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const arrow = (key: string) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  const groups: { name: string; span: number }[] = [];
  for (const c of COLUMNS) {
    const g = groups.at(-1);
    if (g?.name === c.group) g.span++;
    else groups.push({ name: c.group, span: 1 });
  }
  const firstOfGroup = new Set(COLUMNS.filter((c, i) => i === 0 || COLUMNS[i - 1].group !== c.group).map((c) => c.key));

  const th = "bg-zinc-950 px-2 font-normal";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(hasBoth ? (["shorts", "longos", "todos"] as Filter[]) : (["todos"] as Filter[])).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 ${filter === f ? "border-red-700 bg-red-950/50 text-red-200" : "border-line text-zinc-400 hover:text-zinc-200"}`}
          >
            {f === "shorts" ? "Shorts" : f === "longos" ? "Longos" : "Todos"}
          </button>
        ))}
        <span className="text-xs text-zinc-500">
          {visible.length} vídeo{visible.length === 1 ? "" : "s"} · clique no título da coluna para ordenar · clique na linha para ver os insights
        </span>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-line">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <thead className="text-xs text-zinc-400">
            <tr>
              <th rowSpan={2} className={`${th} sticky left-0 top-0 z-30 border-b border-r border-line text-left align-bottom`}>
                <button onClick={() => clickSort("published")} className="py-2 text-left hover:text-zinc-100">
                  Vídeo{arrow("published")}
                </button>
              </th>
              {groups.map((g) => (
                <th key={g.name} colSpan={g.span} className={`${th} sticky top-0 z-20 h-7 border-l border-line pt-1.5 text-center text-zinc-300`}>
                  {g.name}
                </th>
              ))}
            </tr>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={`${th} sticky top-7 z-20 border-b border-line pb-2 pt-1 text-right ${firstOfGroup.has(c.key) ? "border-l" : ""}`}
                >
                  <button onClick={() => clickSort(c.key)} className={`whitespace-nowrap hover:text-zinc-100 ${sort.key === c.key ? "text-zinc-100" : ""}`}>
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/meus-videos/${r.id}/insights`)} className="group cursor-pointer">
                <td className="sticky left-0 z-10 w-40 min-w-40 max-w-40 border-b border-r border-line bg-zinc-950 px-2 py-1.5 group-hover:bg-zinc-900 sm:w-64 sm:max-w-64">
                  <a href={`/meus-videos/${r.id}/insights`} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumb} alt="" loading="lazy" className={`shrink-0 rounded bg-zinc-800 object-cover ${r.isShort ? "h-10 w-6" : "h-7 w-12"}`} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-xs font-medium text-zinc-100">{r.title}</span>
                      <span className="block whitespace-nowrap text-[11px] text-zinc-500">
                        {r.publishedAt ? dt.format(new Date(r.publishedAt)) : "—"}
                        {r.ageHours != null ? ` · ${age(r.ageHours)}` : ""}
                      </span>
                    </span>
                  </a>
                </td>
                {COLUMNS.map((c) => {
                  const v = r.values[c.key];
                  const e = ext[c.key];
                  const tone =
                    v != null && e ? (v === e.best ? "bg-emerald-900/40 text-emerald-200" : v === e.worst ? "bg-red-950/50 text-red-200" : "text-zinc-200") : "text-zinc-200";
                  return (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap border-b border-line/60 px-2 py-1.5 text-right tabular-nums group-hover:bg-zinc-900/60 ${firstOfGroup.has(c.key) ? "border-l border-l-line" : ""} ${tone}`}
                      title={r.estimated.includes(c.key) ? "estimado pelas views por dia do Analytics" : undefined}
                    >
                      {c.kind === "verdict" ? (
                        r.verdict ? <VerdictBadge v={r.verdict} /> : <span className="text-zinc-600">—</span>
                      ) : v == null ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <>
                          {r.estimated.includes(c.key) && <span className="text-zinc-500">≈</span>}
                          {show(c, v)}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Verde = o melhor da coluna; vermelho claro = o pior (entre os vídeos mostrados). “—” = sem dado. “≈” = estimado pelas views por dia do Analytics. Duração e
        veredito não são pintados. “x o normal” = views de hoje ÷ normal do canal (mesma regra da lista).
      </p>
    </div>
  );
}
