import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtInt } from "@/lib/format";
import { CHANNEL_STATUS, PROFILE_FIELDS, profileGaps } from "@/lib/generator";
import { StateForm } from "@/components/StateForm";
import { ConfirmDelete } from "@/app/nichos/[id]/forms";
import { deleteMyChannelFromProfile, deleteScript, saveProfile, saveScript, syncMyVideosAction } from "../actions";
import { ActionButton } from "@/app/video/[id]/forms";
import { RunningNote } from "@/components/RunningNote";
import { runningJobsFor } from "@/lib/jobs";
import { estimateCatalogUnits } from "@/lib/my-catalog";
import { fmtCompact, fmtDate } from "@/lib/format";

function ScriptFields({ s }: { s?: { title: string; url: string | null; views: number | null; script: string; notes: string | null } }) {
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr]">
      <div>
        <label className="label">Título do vídeo</label>
        <input name="title" required className="input" defaultValue={s?.title} placeholder="Ex.: O Theo jurou que o T-Rex rugia" />
      </div>
      <div>
        <label className="label">Link (opcional)</label>
        <input name="url" className="input" defaultValue={s?.url ?? ""} placeholder="https://youtube.com/shorts/…" />
      </div>
      <div>
        <label className="label">Views (opcional)</label>
        <input name="views" inputMode="numeric" className="input" defaultValue={s?.views ?? ""} placeholder="12000" />
      </div>
      <div className="md:col-span-3">
        <label className="label">Roteiro</label>
        <textarea
          name="script"
          rows={s ? 10 : 7}
          className="input font-mono text-xs"
          defaultValue={s?.script}
          placeholder={"Cole o roteiro como você escreveu. Ex.:\nTHEO (correndo pela sala): Pai! O T-Rex rugia igual um leão!\nPAI (sem tirar o olho do jornal): Será, filho?\n…"}
        />
      </div>
      <div className="md:col-span-3">
        <label className="label">O que funcionou / o que não funcionou (opcional)</label>
        <input name="notes" className="input" defaultValue={s?.notes ?? ""} placeholder="Ex.: retenção caiu quando a explicação do pai ficou longa" />
      </div>
    </div>
  );
}

