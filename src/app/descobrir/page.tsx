import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  ANALYZE_COST,
  estimateFeaturedCost,
  listCandidates,
  quotaStatus,
  recentSearches,
  suggestKeywords,
  type CandidateSort,
  type Format,
} from "@/lib/discover";
import { channelUrl, videoUrl } from "@/lib/youtube";
import { fmtCompact, fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { ActionButton, FeaturedButton, SearchForm } from "./forms";
import { analyzeAction, dismissAction, featuredAction, linkAction, monitorAction, restoreAction, searchAction } from "./actions";
import { estimateLinkCost } from "@/lib/discover";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { StateForm } from "@/components/StateForm";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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

function channelAge(months: number | null) {
  if (months == null) return null;
  if (months < 1) return "criado há menos de 1 mês";
  if (months < 24) return `criado há ${months} ${months === 1 ? "mês" : "meses"}`;
  return `criado há ${Math.floor(months / 12)} anos`;
}

const SORTS: [CandidateSort, string, string][] = [
  ["score", "Mais promissores", "Views do melhor vídeo × quanto passou dos inscritos × quantas vezes apareceu × bônus para canal com menos de 1 ano"],
  ["views", "Melhor vídeo", "Views do vídeo mais visto encontrado"],
  ["ratio", "Views / inscritos", "Quantas vezes o melhor vídeo passou o número de inscritos"],
  ["small", "Menores primeiro", "Menos inscritos primeiro"],
  ["young", "Mais novos", "Canais criados há menos tempo primeiro"],
];

export default async function DiscoverPage({ searchParams }: PageProps<"/descobrir">) {
  const sp: SP = await searchParams;
  const niches = await prisma.niche.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, _count: { select: { channels: true } } },
  });

  if (niches.length === 0)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl font-bold">Descobrir canais</h1>
        <p className="text-zinc-400">
          Crie um nicho primeiro em{" "}
          <Link href="/nichos" className="text-red-400 hover:underline">
            Nichos e canais
          </Link>
          . A descoberta procura canais novos para um nicho específico.
        </p>
      </div>
    );

  const niche = niches.find((n) => n.id === one(sp.niche)) ?? niches[0];
  const status = ["new", "monitored", "dismissed"].includes(one(sp.status) ?? "") ? one(sp.status)! : "new";
  const lastSearch = await prisma.discoverySearch.findFirst({
    where: { nicheId: niche.id, method: "search" },
    orderBy: { createdAt: "desc" },
  });
  const lastParams = lastSearch ? (JSON.parse(lastSearch.params) as { format?: Format; language?: string; region?: string; days?: number }) : {};
  const fmtParam = one(sp.format);
  const format: Format | "all" =
    fmtParam === "short" || fmtParam === "long" || fmtParam === "all" ? fmtParam : (lastParams.format ?? "short");
  const sortParam = one(sp.sort) as CandidateSort;
  const sort: CandidateSort = SORTS.some(([k]) => k === sortParam) ? sortParam : "score";

  const settings = await getSettings();
  const [q, suggestions, { items, counts }, searches, statusCounts] = await Promise.all([
    quotaStatus(),
    suggestKeywords(niche.id),
    listCandidates({ nicheId: niche.id, status, format, sort }),
    recentSearches(niche.id),
    prisma.discoveredChannel.groupBy({ by: ["status"], where: { nicheId: niche.id }, _count: true }),
  ]);
  const countOf = (s: string) => statusCounts.find((c) => c.status === s)?._count ?? 0;
  const discoverJob = (await runningJobsFor([niche.id])).find((j) => j.kind === "discover");
  // Canais que já estão em outro nicho seu
  const elsewhere = new Map<string, string[]>();
  if (items.length) {
    const rows = await prisma.nicheChannel.findMany({
      where: { channel: { externalId: { in: items.map((i) => i.externalId) } }, nicheId: { not: niche.id } },
      select: { niche: { select: { name: true } }, channel: { select: { externalId: true } } },
    });
    for (const r of rows) elsewhere.set(r.channel.externalId, [...(elsewhere.get(r.channel.externalId) ?? []), r.niche.name]);
  }

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { niche: niche.id, status, format, sort, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/descobrir?${p}`;
  };
  const featuredCost = estimateFeaturedCost(niche._count.channels);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Descobrir canais</h1>
          <p className="text-sm text-zinc-400">
            Encontra canais do nicho que você ainda não monitora. Escolha os bons e clique em Monitorar.
          </p>
        </div>
        <div className="text-right text-sm text-zinc-400">
          Cota hoje: <span className="tabular-nums text-zinc-100">{fmtInt(q.used)}</span> de {fmtInt(q.limit)} · restam{" "}
          <span className="tabular-nums text-zinc-100">{fmtInt(q.remaining)}</span>
          <div className="text-xs text-zinc-500">
            A coleta diária dos seus {q.channels} canais usa ~{fmtInt(q.reserve)}. Uma busca por palavra-chave usa ~102.
          </div>
        </div>
      </header>

      {/* Nicho */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Nicho:</span>
        {niches.map((n) => (
          <Chip key={n.id} href={`/descobrir?niche=${n.id}`} active={n.id === niche.id}>
            {n.name}
          </Chip>
        ))}
      </div>

      {discoverJob && <RunningNote job={discoverJob} what={`${discoverJob.label}${discoverJob.step ? ` · ${discoverJob.step}` : ""}`} />}

      {/* Parecidos com um link */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Canais parecidos com um link</h2>
          <p className="text-xs text-zinc-500">
            Cole o link de um vídeo ou de um canal que você gosta. O app lê os títulos e tags dele (e dos vídeos do mesmo formato do canal), tira
            as palavras-chave, busca por elas e junta os canais que esse canal indica na página dele. O canal do link também entra na lista.
            O YouTube não oferece mais &ldquo;vídeos relacionados&rdquo; pela API, então o &ldquo;parecido&rdquo; vem do assunto.
          </p>
        </div>
        <StateForm action={linkAction.bind(null, niche.id)} label="Buscar parecidos" busy="Começando…" hint="Roda em segundo plano">
          <div className="grid gap-3 md:grid-cols-[3fr_1fr_1fr_1fr]">
            <div>
              <label className="label">Link do vídeo ou do canal</label>
              <input name="link" className="input" placeholder="https://www.youtube.com/shorts/… ou https://www.youtube.com/@canal" />
            </div>
            <div>
              <label className="label">Formato</label>
              <select name="format" className="input" defaultValue="auto">
                <option value="auto">o mesmo do link</option>
                <option value="short">Shorts</option>
                <option value="long">Vídeos longos</option>
              </select>
            </div>
            <div>
              <label className="label">Palavras-chave</label>
              <select name="keywordCount" className="input" defaultValue="2">
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n} disabled={estimateLinkCost(n) > q.remaining}>
                    {n} · ~{estimateLinkCost(n)} unidades
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Publicados nos últimos</label>
              <select name="days" className="input" defaultValue="365">
                <option value="90">3 meses</option>
                <option value="180">6 meses</option>
                <option value="365">1 ano</option>
                <option value="0">qualquer data</option>
              </select>
            </div>
          </div>
        </StateForm>
      </section>

      {/* Busca */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Buscar por palavra-chave</h2>
          <p className="text-xs text-zinc-500">
            Procura vídeos no YouTube com essas palavras e mostra os canais que os publicaram. A busca do YouTube é a
            parte cara da API (100 unidades por palavra, com até 50 vídeos cada); o resto custa 1 ou 2 unidades.
          </p>
        </div>
        <SearchForm
          key={niche.id}
          action={searchAction.bind(null, niche.id)}
          suggestions={suggestions}
          remaining={q.remaining}
          reserve={q.reserve}
          defaults={{
            format: lastParams.format ?? (format === "long" ? "long" : "short"),
            language: lastParams.language ?? "pt",
            region: lastParams.region ?? "BR",
            days: lastParams.days ?? 90,
          }}
        />
      </section>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">Canais indicados pelos que você já monitora</h2>
          <p className="text-xs text-zinc-500">
            Lê a seção &ldquo;Canais&rdquo; da página de cada um dos {niche._count.channels} canais monitorados deste nicho
            (1 unidade por canal). Bem mais barato que a busca, mas muitos canais dark não indicam ninguém.
          </p>
        </div>
        <FeaturedButton
          key={niche.id}
          action={featuredAction.bind(null, niche.id)}
          cost={featuredCost}
          disabled={niche._count.channels === 0 || featuredCost > q.remaining}
        />
      </section>

      {/* Lista */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800">
          <div className="flex gap-1">
            {(
              [
                ["new", "Encontrados"],
                ["monitored", "Já monitorando"],
                ["dismissed", "Ignorados"],
              ] as const
            ).map(([s, l]) => (
              <Link
                key={s}
                href={href({ status: s })}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                  status === s ? "border-red-500 font-medium text-white" : "border-transparent text-zinc-400 hover:text-white"
                }`}
              >
                {l} <span className="text-zinc-500">({countOf(s)})</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip href={href({ format: "short" })} active={format === "short"}>
            Shorts ({counts.short})
          </Chip>
          <Chip href={href({ format: "long" })} active={format === "long"}>
            Longos ({counts.long})
          </Chip>
          <Chip href={href({ format: "all" })} active={format === "all"}>
            Todos ({counts.all})
          </Chip>
          <span className="mx-2 h-5 w-px bg-zinc-800" />
          {SORTS.map(([k, l, tip]) => (
            <Link
              key={k}
              href={href({ sort: k })}
              title={tip}
              className={`text-sm ${sort === k ? "text-white underline underline-offset-4" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {l}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-zinc-400">
            {status === "new"
              ? countOf("new") === 0
                ? "Nenhum canal encontrado ainda. Faça uma busca acima."
                : "Nenhum canal neste formato. Troque o filtro de formato acima."
              : status === "monitored"
                ? "Os canais que você passar a monitorar por aqui aparecem nesta aba."
                : "Canais ignorados ficam aqui e não voltam para a lista de encontrados."}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((c) => {
              const small = c.subscriberCount != null && c.subscriberCount <= settings.smallChannelMaxSubs && (c.bestRatio ?? 0) >= settings.smallChannelMinRatio;
              const shown = c.videos.filter((v) => format === "all" || v.isShort === (format === "short")).slice(0, 4);
              const a = c.analysisData;
              const other = elsewhere.get(c.externalId);
              return (
                <article key={c.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                      {c.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-full" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold hover:underline">{c.title}</span>
                        <span className="block text-xs text-zinc-500">
                          {c.hiddenSubscribers ? "inscritos ocultos" : `${fmtCompact(c.subscriberCount)} inscritos`} ·{" "}
                          {fmtInt(c.videoCount)} vídeos · {fmtCompact(c.viewCount)} views totais
                          {c.ageMonths != null && ` · ${channelAge(c.ageMonths)}`}
                          {c.country && ` · ${c.country}`}
                        </span>
                      </span>
                    </a>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {small && <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-emerald-300">Canal pequeno estourou</span>}
                      {c.isYoung && <span className="rounded bg-sky-900/50 px-2 py-0.5 text-sky-300">Canal novo</span>}
                      {c.bestRatio != null && (
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300" title="Views do melhor vídeo encontrado ÷ inscritos">
                          {c.bestRatio >= 10 ? Math.round(c.bestRatio) : c.bestRatio.toFixed(1).replace(".", ",")}x inscritos
                        </span>
                      )}
                      {other && <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-300">Já em: {other.join(", ")}</span>}
                    </div>
                    <div className="flex items-start gap-2">
                      {status !== "monitored" && (
                        <ActionButton action={monitorAction.bind(null, c.id)} className="btn-primary" pendingText="Adicionando…" title="Adiciona ao nicho (1 unidade)">
                          Monitorar
                        </ActionButton>
                      )}
                      <ActionButton
                        action={analyzeAction.bind(null, c.id)}
                        pendingText="Analisando…"
                        title={`Lê os últimos 50 vídeos do canal e mede Shorts x longos, frequência e outliers (${ANALYZE_COST} unidades)`}
                      >
                        {a ? "Refazer raio-x" : "Raio-x"} <span className="text-xs text-zinc-400">{ANALYZE_COST} un.</span>
                      </ActionButton>
                      {status === "new" && (
                        <form action={dismissAction.bind(null, c.id)}>
                          <button className="btn-ghost" title="Não mostrar mais este canal">
                            Ignorar
                          </button>
                        </form>
                      )}
                      {status === "dismissed" && (
                        <form action={restoreAction.bind(null, c.id)}>
                          <button className="btn-ghost">Voltar para a lista</button>
                        </form>
                      )}
                    </div>
                  </div>

                  {a && (
                    <div className="mt-3 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <div className="text-zinc-500">Formato (últimos {a.sampled})</div>
                        <div className="font-medium">
                          {a.shorts} Shorts · {a.longs} longos
                          <span className="text-zinc-500"> ({Math.round(a.shortShare * 100)}% Shorts)</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Mediana de views</div>
                        <div className="font-medium">
                          {a.medianShortViews != null && `Shorts ${fmtCompact(a.medianShortViews)}`}
                          {a.medianShortViews != null && a.medianLongViews != null && " · "}
                          {a.medianLongViews != null && `Longos ${fmtCompact(a.medianLongViews)}`}
                          {a.medianShortViews == null && a.medianLongViews == null && "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Ritmo de postagem</div>
                        <div className="font-medium">
                          {a.uploadsPerWeek != null ? `${String(a.uploadsPerWeek).replace(".", ",")} por semana` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Último vídeo</div>
                        <div className="font-medium">{a.lastUploadAt ? fmtDate(a.lastUploadAt) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Outliers (3x+ a mediana)</div>
                        <div className="font-medium">
                          {a.outliers} de {a.sampled}
                        </div>
                      </div>
                      <div className="text-zinc-600 sm:col-span-2 lg:col-span-5">Raio-x feito em {fmtDateTime(c.analyzedAt)}</div>
                    </div>
                  )}

                  {shown.length > 0 && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {shown.map((v) => (
                        <a
                          key={v.id}
                          href={videoUrl(v.id, v.isShort)}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex gap-2 rounded-lg p-1 hover:bg-zinc-800/60"
                        >
                          {v.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumb} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
                          )}
                          <span className="min-w-0 text-xs">
                            <span className="line-clamp-2 text-zinc-200 group-hover:underline">{v.title}</span>
                            <span className="text-zinc-500">
                              {fmtCompact(v.views)} views · {fmtDate(v.publishedAt)} · {v.isShort ? "Short" : "longo"}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {(c.queryList.length > 0 || c.featuredList.length > 0) && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {c.queryList.length > 0 && <>Encontrado com: {c.queryList.map((x) => `“${x}”`).join(", ")}. </>}
                      {c.featuredList.length > 0 && <>Indicado por: {c.featuredList.join(", ")}.</>}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {searches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Buscas recentes neste nicho</h2>
          <div className="card divide-y divide-zinc-800 text-sm">
            {searches.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <span className="w-32 text-xs text-zinc-500">{fmtDateTime(s.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.method === "featured" ? "Canais indicados" : s.query}
                  {s.method === "search" && <span className="text-zinc-500"> · {s.format === "short" ? "Shorts" : "longos"}</span>}
                </span>
                <span className="text-xs text-zinc-400">
                  {s.newChannels} novo{s.newChannels === 1 ? "" : "s"}
                </span>
                <span className="w-24 text-right text-xs tabular-nums text-zinc-400">{fmtInt(s.unitsUsed)} unidades</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
