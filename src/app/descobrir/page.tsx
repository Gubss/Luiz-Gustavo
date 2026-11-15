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
import { ActionButton, FeaturedButton, MethodTabs, SearchForm } from "./forms";
import { Badge, EmptyState, FilterChip, FilterRow, PageHeader, Pagination, SearchBox, Tabs, Collapsible, paginate } from "@/components/ui";
import { Menu } from "@/components/ui-client";
import { analyzeAction, dismissAction, featuredAction, linkAction, monitorAction, restoreAction, searchAction } from "./actions";
import { estimateLinkCost } from "@/lib/discover";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";
import { StateForm } from "@/components/StateForm";
import { WorkSection } from "@/components/workflow";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Descobrir canais" />
        <EmptyState
          title="Crie um nicho primeiro"
          action={
            <Link href="/nichos" className="btn-primary">
              Ir para Nichos e canais
            </Link>
          }
        >
          A descoberta procura canais novos para um nicho específico.
        </EmptyState>
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

  // Filtros da lista: de qual busca veio, nome do canal, página
  const origin = one(sp.origem);
  const text = (one(sp.q) ?? "").trim();
  const origins = new Map<string, number>();
  let featuredCount = 0;
  for (const c of items) {
    for (const k of c.queryList) origins.set(k, (origins.get(k) ?? 0) + 1);
    if (c.featuredList.length) featuredCount++;
  }
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = items.filter(
    (c) =>
      (!origin || (origin === "__indicados" ? c.featuredList.length > 0 : origin.split(", ").some((k) => c.queryList.includes(k)))) &&
      (!text || norm(`${c.title} ${c.handle ?? ""}`).includes(norm(text))),
  );
  const pg = paginate(filtered, one(sp.page), 10);
  // "Novo" = apareceu pela primeira vez na última busca deste nicho
  const lastAny = searches[0]?.createdAt;
  const isFresh = (d: Date) => !!lastAny && d.getTime() >= lastAny.getTime() - 60 * 60_000;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { niche: niche.id, status, format, sort, origem: origin, q: text || undefined, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return `/descobrir?${p}`;
  };
  const featuredCost = estimateFeaturedCost(niche._count.channels);
  const pending = countOf("new");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Descobrir canais"
        subtitle="Ache canais do nicho que você ainda não acompanha. Os bons você monitora, os ruins você ignora."
        actions={
          <div className="text-right text-xs text-zinc-500" title={`A coleta diária dos seus ${q.channels} canais usa ~${fmtInt(q.reserve)} unidades.`}>
            Cota do YouTube hoje
            <div className="text-sm text-zinc-300 tabular-nums">
              restam {fmtInt(q.remaining)} de {fmtInt(q.limit)}
            </div>
          </div>
        }
        help={
          <>
            <p>
              <b className="text-zinc-300">Buscas não duplicam canais.</b> Se o mesmo canal aparecer em outra busca, ele continua sendo um cartão só e
              ganha a nova palavra-chave na lista de &ldquo;encontrado com&rdquo;. Use o filtro &ldquo;Veio da busca&rdquo; para ver só o que cada
              pesquisa trouxe.
            </p>
            <p>
              <b className="text-zinc-300">Status:</b> &ldquo;Novos&rdquo; são os que você ainda não decidiu. &ldquo;Monitorando&rdquo; já entrou no
              nicho e no radar. &ldquo;Ignorados&rdquo; não voltam para a lista mesmo que apareçam em outra busca (dá para trazer de volta pelo menu ⋯).
            </p>
            <p>
              <b className="text-zinc-300">Custo:</b> a busca por palavra-chave é a parte cara da API do YouTube (~102 unidades por palavra). Parecidos
              com um link custa ~5 + 102 por palavra. Indicados pelos seus canais custa 1 unidade por canal monitorado. O raio-x de um canal custa{" "}
              {ANALYZE_COST}.
            </p>
            <p>
              <b className="text-zinc-300">Parecidos com um link:</b> o app lê títulos e tags do link (e dos vídeos do mesmo formato do canal), tira as
              palavras-chave, busca por elas e junta os canais que esse canal indica. O YouTube não oferece mais &ldquo;vídeos relacionados&rdquo;
              pela API, então o &ldquo;parecido&rdquo; vem do assunto.
            </p>
          </>
        }
      />

      {niches.length > 1 && (
        <FilterRow label="Nicho">
          {niches.map((n) => (
            <FilterChip key={n.id} href={`/descobrir?niche=${n.id}`} active={n.id === niche.id}>
              {n.name}
            </FilterChip>
          ))}
        </FilterRow>
      )}

      {discoverJob && <RunningNote job={discoverJob} what={`${discoverJob.label}${discoverJob.step ? ` · ${discoverJob.step}` : ""}`} />}

      <section className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-500/5 p-4 ring-1 ring-emerald-500/20">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-300">O que fazer agora</h2>
          <p className="text-sm text-zinc-200">
            {pending > 0
              ? `${pending} ${pending === 1 ? "canal novo espera" : "canais novos esperam"} você decidir. Abra, olhe os vídeos e aperte Monitorar nos que parecem com o seu canal; os outros, Ignorar (no menu ⋯).`
              : "Nenhum canal esperando. Faça uma busca: escreva 1 ou 2 palavras do assunto dos seus vídeos."}
          </p>
        </div>
        {pending > 0 && status !== "new" && (
          <Link href={href({ status: "new", page: undefined })} className="btn-primary btn-sm">
            Ver os novos
          </Link>
        )}
      </section>

      <WorkSection id="descobrir-busca" title={`Nova busca em ${niche.name}`} open={pending === 0}>
        <MethodTabs
          tabs={[
            {
              key: "search",
              label: "Por palavra-chave",
              hint: "Procura vídeos no YouTube com essas palavras e mostra os canais que os publicaram.",
              content: (
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
              ),
            },
            {
              key: "link",
              label: "Parecidos com um link",
              hint: "Cole o link de um vídeo ou canal que você gosta. O app acha canais do mesmo assunto.",
              content: (
                <StateForm action={linkAction.bind(null, niche.id)} label="Buscar parecidos" busy="Começando…" hint="Roda em segundo plano">
                  <div className="grid gap-3 md:grid-cols-[3fr_1fr_1fr_1fr]">
                    <div>
                      <label className="label">Link do vídeo ou do canal</label>
                      <input name="link" className="input" placeholder="https://www.youtube.com/shorts/… ou https://www.youtube.com/@canal" />
                    </div>
                    <div>
                      <label className="label">Formato</label>
                      <select name="format" className="input" defaultValue="auto">
                        <option value="auto">O mesmo do link</option>
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
                        <option value="0">Qualquer data</option>
                      </select>
                    </div>
                  </div>
                </StateForm>
              ),
            },
            {
              key: "featured",
              label: "Indicados pelos seus canais",
              hint: `Lê a seção "Canais" da página dos ${niche._count.channels} canais que você já monitora neste nicho. Bem mais barato, mas muitos canais dark não indicam ninguém.`,
              content: (
                <FeaturedButton
                  key={niche.id}
                  action={featuredAction.bind(null, niche.id)}
                  cost={featuredCost}
                  disabled={niche._count.channels === 0 || featuredCost > q.remaining}
                />
              ),
            },
          ]}
        />
      </WorkSection>

      {/* Lista */}
      <section className="space-y-4">
        <Tabs
          items={(
            [
              ["new", "Novos"],
              ["monitored", "Monitorando"],
              ["dismissed", "Ignorados"],
            ] as const
          ).map(([s, l]) => ({ href: href({ status: s, origem: undefined, page: undefined }), label: l, count: countOf(s), active: status === s }))}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <FilterRow label="Formato">
              <FilterChip href={href({ format: "short", page: undefined })} active={format === "short"}>
                Shorts <span className="text-zinc-500">{counts.short}</span>
              </FilterChip>
              <FilterChip href={href({ format: "long", page: undefined })} active={format === "long"}>
                Longos <span className="text-zinc-500">{counts.long}</span>
              </FilterChip>
              <FilterChip href={href({ format: "all", page: undefined })} active={format === "all"}>
                Todos <span className="text-zinc-500">{counts.all}</span>
              </FilterChip>
            </FilterRow>
            <Collapsible title={<span className="text-xs text-zinc-400">Mais filtros</span>} meta={origin ? "filtrando por busca" : undefined} open={!!origin || sort !== "score"} bodyClassName="mt-2 space-y-2">
            {(origins.size > 0 || featuredCount > 0) && (
              <FilterRow label="Veio da busca">
                <FilterChip href={href({ origem: undefined, page: undefined })} active={!origin}>
                  Todas
                </FilterChip>
                {[...origins.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <FilterChip key={k} href={href({ origem: k, page: undefined })} active={origin === k}>
                      &ldquo;{k}&rdquo; <span className="text-zinc-500">{n}</span>
                    </FilterChip>
                  ))}
                {featuredCount > 0 && (
                  <FilterChip href={href({ origem: "__indicados", page: undefined })} active={origin === "__indicados"}>
                    Indicados por canais <span className="text-zinc-500">{featuredCount}</span>
                  </FilterChip>
                )}
              </FilterRow>
            )}
            <FilterRow label="Ordenar">
              {SORTS.map(([k, l, tip]) => (
                <FilterChip key={k} href={href({ sort: k, page: undefined })} active={sort === k} title={tip}>
                  {l}
                </FilterChip>
              ))}
            </FilterRow>
            </Collapsible>
          </div>
          <SearchBox action="/descobrir" q={text} keep={{ niche: niche.id, status, format, sort, origem: origin }} placeholder="Buscar canal pelo nome" />
        </div>

        {pg.total === 0 ? (
          <EmptyState
            title={
              items.length > 0
                ? "Nenhum canal com esses filtros"
                : status === "new"
                  ? countOf("new") === 0
                    ? "Nenhum canal novo"
                    : "Nenhum canal neste formato"
                  : status === "monitored"
                    ? "Nenhum canal monitorado por aqui ainda"
                    : "Nenhum canal ignorado"
            }
          >
            {items.length > 0
              ? "Limpe a busca ou escolha outra origem."
              : status === "new"
                ? countOf("new") === 0
                  ? "Faça uma busca acima."
                  : "Troque o filtro de formato."
                : status === "monitored"
                  ? "Os canais que você passar a monitorar aparecem aqui."
                  : "Canais ignorados ficam aqui e não voltam para a lista de novos."}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {pg.slice.map((c) => {
              const small = c.subscriberCount != null && c.subscriberCount <= settings.smallChannelMaxSubs && (c.bestRatio ?? 0) >= settings.smallChannelMinRatio;
              const shown = c.videos.filter((v) => format === "all" || v.isShort === (format === "short")).slice(0, 4);
              const a = c.analysisData;
              const other = elsewhere.get(c.externalId);
              const sources = c.queryList.length + (c.featuredList.length ? 1 : 0);
              return (
                <article key={c.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="flex min-w-[14rem] flex-1 items-center gap-3">
                      {c.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnailUrl} alt="" className="h-11 w-11 shrink-0 rounded-full bg-zinc-800" />
                      ) : (
                        <span className="h-11 w-11 shrink-0 rounded-full bg-zinc-800" />
                      )}
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-semibold hover:underline">{c.title}</span>
                          {status === "new" && isFresh(c.firstSeenAt) && <Badge tone="red">novo nesta busca</Badge>}
                          {small && <Badge tone="green">Canal pequeno estourou</Badge>}
                          {c.isYoung && <Badge tone="blue">Canal novo</Badge>}
                          {other && <Badge tone="amber">Já em: {other.join(", ")}</Badge>}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {c.hiddenSubscribers ? "inscritos ocultos" : `${fmtCompact(c.subscriberCount)} inscritos`} · {fmtInt(c.videoCount)} vídeos
                          {c.ageMonths != null && ` · ${channelAge(c.ageMonths)}`}
                          {c.country && ` · ${c.country}`}
                        </span>
                      </span>
                    </a>
                    <div className="ml-auto flex items-center gap-3">
                      {c.bestRatio != null && (
                        <div className="text-right" title="Views do melhor vídeo ÷ inscritos. Acima de 10x: o assunto passa muito de quem já segue o canal, bom sinal.">
                          <div className="text-lg leading-none font-semibold text-red-300 tabular-nums">
                            {c.bestRatio >= 10 ? Math.round(c.bestRatio) : c.bestRatio.toFixed(1).replace(".", ",")}x
                          </div>
                          <div className="text-[11px] text-zinc-500">views ÷ inscritos</div>
                        </div>
                      )}
                      {status !== "monitored" && (
                        <ActionButton action={monitorAction.bind(null, c.id)} className="btn-primary" pendingText="Adicionando…" title="Adiciona ao nicho (1 unidade)">
                          Monitorar
                        </ActionButton>
                      )}
                      <Menu>
                        <ActionButton
                          action={analyzeAction.bind(null, c.id)}
                          className="menu-item"
                          formClassName="block"
                          pendingText="Analisando…"
                          title={`Lê os últimos 50 vídeos do canal e mede Shorts x longos, frequência e outliers (${ANALYZE_COST} unidades)`}
                        >
                          {a ? "Refazer raio-x" : "Fazer raio-x do canal"} <span className="ml-auto text-xs text-zinc-500">{ANALYZE_COST} un.</span>
                        </ActionButton>
                        <a href={channelUrl(c)} target="_blank" rel="noreferrer" className="menu-item">
                          Abrir no YouTube
                        </a>
                        {status === "new" && (
                          <form action={dismissAction.bind(null, c.id)}>
                            <button className="menu-item text-zinc-400">Ignorar este canal</button>
                          </form>
                        )}
                        {status === "dismissed" && (
                          <form action={restoreAction.bind(null, c.id)}>
                            <button className="menu-item">Voltar para Novos</button>
                          </form>
                        )}
                      </Menu>
                    </div>
                  </div>

                  {a && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-ink/70 px-3 py-2 text-xs text-zinc-400" title={`Raio-x feito em ${fmtDateTime(c.analyzedAt)}`}>
                      <span>
                        <span className="text-zinc-500">Raio-x:</span> {a.shorts} Shorts · {a.longs} longos (últimos {a.sampled})
                      </span>
                      <span>
                        <span className="text-zinc-500">Mediana:</span>{" "}
                        {[a.medianShortViews != null && `Shorts ${fmtCompact(a.medianShortViews)}`, a.medianLongViews != null && `longos ${fmtCompact(a.medianLongViews)}`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      <span>
                        <span className="text-zinc-500">Ritmo:</span> {a.uploadsPerWeek != null ? `${String(a.uploadsPerWeek).replace(".", ",")}/semana` : "—"}
                      </span>
                      <span>
                        <span className="text-zinc-500">Último:</span> {a.lastUploadAt ? fmtDate(a.lastUploadAt) : "—"}
                      </span>
                      <span>
                        <span className="text-zinc-500">Outliers:</span> {a.outliers} de {a.sampled}
                      </span>
                    </div>
                  )}

                  {shown.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {shown.map((v) => (
                        <a
                          key={v.id}
                          href={videoUrl(v.id, v.isShort)}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex gap-2 rounded-lg p-1 hover:bg-zinc-800/60"
                        >
                          {v.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumb} alt="" className="h-12 w-20 shrink-0 rounded bg-zinc-800 object-cover" />
                          ) : (
                            <span className="h-12 w-20 shrink-0 rounded bg-zinc-800" />
                          )}
                          <span className="min-w-0 text-xs">
                            <span className="line-clamp-2 text-zinc-300 group-hover:text-white">{v.title}</span>
                            <span className="text-zinc-500 tabular-nums">
                              {fmtCompact(v.views)} views · {fmtDate(v.publishedAt)}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {sources > 0 && (
                    <p className="mt-2 truncate text-xs text-zinc-500" title={[...c.queryList.map((x) => `“${x}”`), ...c.featuredList.map((x) => `indicado por ${x}`)].join(", ")}>
                      {sources > 1 ? `Apareceu em ${sources} buscas: ` : "Encontrado com: "}
                      {c.queryList.map((x) => `“${x}”`).join(", ")}
                      {c.featuredList.length > 0 && `${c.queryList.length ? " · " : ""}indicado por ${c.featuredList.join(", ")}`}
                    </p>
                  )}
                </article>
              );
            })}
            <Pagination page={pg.page} pages={pg.pages} total={pg.total} label="canais" href={(n) => href({ page: String(n) })} />
          </div>
        )}
      </section>

      {searches.length > 0 && (
        <Collapsible title="Histórico de buscas" meta={`${searches.length} mais recentes`} className="card p-4">
          <div className="divide-y divide-line text-sm">
            {searches.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-32 text-xs text-zinc-500 tabular-nums">{fmtDateTime(s.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.method === "featured" ? (
                    <Link className="hover:underline" href={href({ status: "new", origem: "__indicados", page: undefined })}>
                      Canais indicados
                    </Link>
                  ) : s.query ? (
                    <Link className="hover:underline" href={href({ status: "new", origem: s.query, page: undefined })}>
                      {s.query}
                    </Link>
                  ) : (
                    "Parecidos com um link"
                  )}
                  {s.method === "search" && <span className="text-zinc-500"> · {s.format === "short" ? "Shorts" : "longos"}</span>}
                </span>
                <span className="text-xs text-zinc-400">
                  {s.newChannels} novo{s.newChannels === 1 ? "" : "s"}
                </span>
                <span className="w-24 text-right text-xs text-zinc-500 tabular-nums">{fmtInt(s.unitsUsed)} unidades</span>
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}
