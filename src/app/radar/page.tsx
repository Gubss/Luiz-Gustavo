import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRadar, type RadarChannelDiag, type RadarFilters } from "@/lib/radar";
import { lastCollection } from "@/lib/collect";
import { RadarCard } from "@/components/RadarCard";
import { CollectButton } from "@/components/CollectControls";
import { fmtCompact, fmtDateTime, fmtMult } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { Collapsible, EmptyState, FilterChip as Chip, PageHeader, Pagination, Tabs, paginate } from "@/components/ui";

const PER_PAGE = 24;

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

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const sp = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const s = await getSettings();
  const f = parseFilters(sp, { days: s.windowDays, mult: s.multiplier });
  const [{ items, totalInWindow, collectedOfFormat, channelCount, diagnostics }, last] = await Promise.all([getRadar(f), lastCollection()]);

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
      page: undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v !== undefined && v !== "") q.set(k, String(v));
    return `/radar?${q}`;
  };

  const pg = paginate(items, one(sp.page), PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Radar de outliers"
        subtitle={
          <>
            {items.length} de {totalInWindow} {f.format === "short" ? "Shorts" : "vídeos longos"} dos últimos {f.days} dias passaram do mínimo · {channelCount} canais
            <span className="text-zinc-500"> · última coleta {last ? `${fmtDateTime(last.startedAt)}${last.status !== "ok" ? ` (${last.status})` : ""}` : "nunca"}</span>
          </>
        }
        actions={<CollectButton />}
      />

      <Tabs
        items={(["short", "long"] as const).map((fm) => ({ href: href({ format: fm }), label: fm === "short" ? "Shorts" : "Vídeos longos", active: f.format === fm }))}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {niches.length > 1 && (
          <form action="/radar" className="flex items-center gap-2">
            {Object.entries({ format: f.format, days: f.days, mult: f.minMult, sort: f.sort }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <select name="niche" defaultValue={f.nicheId ?? ""} className="input w-auto py-1" aria-label="Nicho">
              <option value="">Todos os nichos</option>
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            <button className="btn-ghost btn-sm">Filtrar</button>
          </form>
        )}

        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Publicados em</span>
          {[7, 14, 30].map((d) => (
            <Chip key={d} href={href({ days: d })} active={f.days === d}>
              {d} dias
            </Chip>
          ))}
        </div>

        <Collapsible
          title={<span className="text-xs text-zinc-400">Mais filtros</span>}
          open={f.minMult !== 3 || f.sort !== "mult" || !!f.onlySmall || !!f.onlyRising || !!f.includeAll}
          className="w-full"
          bodyClassName="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2.5"
        >
        <p className="w-full text-xs text-zinc-500">
          &ldquo;x média&rdquo; é quantas vezes o vídeo passou o normal do próprio canal: 3x já é bom, 10x é estouro. &ldquo;x inscritos&rdquo; é views ÷
          inscritos.
        </p>
        <div className="flex flex-wrap items-center gap-1.5" title="Quantas vezes o vídeo passou a mediana do próprio canal">
          <span className="mr-1 text-xs text-zinc-500">Mínimo</span>
          {[3, 5, 10, 20].map((m) => (
            <Chip key={m} href={href({ mult: m })} active={f.minMult === m}>
              {m}x
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Ordenar</span>
          {(
            [
              ["mult", "x média"],
              ["subs", "x inscritos"],
              ["vpd", "Views por dia"],
              ["views", "Views"],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} href={href({ sort: k })} active={f.sort === k}>
              {l}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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
        </Collapsible>
      </div>

      {channelCount === 0 ? (
        <EmptyState
          title="Nenhum canal monitorado ainda"
          action={
            <Link href="/nichos" className="btn-primary">
              Adicionar canais a um nicho
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyExplanation
          format={f.format}
          days={f.days}
          minMult={f.minMult}
          minViews={s.minViews}
          totalInWindow={totalInWindow}
          collectedOfFormat={collectedOfFormat}
          everCollected={!!last}
          diagnostics={diagnostics}
          extraFilters={!!(f.onlySmall || f.onlyRising)}
          clearExtraHref={href({ small: undefined, rising: undefined })}
          showAllHref={href({ all: "1", small: undefined, rising: undefined })}
          widerHref={f.days < 30 ? href({ days: 30 }) : undefined}
          lowerMultHref={f.minMult > 3 ? href({ mult: 3 }) : undefined}
        />
      ) : (
        <>
          <div className={`grid gap-3 ${f.format === "short" ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {pg.slice.map((it) => (
              <RadarCard key={it.video.id} item={it} />
            ))}
          </div>
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} label="vídeos" href={(n) => href({ page: n })} />
        </>
      )}
    </div>
  );
}

/** Tela vazia que explica o motivo, em vez de só "nada encontrado". */
function EmptyExplanation(p: {
  format: "short" | "long";
  days: number;
  minMult: number;
  minViews: number;
  totalInWindow: number;
  collectedOfFormat: number;
  everCollected: boolean;
  diagnostics: RadarChannelDiag[];
  extraFilters: boolean;
  clearExtraHref: string;
  showAllHref: string;
  widerHref?: string;
  lowerMultHref?: string;
}) {
  const nome = p.format === "short" ? "Shorts" : "vídeos longos";
  if (!p.everCollected) {
    return <div className="card p-10 text-center text-zinc-400">Clique em “Coletar agora” para buscar os vídeos dos canais.</div>;
  }
  if (p.totalInWindow === 0) {
    return (
      <div className="card space-y-2 p-8 text-center text-zinc-400">
        <p className="text-zinc-200">Nenhum dos canais publicou {nome} nos últimos {p.days} dias.</p>
        <p className="text-sm">
          {p.collectedOfFormat > 0
            ? `Há ${p.collectedOfFormat} ${nome} mais antigos coletados, fora da janela.`
            : `Não há nenhum ${p.format === "short" ? "Short" : "vídeo longo"} entre os vídeos coletados.`}{" "}
          {p.widerHref && (
            <Link href={p.widerHref} className="text-red-400 hover:underline">
              Ver 30 dias
            </Link>
          )}
        </p>
      </div>
    );
  }
  if (p.extraFilters) {
    return (
      <div className="card p-10 text-center text-zinc-400">
        Nenhum dos {p.totalInWindow} {nome} da janela passa nos filtros “Só canal pequeno” / “Só subindo rápido”.{" "}
        <Link href={p.clearExtraHref} className="text-red-400 hover:underline">
          Tirar esses filtros
        </Link>
      </div>
    );
  }
  const rows = p.diagnostics.filter((d) => d.inWindow > 0);
  return (
    <div className="card space-y-4 p-6 text-sm text-zinc-400">
      <div>
        <p className="text-base text-zinc-200">
          {p.totalInWindow} {nome} nos últimos {p.days} dias, mas nenhum chegou a {p.minMult}x a média do próprio canal.
        </p>
        <p className="mt-1">
          Para virar outlier, o vídeo precisa ter pelo menos {fmtCompact(p.minViews)} views e {p.minMult}x a mediana dos
          últimos vídeos do mesmo formato do canal (ou {p.minMult}x os inscritos). Veja o motivo por canal:
        </p>
      </div>
      <table className="w-full text-left">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Canal</th>
            <th className="py-1 font-medium">{p.format === "short" ? "Shorts" : "Longos"} na janela</th>
            <th className="py-1 font-medium">Maior x média</th>
            <th className="py-1 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.channelId} className="border-t border-line align-top">
              <td className="py-2 pr-3 text-zinc-200">{d.title}</td>
              <td className="py-2 pr-3">{d.inWindow}</td>
              <td className="py-2 pr-3">
                {d.bestMult != null ? (
                  <span title={d.bestTitle ?? undefined}>{fmtMult(d.bestMult)}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2">{reason(d, p.minMult, p.minViews, p.format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3">
        <Link href={p.showAllHref} className="btn-secondary">
          Mostrar todos os {nome} mesmo assim
        </Link>
        {p.lowerMultHref && (
          <Link href={p.lowerMultHref} className="btn-ghost">
            Baixar o mínimo para 3x
          </Link>
        )}
        {p.widerHref && (
          <Link href={p.widerHref} className="btn-ghost">
            Ver 30 dias
          </Link>
        )}
      </div>
    </div>
  );
}

function reason(d: RadarChannelDiag, minMult: number, minViews: number, format: "short" | "long") {
  const fm = format === "short" ? "Shorts" : "vídeos longos";
  const parts: string[] = [];
  if (d.noBase === d.inWindow) parts.push(`sem ${fm} anteriores para comparar (nenhum outro com 48h+ de vida)`);
  else if (d.noBase > 0) parts.push(`${d.noBase} sem base para comparar`);
  if (d.belowMinViews === d.inWindow) parts.push(`todos abaixo de ${fmtCompact(minViews)} views`);
  else if (d.belowMinViews > 0) parts.push(`${d.belowMinViews} abaixo de ${fmtCompact(minViews)} views`);
  if (d.bestMult != null && d.bestMult < minMult) parts.push(`o melhor fez ${fmtMult(d.bestMult)} a média, abaixo de ${minMult}x`);
  return parts.length ? parts.join("; ") : "nenhum passou do mínimo";
}
