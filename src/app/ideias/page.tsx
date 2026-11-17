import Link from "next/link";
import { prisma } from "@/lib/db";
import { IDEA_STATUS } from "@/lib/idea-status";
import { IdeaCard } from "@/components/IdeaCard";
import { repeatsForIdeas } from "@/lib/my-catalog";
import { Collapsible, EmptyState, FilterChip, FilterRow, PageHeader, Pagination, SearchBox, Tabs, makeHref, one, paginate, type SP } from "@/components/ui";

const PER_PAGE = 12;

export default async function IdeasPage({ searchParams }: PageProps<"/ideias">) {
  const sp: SP = await searchParams;
  const canal = one(sp.canal);
  const status = one(sp.status);
  const formato = one(sp.formato);
  const receita = one(sp.receita);
  const text = (one(sp.q) ?? "").trim();
  const base = {
    ...(canal ? { myChannelId: canal } : {}),
    ...(formato ? { format: formato } : {}),
    ...(receita ? { formatId: receita === "nenhum" ? null : receita } : {}),
  };
  const [channels, all, counts, formatCounts, recipeFormats] = await Promise.all([
    prisma.myChannel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.idea.findMany({
      where: { ...base, ...(status ? { status } : { status: { not: "DISCARDED" } }) },
      include: { publishedVideo: true, videoFormat: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.idea.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.idea.groupBy({ by: ["format"], where: canal ? { myChannelId: canal, status: { not: "DISCARDED" } } : { status: { not: "DISCARDED" } }, _count: true }),
    prisma.videoFormat.findMany({ where: { ideas: { some: canal ? { myChannelId: canal } : {} } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  // Busca por texto em título, tema e premissa
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtered = text
    ? all.filter((i) => norm(`${i.chosenTitle ?? ""} ${i.titles} ${i.theme} ${i.ideaData ?? ""}`).includes(norm(text)))
    : all;
  const pg = paginate(filtered, one(sp.page), PER_PAGE);
  const repeats = await repeatsForIdeas(pg.slice);
  const names = new Map(channels.map((c) => [c.id, c.name]));
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const active = counts.filter((c) => c.status !== "DISCARDED").reduce((n, c) => n + c._count, 0);
  const fCount = (f: string) => formatCounts.find((c) => c.format === f)?._count ?? 0;
  const href = makeHref("/ideias", { canal, status, formato, receita, q: text || undefined });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Banco de ideias"
        subtitle="3–5 · Abra uma ideia para escrever ou revisar o roteiro."
        actions={
          <>
            <Link href={canal ? `/ideias/nova?canal=${canal}` : "/ideias/nova"} className="btn-secondary">
              Minha ideia
            </Link>
            <Link href={canal ? `/gerador?canal=${canal}` : "/gerador"} className="btn-primary">
              Gerar ideias
            </Link>
          </>
        }
      />

      <Tabs
        items={[
          { href: href({ status: undefined, page: undefined }), label: "Ativas", count: active, active: !status },
          ...Object.entries(IDEA_STATUS).map(([k, l]) => ({ href: href({ status: k, page: undefined }), label: l, count: countOf(k), active: status === k })),
        ]}
      />

      <Collapsible title="Filtrar ideias" open={Boolean(canal || formato || receita || text)} className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {channels.length > 1 && (
            <FilterRow label="Canal">
              <FilterChip href={href({ canal: undefined, page: undefined })} active={!canal}>
                Todos
              </FilterChip>
              {channels.map((c) => (
                <FilterChip key={c.id} href={href({ canal: c.id, page: undefined })} active={canal === c.id}>
                  {c.name}
                </FilterChip>
              ))}
            </FilterRow>
          )}
          {recipeFormats.length > 0 && (
            <FilterRow label="Formato">
              <FilterChip href={href({ receita: undefined, page: undefined })} active={!receita}>
                Todos
              </FilterChip>
              {recipeFormats.map((f) => (
                <FilterChip key={f.id} href={href({ receita: f.id, page: undefined })} active={receita === f.id}>
                  {f.name}
                </FilterChip>
              ))}
              <FilterChip href={href({ receita: "nenhum", page: undefined })} active={receita === "nenhum"}>
                sem formato
              </FilterChip>
            </FilterRow>
          )}
          <FilterRow label="Tipo">
            <FilterChip href={href({ formato: undefined, page: undefined })} active={!formato}>
              Todos
            </FilterChip>
            <FilterChip href={href({ formato: "short", page: undefined })} active={formato === "short"}>
              Shorts <span className="text-zinc-500">{fCount("short")}</span>
            </FilterChip>
            <FilterChip href={href({ formato: "long", page: undefined })} active={formato === "long"}>
              Longos <span className="text-zinc-500">{fCount("long")}</span>
            </FilterChip>
          </FilterRow>
        </div>
        <SearchBox action="/ideias" q={text} keep={{ canal, status, formato, receita }} placeholder="Buscar por título ou assunto" />
      </div>

      </Collapsible>

      {pg.total === 0 ? (
        <EmptyState
          title={text ? `Nenhuma ideia com “${text}”` : "Nenhuma ideia aqui"}
          action={
            !text && (
              <Link href="/gerador" className="btn-primary">
                Abrir o Gerador
              </Link>
            )
          }
        >
          {text ? "Tente outra palavra ou limpe a busca." : "As ideias que você gerar aparecem aqui."}
        </EmptyState>
      ) : (
        <>
          <div className="grid items-start gap-3 md:grid-cols-2">
            {pg.slice.map((i) => (
              <IdeaCard key={i.id} idea={i} channelName={channels.length > 1 && i.myChannelId ? names.get(i.myChannelId) : null} repeats={repeats.get(i.id)} />
            ))}
          </div>
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} label="ideias" href={(n) => href({ page: String(n) })} />
        </>
      )}
    </div>
  );
}
