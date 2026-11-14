import Link from "next/link";
import type { Idea } from "@prisma/client";
import type { IdeaData } from "@/lib/generator";
import { IDEA_STATUS } from "@/lib/idea-status";
import { fmtDateTime } from "@/lib/format";
import type { OwnMatch } from "@/lib/my-catalog";

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const STATUS_STYLE: Record<string, string> = {
  IDEA: "bg-zinc-800 text-zinc-300",
  SCRIPT: "bg-sky-700/30 text-sky-200",
  PRODUCED: "bg-amber-600/30 text-amber-200",
  PUBLISHED: "bg-emerald-600/30 text-emerald-200",
  DISCARDED: "bg-zinc-900 text-zinc-500 line-through",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_STYLE[status] ?? STATUS_STYLE.IDEA}`}>{IDEA_STATUS[status] ?? status}</span>;
}

/** Aviso "seu canal já fez algo parecido" (vídeo publicado, roteiro cadastrado ou outra ideia). */
export function RepeatWarning({ repeats }: { repeats: OwnMatch[] }) {
  if (!repeats.length) return null;
  return (
    <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
      <div className="font-medium">⚠ Seu canal já fez algo parecido:</div>
      <ul className="mt-1 space-y-0.5">
        {repeats.map((m, i) => (
          <li key={i}>
            {m.url ? (
              <a href={m.url} target={m.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="underline-offset-2 hover:underline">
                {m.title}
              </a>
            ) : (
              m.title
            )}{" "}
            <span className="text-amber-200/60">
              · {m.source} · em comum: {m.shared.join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cartão de uma ideia (gerador e banco de ideias). */
export function IdeaCard({ idea, channelName, repeats = [] }: { idea: Idea; channelName?: string | null; repeats?: OwnMatch[] }) {
  const d = parse<IdeaData>(idea.ideaData);
  const titles = parse<string[]>(idea.titles) ?? [];
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/ideias/${idea.id}`} className="text-base font-semibold hover:text-red-400">
            {idea.chosenTitle || titles[0] || idea.theme}
          </Link>
          <div className="text-xs text-zinc-500">
            {idea.theme}
            {channelName ? ` · ${channelName}` : ""} · {idea.format === "long" ? "vídeo longo" : "Short"} · {fmtDateTime(idea.createdAt)}
          </div>
        </div>
        <StatusBadge status={idea.status} />
      </div>
      <RepeatWarning repeats={repeats} />
      {d ? (
        <>
          <p className="text-sm text-zinc-200">{d.premissa}</p>
          <blockquote className="border-l-2 border-red-500 pl-2 text-sm italic text-zinc-300">
            {d.gancho} <span className="not-italic text-xs text-zinc-500">· gancho: {d.ganchoPadrao}</span>
          </blockquote>
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded bg-zinc-950/60 p-2">
              <span className="text-zinc-500">Da cartilha: </span>
              <span className="text-zinc-300">{d.adaptacao.daCartilha}</span>
            </div>
            <div className="rounded bg-zinc-950/60 p-2">
              <span className="text-zinc-500">Do seu canal: </span>
              <span className="text-zinc-300">{d.adaptacao.doCanal}</span>
            </div>
          </div>
          <ul className="space-y-0.5 text-sm">
            {d.titulos.map((t, i) => (
              <li key={i} className="text-zinc-300">
                {i === 0 ? "★ " : "· "}
                {t.titulo} <span className="text-xs text-zinc-500">({t.formula})</span>
              </li>
            ))}
          </ul>
          {d.risco && <p className="text-xs text-amber-300/90">Risco: {d.risco}</p>}
        </>
      ) : (
        idea.justification && <p className="text-sm text-zinc-300">{idea.justification}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/ideias/${idea.id}`} className={idea.script ? "btn-secondary" : "btn-primary"}>
          {idea.script ? "Ver roteiro" : "Escrever roteiro →"}
        </Link>
      </div>
    </div>
  );
}
