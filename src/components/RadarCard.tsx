import Link from "next/link";
import type { RadarItem } from "@/lib/radar";
import { channelUrl, videoUrl } from "@/lib/youtube";
import { fmtCompact, fmtDate, fmtInt, fmtMult } from "@/lib/format";
import { toggleFavorite } from "@/app/radar/actions";
import { Sparkline } from "./Sparkline";

function fmtDuration(sec: number | null) {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} className="min-w-0">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

export function RadarCard({ item }: { item: RadarItem }) {
  const { video: v, channel: c, metrics: m } = item;
  const url = videoUrl(v.externalId, v.isShort);
  const age = m.ageDays < 1 ? "hoje" : `há ${Math.floor(m.ageDays)} dia${m.ageDays >= 2 ? "s" : ""}`;
  return (
    <article className="card flex flex-col overflow-hidden">
      <a href={url} target="_blank" rel="noreferrer" className="group relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/hqdefault.jpg`}
          alt=""
          className={`w-full bg-zinc-800 object-cover transition group-hover:opacity-90 ${v.isShort ? "aspect-[4/5]" : "aspect-video"}`}
        />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {m.multAvg != null && m.multAvg >= 3 && (
            <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-sm font-bold shadow tabular-nums" title="Quantas vezes passou a mediana do próprio canal">
              {fmtMult(m.multAvg)}
            </span>
          )}
          {m.risingFast && <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-black shadow">Subindo rápido</span>}
          {m.smallChannelHit && <span className="rounded-md bg-emerald-400 px-1.5 py-0.5 text-[11px] font-semibold text-black shadow">Canal pequeno</span>}
        </div>
        {v.durationSec != null && (
          <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs tabular-nums">{fmtDuration(v.durationSec)}</span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="space-y-1">
          <a href={url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm leading-snug font-semibold hover:underline" title={v.title}>
            {v.title}
          </a>
          <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
            <span className="truncate">{c.title}</span>
            <span className="shrink-0 text-zinc-500">· {c.subscriberCount != null ? `${fmtCompact(c.subscriberCount)} insc.` : "insc. ocultos"}</span>
          </a>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Views" value={fmtCompact(v.viewCount)} hint={`${fmtInt(v.viewCount)} views`} />
          <Stat label="Por dia" value={fmtCompact(m.viewsPerDay)} hint={`${fmtInt(m.viewsPerDay)} views por dia · ${fmtMult(m.velocityRatio)} a velocidade normal do canal`} />
          <Stat
            label="x inscritos"
            value={fmtMult(m.multSubs)}
            hint={`Base do canal: ${fmtCompact(m.baseMedian)} (mediana dos últimos ${m.baseCount} ${v.isShort ? "Shorts" : "longos"}; média ${fmtInt(m.baseMean)}). Sobre a média aritmética: ${fmtMult(m.multMean)}`}
          />
        </div>

        <div className="flex items-end justify-between gap-2 text-xs text-zinc-500">
          <span title={`Publicado em ${fmtDate(v.publishedAt)}`}>{age}</span>
          <Sparkline points={item.history.map((h) => h.views)} />
        </div>

        <div className="mt-auto flex items-center gap-1.5">
          <Link href={`/video/${v.id}`} className="btn-secondary btn-sm flex-1">
            Estudar
          </Link>
          <form action={toggleFavorite.bind(null, v.id)}>
            <button
              className={`btn btn-sm ${item.favorite ? "text-amber-300 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-800 hover:text-white"}`}
              title={item.favorite ? "Tirar dos favoritos" : "Guardar nos favoritos"}
              aria-label={item.favorite ? "Tirar dos favoritos" : "Guardar nos favoritos"}
            >
              {item.favorite ? "★" : "☆"}
            </button>
          </form>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" title="Abrir no YouTube" aria-label="Abrir no YouTube">
            ↗
          </a>
        </div>
      </div>
    </article>
  );
}
