import Link from "next/link";
import type { Idea, MyChannelVideo } from "@prisma/client";
import { DeleteIdeaButton } from "@/app/ideias/[id]/forms";
import { deleteIdeaInline } from "@/app/gerador/actions";
import { fmtCompact, fmtDate } from "@/lib/format";
import type { IdeaData } from "@/lib/generator";
import { IDEA_STATUS } from "@/lib/idea-status";
import { fmtDateTime } from "@/lib/format";
import type { OwnMatch } from "@/lib/my-catalog";
import { Collapsible } from "@/components/ui";
import { ClampText, Menu } from "@/components/ui-client";

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
  return <span className={`badge shrink-0 ${STATUS_STYLE[status] ?? STATUS_STYLE.IDEA}`}>{IDEA_STATUS[status] ?? status}</span>;
}

/** "Virou o vídeo X" (ideia ligada a um vídeo publicado do canal). */
export function PublishedNote({ v }: { v: MyChannelVideo }) {
  return (
    <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-200">
      ✓ Publicada:{" "}
      <a href={`https://www.youtube.com/watch?v=${v.externalId}`} target="_blank" rel="noreferrer" className="hover:underline">
        {v.title}
      </a>{" "}
      <span className="text-emerald-200/60">
        · {fmtDate(v.publishedAt)}
        {v.viewCount != null && ` · ${fmtCompact(v.viewCount)} views`}
      </span>
    </div>
  );
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

/** Cartão de uma ideia (gerador e banco de ideias): o essencial à vista, o resto em "Ver detalhes". */
export function IdeaCard({
  idea,
  channelName,
  repeats = [],
}: {
  idea: Idea & { publishedVideo?: MyChannelVideo | null };
  channelName?: string | null;
  repeats?: OwnMatch[];
}) {
  const d = parse<IdeaData>(idea.ideaData);
  const titles = parse<string[]>(idea.titles) ?? [];
  const title = idea.chosenTitle || titles[0] || idea.theme;
  const otherTitles = d ? d.titulos.filter((t) => t.titulo !== title) : titles.filter((t) => t !== title).map((t) => ({ titulo: t, formula: "" }));
  return (
    <article className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/ideias/${idea.id}`} className="text-[15px] leading-snug font-semibold hover:text-red-300">
            {title}
          </Link>
          <div className="mt-0.5 text-xs text-zinc-500">
            {idea.format === "long" ? "Vídeo longo" : "Short"}
            {channelName ? ` · ${channelName}` : ""} · {fmtDateTime(idea.createdAt)}
          </div>
        </div>
        <StatusBadge status={idea.status} />
      </div>
      {idea.publishedVideo && <PublishedNote v={idea.publishedVideo} />}
      {!idea.publishedVideo && repeats.length > 0 && (
        <p className="text-xs text-amber-300" title={repeats.map((m) => m.title).join("\n")}>
          ⚠ Parecida com {repeats.length} coisa{repeats.length === 1 ? "" : "s"} que seu canal já fez (veja em detalhes)
        </p>
      )}
      {d ? (
        <ClampText lines={3} className="text-sm leading-relaxed text-zinc-300">
          {d.premissa}
        </ClampText>
      ) : (
        idea.justification && (
          <ClampText lines={3} className="text-sm leading-relaxed text-zinc-300">
            {idea.justification}
          </ClampText>
        )
      )}
      {d && (
        <Collapsible title={<span className="text-xs">Ver detalhes</span>} bodyClassName="mt-3 space-y-3">
          <RepeatWarning repeats={repeats} />
          <blockquote className="border-l-2 border-red-500/70 pl-2 text-sm text-zinc-300 italic">
            {d.gancho}
            <span className="block text-xs text-zinc-500 not-italic">Gancho: {d.ganchoPadrao}</span>
          </blockquote>
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-lg bg-ink/70 p-2">
              <div className="mb-0.5 text-zinc-500">Da cartilha</div>
              <div className="text-zinc-300">{d.adaptacao.daCartilha}</div>
            </div>
            <div className="rounded-lg bg-ink/70 p-2">
              <div className="mb-0.5 text-zinc-500">Do seu canal</div>
              <div className="text-zinc-300">{d.adaptacao.doCanal}</div>
            </div>
          </div>
          {otherTitles.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-zinc-500">Outros títulos</div>
              <ul className="space-y-0.5 text-sm text-zinc-300">
                {otherTitles.map((t, i) => (
                  <li key={i}>
                    {t.titulo} {t.formula && <span className="text-xs text-zinc-500">({t.formula})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.risco && (
            <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200/90">
              <span className="font-medium">Atenção:</span> {d.risco}
            </p>
          )}
        </Collapsible>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Link href={`/ideias/${idea.id}`} className={idea.script ? "btn-secondary btn-sm" : "btn-primary btn-sm"}>
          {idea.script ? "Ver roteiro" : "Escrever roteiro"}
        </Link>
        <span className="flex-1" />
        <Menu>
          <Link href={`/ideias/${idea.id}`} className="menu-item">
            Abrir a ideia completa
          </Link>
          <DeleteIdeaButton action={deleteIdeaInline.bind(null, idea.id)} label="Apagar ideia" className="menu-item text-red-300" />
        </Menu>
      </div>
    </article>
  );
}
