import { IDEA_DELETE_BLOCKED, isIdeaDeleteProtected } from "@/lib/delete-idea";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import { KEEP_IDEA_IDS, cleanupPreview } from "@/lib/cleanup";
import { backupDir, listBackups } from "@/lib/backup";
import { IDEA_STATUS } from "@/lib/idea-status";
import { StateForm } from "@/components/StateForm";
import { EmptyState, FilterChip, FilterRow, PageHeader, one, type SP } from "@/components/ui";
import { cleanupAction } from "../actions";

function firstTitle(json: string) {
  try {
    const t = JSON.parse(json) as (string | { titulo?: string })[];
    const x = t[0];
    return typeof x === "string" ? x : (x?.titulo ?? "");
  } catch {
    return "";
  }
}

export default async function CleanupPage({ searchParams }: PageProps<"/formatos/limpeza">) {
  const sp: SP = await searchParams;
  const niches = await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!niches.length)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Limpeza: cartilha antiga e ideias sem formato" />
        <EmptyState title="Nenhum nicho ainda" />
      </div>
    );
  const niche = niches.find((n) => n.id === one(sp.niche)) ?? niches.find((n) => /3d|anima/i.test(n.name)) ?? niches[0];
  const { playbooks, ideas, keep } = await cleanupPreview(niche.id);
  const lastBackup = listBackups()[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Limpeza: cartilha antiga e ideias sem formato"
        subtitle="Apaga a cartilha antiga do nicho e as ideias e roteiros feitos antes dos formatos. Antes de apagar, o Radar faz a cópia de segurança do banco; se a cópia falhar, nada é apagado."
        actions={
          <Link href={`/formatos?niche=${niche.id}`} className="btn-ghost">
            ← Formatos do nicho
          </Link>
        }
      />

      <FilterRow label="Nicho">
        {niches.map((n) => (
          <FilterChip key={n.id} href={`/formatos/limpeza?niche=${n.id}`} active={n.id === niche.id}>
            {n.name}
          </FilterChip>
        ))}
      </FilterRow>

      <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        Não se apagam: os estudos ({keep.studies} diagnósticos, com vídeos e transcrições), os roteiros aprovados do perfil ({keep.scripts}), os formatos e
        as receitas. Ideias com formato, aprovadas, produzidas ou publicadas também ficam.
      </p>

      <StateForm action={cleanupAction.bind(null, niche.id)} label="Fazer a cópia de segurança e apagar" busy="Copiando e apagando…" className="btn-primary bg-red-700 hover:bg-red-600" formClassName="space-y-5">
        <section className="card space-y-2">
          <h2 className="font-semibold">Cartilha antiga de {niche.name}</h2>
          {playbooks.length ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="playbooks" defaultChecked className="mt-1" />
              <span>
                Apagar as {playbooks.length} {playbooks.length === 1 ? "versão" : "versões"}:{" "}
                <span className="text-zinc-400">
                  {playbooks.map((p) => `${formatLabel(p.format as PlaybookFormat, true)} de ${fmtDateTime(p.createdAt)} (${p.diagnosisCount} estudos)`).join(" · ")}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-zinc-400">Nenhuma cartilha antiga neste nicho.</p>
          )}
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold">Ideias e roteiros sem formato ({ideas.length})</h2>
          {ideas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma ideia sem formato neste nicho.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {ideas.map((i) => {
                const protectedIdea = isIdeaDeleteProtected(i);
                const kept = KEEP_IDEA_IDS.includes(i.id) || protectedIdea;
                const title = i.chosenTitle || firstTitle(i.titles) || i.theme;
                return (
                  <li key={i.id} className={`flex items-start gap-3 px-3 py-2 text-sm ${kept ? "bg-emerald-950/20" : ""}`}>
                    <input type="checkbox" name="idea" value={i.id} defaultChecked={!kept} disabled={kept} className="mt-1" aria-label={`Apagar ${title}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/ideias/${i.id}`} className="text-zinc-100 hover:underline">
                        {title}
                      </Link>
                      <div className="text-xs text-zinc-500">
                        {IDEA_STATUS[i.status] ?? i.status} · {i.script || i.scriptData ? "com roteiro" : "sem roteiro"} · {i.myChannel?.name ?? "sem canal"} ·{" "}
                        {fmtDateTime(i.createdAt)}
                        {kept && <span className="text-emerald-300"> · {protectedIdea ? IDEA_DELETE_BLOCKED : "fica (a ideia dos balões)"}</span>}
                        {!kept && (i.publishedVideoId || i._count.myVideos > 0) && (
                          <span className="text-amber-300"> · ligada a vídeo do canal: o vídeo fica, só perde o vínculo com a ideia</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-2 text-sm">
          <p className="text-xs text-zinc-500">
            A cópia vai para <code>{backupDir()}</code>
            {lastBackup ? ` (a mais nova hoje: ${lastBackup.name})` : ""}. Para voltar uma cópia, veja Configurações → Cópia de segurança.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirm" />
            <span>Entendi: o que está marcado acima vai ser apagado depois da cópia de segurança.</span>
          </label>
        </div>
      </StateForm>
    </div>
  );
}
