import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRadar, type RadarFilters } from "@/lib/radar";
import { lastCollection } from "@/lib/collect";
import { RadarCard } from "@/components/RadarCard";
import { CollectButton } from "@/components/CollectControls";
import { fmtDateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parseFilters(sp: SP, defaults: { days: number; mult: number }): RadarFilters {
  const days = Number(one(sp.days));
  const mult = Number(one(sp.mult));
  const sort = one(sp.sort);
  return {
    nicheId: one(sp.niche) || undefined,
    format: one(sp.format) === "long" ? "long" : "short",
    days: [7, 14, 30].includes(days) ? days : [7, 14, 30].includes(defaults.days) ? defaults.days : 30,
    minMult: [3, 5, 10, 20].includes(mult) ? mult : defaults.mult,
    sort: sort === "views" || sort === "vpd" || sort === "subs" ? sort : "mult",
    onlySmall: one(sp.small) === "1",
    onlyRising: one(sp.rising) === "1",
    includeAll: one(sp.all) === "1",
  };
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-red-500 bg-red-600/20 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const sp = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const s = await getSettings();
  const f = parseFilters(sp, { days: s.windowDays, mult: s.multiplier });
  const [{ items, totalInWindow, channelCount }, last] = await Promise.all([getRadar(f), lastCollection()]);

  const href = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | number | undefined> = {
      niche: f.nicheId,
      format: f.format,
      days: f.days,
      mult: f.minMult,
      sort: f.sort,
      small: f.onlySmall ? "1" : undefined,
      rising: f.onlyRising ? "1" : undefined,
      all: f.includeAll ? "1" : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v !== undefined && v !== "") q.set(k, String(v));
    return `/radar?${q}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Radar de outliers</h1>
          <p className="text-sm text-zinc-400">
            {items.length} de {totalInWindow} {f.format === "short" ? "Shorts" : "vídeos longos"} dos últimos {f.days} dias ·{" "}
            {channelCount} canais · última coleta: {last ? `${fmtDateTime(last.startedAt)} (${last.status})` : "nunca"}
          </p>
        </div>
        <CollectButton />
      </header>

      {/* Abas Shorts / Longos */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(["short", "long"] as const).map((fm) => (
          <Link
            key={fm}
            href={href({ format: fm })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              f.format === fm ? "border-red-500 text-white" : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {fm === "short" ? "Shorts" : "Vídeos longos"}
          </Link>
        ))}
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <form action="/radar" className="flex items-center gap-2">
          {Object.entries({ format: f.format, days: f.days, mult: f.minMult, sort: f.sort }).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <span className="label mb-0">Nicho</span>
          <select name="niche" defaultValue={f.nicheId ?? ""} className="input w-auto py-1">
            <option value="">Todos</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-2 py-1">Filtrar</button>
        </form>

        <div className="flex items-center gap-2">
          <span className="label mb-0">Janela</span>
          {[7, 14, 30].map((d) => (
            <Chip key={d} href={href({ days: d })} active={f.days === d}>
              {d} dias
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="label mb-0">Mínimo</span>
          {[3, 5, 10, 20].map((m) => (
            <Chip key={m} href={href({ mult: m })} active={f.minMult === m}>
              {m}x
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="label mb-0">Ordenar</span>
          {(
            [
              ["mult", "x média"],
              ["subs", "x inscritos"],
              ["vpd", "Velocidade"],
              ["views", "Views"],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} href={href({ sort: k })} active={f.sort === k}>
              {l}
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Chip href={href({ small: f.onlySmall ? undefined : "1" })} active={!!f.onlySmall}>
            Só canal pequeno
          </Chip>
          <Chip href={href({ rising: f.onlyRising ? undefined : "1" })} active={!!f.onlyRising}>
            Só subindo rápido
          </Chip>
          <Chip href={href({ all: f.includeAll ? undefined : "1" })} active={!!f.includeAll}>
            Mostrar todos
          </Chip>
        </div>
      </div>

      {channelCount === 0 ? (
        <div className="card p-10 text-center text-zinc-400">
          Nenhum canal monitorado ainda. <Link href="/nichos" className="text-red-400 hover:underline">Adicione canais a um nicho</Link>.
        </div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-zinc-400">
          Nenhum outlier com esses filtros. {totalInWindow === 0 && "Clique em “Coletar agora” para buscar os vídeos."}
        </div>
      ) : (
        <div className={`grid gap-4 ${f.format === "short" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          {items.map((it) => (
            <RadarCard key={it.video.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
