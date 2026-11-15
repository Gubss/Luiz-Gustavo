import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime } from "@/lib/format";
import { claudeSpendThisMonth, usdToBrl } from "@/lib/claude";
import { studyByLinkAction } from "@/app/video/actions";
import { StudyLinkForm } from "@/app/video/[id]/forms";
import { formatsByVideo } from "@/lib/formats";
import { Badge, Collapsible, EmptyState, FilterChip, FilterRow, PageHeader, Pagination, SearchBox, makeHref, one, paginate, type SP } from "@/components/ui";

const PER_PAGE = 20;

function resumoOf(content: string | null | undefined): string | null {
  if (!content) return null;
  try {
    return (JSON.parse(content) as { resumo?: string }).resumo ?? null;
  } catch {
    return null;
  }
}

export default async function StudiesPage({ searchParams }: PageProps<"/estudos">) {
  const sp: SP = await searchParams;
  const formato = one(sp.formato);
  const canal = one(sp.canal);
  const etapa = one(sp.etapa);
  const semFormato = one(sp.receita) === "sem";
  const text = (one(sp.q) ?? "").trim();
  const [videos, spend] = await Promise.all([
    prisma.video.findMany({
      where: { OR: [{ transcript: { isNot: null } }, { diagnosis: { isNot: null } }] },
      include: {
        channel: { select: { id: true, title: true } },
        transcript: { select: { source: true, wordCount: true, updatedAt: true } },
        diagnosis: { select: { diagnosedAt: true, commentsAnalyzedAt: true, source: true, updatedAt: true, content: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    claudeSpendThisMonth(),
  ]);
  const inFormat = new Set((await prisma.formatVideo.findMany({ select: { videoId: true } })).map((x) => x.videoId));
  const last = (v: (typeof videos)[number]) => Math.max(v.transcript?.updatedAt.getTime() ?? 0, v.diagnosis?.updatedAt.getTime() ?? 0);
  videos.sort((a, b) => last(b) - last(a));

  const hasDiag = (v: (typeof videos)[number]) => !!(v.diagnosis?.diagnosedAt || v.diagnosis?.source === "import");
  const hasComments = (v: (typeof videos)[number]) => !!v.diagnosis?.commentsAnalyzedAt;
  const channels = [...new Map(videos.map((v) => [v.channel.id, v.channel.title])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtered = videos.filter(
    (v) =>
      (!formato || (formato === "short" ? v.isShort : !v.isShort)) &&
      (!canal || v.channel.id === canal) &&
      (!etapa || (etapa === "completo" ? hasDiag(v) && hasComments(v) : etapa === "sem-diagnostico" ? !hasDiag(v) : !hasComments(v))) &&
      (!text || norm(`${v.title} ${v.channel.title}`).includes(norm(text))) &&
      (!semFormato || (hasDiag(v) && !inFormat.has(v.id))),
  );
  const pg = paginate(filtered, one(sp.page), PER_PAGE);
  const href = makeHref("/estudos", { formato, canal, etapa, receita: semFormato ? "sem" : undefined, q: text || undefined });
  const tags = await formatsByVideo(pg.slice.map((v) => v.id));
  const count = (f: (v: (typeof videos)[number]) => boolean) => videos.filter(f).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Estudos de vídeo"
        subtitle="Por que cada vídeo funcionou: transcrição, diagnóstico e comentários."
        actions={
          <div className="text-right text-xs text-zinc-500" title={`${spend.calls} chamadas ao Claude este mês`}>
            Gasto com o Claude no mês
            <div className="text-sm text-zinc-300 tabular-nums">
              US$ {spend.usd.toFixed(2).replace(".", ",")} <span className="text-zinc-500">≈ R$ {(spend.usd * usdToBrl()).toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        }
      />

      <Collapsible title="Estudar um vídeo pelo link" meta="para vídeos fora do radar" className="card p-4">
        <StudyLinkForm action={studyByLinkAction} />
      </Collapsible>

      {videos.length === 0 ? (
        <EmptyState
          title="Nenhum vídeo estudado ainda"
          action={
            <Link href="/radar" className="btn-primary">
              Abrir o radar
            </Link>
          }
        >
          No radar, clique em &ldquo;Estudar&rdquo; num vídeo que estourou. Ou cole um link acima.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <FilterRow label="Tipo">
                <FilterChip href={href({ formato: undefined, page: undefined })} active={!formato}>
                  Todos <span className="text-zinc-500">{videos.length}</span>
                </FilterChip>
                <FilterChip href={href({ formato: "short", page: undefined })} active={formato === "short"}>
                  Shorts <span className="text-zinc-500">{count((v) => v.isShort)}</span>
                </FilterChip>
                <FilterChip href={href({ formato: "long", page: undefined })} active={formato === "long"}>
                  Longos <span className="text-zinc-500">{count((v) => !v.isShort)}</span>
                </FilterChip>
              </FilterRow>
              <FilterRow label="Formato">
                <FilterChip href={href({ receita: undefined, page: undefined })} active={!semFormato}>
                  Todos
                </FilterChip>
                <FilterChip href={href({ receita: "sem", page: undefined })} active={semFormato}>
                  Estudados sem formato <span className="text-zinc-500">{count((v) => hasDiag(v) && !inFormat.has(v.id))}</span>
                </FilterChip>
              </FilterRow>
              <FilterRow label="Etapa">
                <FilterChip href={href({ etapa: undefined, page: undefined })} active={!etapa}>
                  Todas
                </FilterChip>
                <FilterChip href={href({ etapa: "completo", page: undefined })} active={etapa === "completo"}>
                  Completos <span className="text-zinc-500">{count((v) => hasDiag(v) && hasComments(v))}</span>
                </FilterChip>
                <FilterChip href={href({ etapa: "sem-diagnostico", page: undefined })} active={etapa === "sem-diagnostico"}>
                  Falta diagnóstico <span className="text-zinc-500">{count((v) => !hasDiag(v))}</span>
                </FilterChip>
                <FilterChip href={href({ etapa: "sem-comentarios", page: undefined })} active={etapa === "sem-comentarios"}>
                  Falta comentários <span className="text-zinc-500">{count((v) => !hasComments(v))}</span>
                </FilterChip>
              </FilterRow>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action="/estudos" className="flex items-center gap-2">
                {formato && <input type="hidden" name="formato" value={formato} />}
                {etapa && <input type="hidden" name="etapa" value={etapa} />}
                {semFormato && <input type="hidden" name="receita" value="sem" />}
                {text && <input type="hidden" name="q" value={text} />}
                <select name="canal" defaultValue={canal ?? ""} className="input w-48 py-1.5" aria-label="Canal">
                  <option value="">Todos os canais</option>
                  {channels.map(([id, t]) => (
                    <option key={id} value={id}>
                      {t}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary btn-sm">Filtrar</button>
              </form>
              <SearchBox action="/estudos" q={text} keep={{ formato, canal, etapa, receita: semFormato ? "sem" : undefined }} placeholder="Buscar título ou canal" />
            </div>
          </div>

          {pg.total === 0 ? (
            <EmptyState title="Nenhum estudo com esses filtros">
              <Link href="/estudos" className="link">
                Limpar filtros
              </Link>
            </EmptyState>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {pg.slice.map((v) => {
                const resumo = resumoOf(v.diagnosis?.content);
                const diag = hasDiag(v);
                const com = hasComments(v);
                return (
                  <Link key={v.id} href={`/video/${v.id}`} className="flex items-center gap-4 p-3 hover:bg-raised">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/mqdefault.jpg`}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded bg-zinc-800 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{v.title}</div>
                      <div className="text-xs text-zinc-500">
                        {v.channel.title} · {fmtCompact(v.viewCount)} views · {v.isShort ? "Short" : "longo"} · estudado em {fmtDateTime(new Date(last(v)))}
                      </div>
                      {resumo && <div className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{resumo}</div>}
                      {diag && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(tags.get(v.id) ?? []).map((t) => (
                            <span key={t.id} className="badge bg-violet-700/30 text-violet-200" title={`Nicho ${t.niche}`}>
                              Formato: {t.name}
                            </span>
                          ))}
                          {!tags.get(v.id) && <span className="text-[11px] text-zinc-500">sem formato · escolha na página do estudo</span>}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {diag && com ? (
                        <Badge tone="green">Completo</Badge>
                      ) : !diag ? (
                        <Badge tone="amber">Falta diagnóstico</Badge>
                      ) : (
                        <Badge tone="muted">Falta comentários</Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} label="estudos" href={(n) => href({ page: String(n) })} />
        </>
      )}
    </div>
  );
}