export default async function MyChannelProfilePage({ params }: PageProps<"/meus-canais/[id]">) {
  const { id } = await params;
  const [c, niches] = await Promise.all([
    prisma.myChannel.findUnique({
      where: { id },
      include: { scripts: { orderBy: { createdAt: "asc" } }, _count: { select: { ideas: true } } },
    }),
    prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!c) notFound();
  const [videos, videoCount, job] = await Promise.all([
    prisma.myChannelVideo.findMany({ where: { myChannelId: c.id }, orderBy: { publishedAt: "desc" }, take: 300 }),
    prisma.myChannelVideo.count({ where: { myChannelId: c.id } }),
    runningJobsFor([c.id]).then((js) => js.find((j) => j.kind === "my-videos")),
  ]);
  const gaps = profileGaps(c, c.scripts.length);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/meus-canais" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Meus canais
          </Link>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <p className="text-sm text-zinc-400">
            Perfil do canal. Quanto mais claro, melhor o gerador traduz o que funciona no nicho para o seu formato.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/ideias?canal=${c.id}`} className="btn-secondary">
            Ideias ({c._count.ideas})
          </Link>
          <Link href={`/gerador?canal=${c.id}`} className="btn-primary">
            Gerar ideias e roteiros
          </Link>
        </div>
      </header>

      {gaps.length > 0 && (
        <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          Falta preencher: {gaps.join(", ")}. Dá para gerar assim mesmo, mas o resultado fica mais genérico.
        </p>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">Perfil</h2>
        <StateForm action={saveProfile.bind(null, c.id)} label="Salvar perfil">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Nome</label>
              <input name="name" required className="input" defaultValue={c.name} />
            </div>
            <div>
              <label className="label">URL</label>
              <input name="url" className="input" defaultValue={c.url ?? ""} placeholder="https://www.youtube.com/@meucanal" />
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" className="input" defaultValue={c.status}>
                {Object.entries(CHANNEL_STATUS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nicho (de onde vem a cartilha)</label>
              <select name="nicheId" className="input" defaultValue={c.nicheId ?? ""}>
                <option value="">— sem nicho —</option>
                {niches.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Formato principal</label>
              <select name="format" className="input" defaultValue={c.format}>
                <option value="short">Shorts</option>
                <option value="long">Vídeos longos</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Plataformas</label>
                <input name="platforms" className="input" defaultValue={c.platforms ?? ""} placeholder="YouTube, TikTok" />
              </div>
              <div>
                <label className="label">Duração alvo (s)</label>
                <input name="durationSec" inputMode="numeric" className="input" defaultValue={c.durationSec ?? ""} placeholder="45" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.key} className={f.rows >= 3 ? "md:col-span-2" : ""}>
                <label className="label">{f.label}</label>
                <textarea name={f.key} rows={f.rows} className="input" defaultValue={(c[f.key] as string | null) ?? ""} placeholder={f.placeholder} />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="label">Outras notas</label>
              <textarea name="notes" rows={2} className="input" defaultValue={c.notes ?? ""} />
            </div>
          </div>
        </StateForm>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Roteiros que já publiquei ({c.scripts.length})</h2>
          <p className="text-sm text-zinc-400">
            O gerador lê até 5 deles (os com mais views primeiro) para copiar a voz do canal: tamanho das falas, jeito dos personagens, como
            começa e termina.
          </p>
        </div>
        {c.scripts.map((s) => (
          <details key={s.id} className="rounded-lg border border-zinc-800">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{s.title}</span>
              {s.views != null && <span className="text-xs text-zinc-500">{fmtInt(s.views)} views</span>}
              <span className="text-xs text-zinc-500">· {s.script.split(/\s+/).length} palavras</span>
            </summary>
            <div className="space-y-3 border-t border-zinc-800 p-3">
              <StateForm action={saveScript.bind(null, c.id, s.id)} label="Salvar" className="btn-secondary">
                <ScriptFields s={s} />
              </StateForm>
              <form action={deleteScript.bind(null, c.id, s.id)}>
                <button className="btn-ghost px-2 py-1 text-xs">Excluir este roteiro</button>
              </form>
            </div>
          </details>
        ))}
        <div className="rounded-lg border border-dashed border-zinc-700 p-4">
          <h3 className="mb-3 text-sm font-semibold">Adicionar roteiro</h3>
          <StateForm action={saveScript.bind(null, c.id, null)} label="Adicionar roteiro" className="btn-secondary">
            <ScriptFields />
          </StateForm>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Vídeos que o canal já publicou ({videoCount})</h2>
          <p className="text-sm text-zinc-400">
            Lidos do YouTube pela URL do canal. O gerador recebe esses títulos e não sugere um tema que você já fez (mesmo que o vídeo antigo seja
            2D ou tenha outro título), e marca &ldquo;seu canal já fez algo parecido&rdquo; quando a ideia bate com um deles.
            {c.catalogFetchedAt && ` Última leitura: ${fmtDate(c.catalogFetchedAt)}.`}
          </p>
        </div>
        {job ? (
          <RunningNote job={job} what="Leitura dos vídeos do canal" />
        ) : (
          <ActionButton
            action={syncMyVideosAction.bind(null, c.id)}
            label={videoCount ? "Ler de novo (pega os vídeos novos)" : "Ler os vídeos do meu canal"}
            busy="Começando…"
            hint={c.url || c.externalId ? `~${estimateCatalogUnits(videoCount || null)} unidades de cota · em segundo plano` : "Coloque a URL do canal no perfil acima e salve."}
            className={videoCount ? "btn-secondary" : "btn-primary"}
          />
        )}
        {videos.length > 0 && (
          <details className="rounded-lg border border-zinc-800">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-300">Ver a lista</summary>
            <ul className="max-h-96 divide-y divide-zinc-800 overflow-y-auto text-sm">
              {videos.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-1.5">
                  <a href={`https://www.youtube.com/watch?v=${v.externalId}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-red-400">
                    {v.title}
                  </a>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {v.isShort === true ? "Short" : v.isShort === false ? "longo" : ""} · {fmtCompact(v.viewCount)} views · {fmtDate(v.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="flex justify-end">
        <ConfirmDelete
          action={deleteMyChannelFromProfile.bind(null, c.id)}
          label="Excluir este canal"
          message={`Excluir "${c.name}" e os roteiros cadastrados? As ideias ficam guardadas, sem canal.`}
        />
      </div>
    </div>
  );
}
