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

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`tabular-nums ${strong ? "text-lg font-bold text-white" : "text-sm text-zinc-200"}`}>{value}</div>
    </div>
  );
}

export function RadarCard({ item }: { item: RadarItem }) {
  const { video: v, channel: c, metrics: m } = item;
  const url = videoUrl(v.externalId, v.isShort);
  return (
    <article className="card flex flex-col overflow-hidden">
      <a href={url} target="_blank" rel="noreferrer" className="group relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/hqdefault.jpg`}
          alt=""
          className={`w-full bg-zinc-800 object-cover transition group-hover:opacity-90 ${v.isShort ? "aspect-[9/12]" : "aspect-video"}`}
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {m.multAvg != null && m.multAvg >= 3 && (
            <span className="rounded bg-red-600 px-2 py-0.5 text-sm font-bold shadow">{fmtMult(m.multAvg)}</span>
          )}
          {m.risingFast && <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-black shadow">🔥 Subindo rápido</span>}
          {m.smallChannelHit && (
            <span className="rounded bg-emerald-500 px-2 py-0.5 text-xs font-bold text-black shadow">Canal pequeno estourou</span>
          )}
        </div>
        {v.durationSec != null && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs">{fmtDuration(v.durationSec)}</span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <a href={url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold leading-snug hover:underline">
          {v.title}
        </a>

        <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          {c.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnailUrl} alt="" className="h-6 w-6 rounded-full" />
          )}
          <span className="truncate">{c.title}</span>
          <span className="shrink-0 text-xs text-zinc-500">· {c.subscriberCount != null ? `${fmtCompact(c.subscriberCount)} inscritos` : "inscritos ocultos"}</span>
        </a>

        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          <Stat label="Views" value={fmtCompact(v.viewCount)} hint={fmtInt(v.viewCount)} strong />
          <Stat label="Views/dia" value={fmtCompact(m.viewsPerDay)} hint={`${fmtInt(m.viewsPerDay)} por dia`} strong />
          <Stat
            label="Base canal"
            value={fmtCompact(m.baseMedian)}
            hint={`Mediana dos últimos ${m.baseCount} ${v.isShort ? "Shorts" : "longos"} (média: ${fmtInt(m.baseMean)})`}
          />
          <Stat label="x média" value={fmtMult(m.multAvg)} hint={`Sobre a média aritmética: ${fmtMult(m.multMean)}`} />
          <Stat label="x inscritos" value={fmtMult(m.multSubs)} />
          <Stat label="x veloc." value={fmtMult(m.velocityRatio)} hint="Views/dia sobre a velocidade mediana do canal" />
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-zinc-800 pt-3">
          <div className="text-xs text-zinc-500">
            <div>Publicado {fmtDate(v.publishedAt)}</div>
            <div>{m.ageDays < 1 ? "há menos de 1 dia" : `há ${Math.floor(m.ageDays)} dia${m.ageDays >= 2 ? "s" : ""}`}</div>
          </div>
          <Sparkline points={item.history.map((h) => h.views)} />
        </div>

        <div className="flex gap-2">
          <form action={toggleFavorite.bind(null, v.id)} className="flex-1">
            <button className={`w-full ${item.favorite ? "btn-primary" : "btn-secondary"}`}>
              {item.favorite ? "★ Favorito" : "☆ Favoritar"}
            </button>
          </form>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost">
            Abrir ↗
          </a>
        </div>
      </div>
    </article>
  );
}
