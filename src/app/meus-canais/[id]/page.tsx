import { AnalyticsOverview } from "@/components/AnalyticsOverview";
import { WorkSection } from "@/components/workflow";
import Link from "next/link";
import { Collapsible } from "@/components/ui";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtInt } from "@/lib/format";
import { CHANNEL_STATUS, PROFILE_FIELDS, profileGaps } from "@/lib/generator";
import { StateForm } from "@/components/StateForm";
import { ConfirmDelete } from "@/app/nichos/[id]/forms";
import { applyProfileImport, deleteMyChannelFromProfile, deleteScript, previewProfileImport, saveProfile, saveScript, syncMyVideosAction } from "../actions";
import { ProfileImport } from "./import";
import { estimateHint } from "@/app/meus-videos/ui";
import { applyProfileDraftAction, discardProfileDraftAction, profileFromChannelAction } from "@/app/meus-videos/actions";
import { estimateProfileFromChannel, profileDraft } from "@/lib/profile-from-channel";
import { parseProfileMd } from "@/lib/profile-md";
import { ActionButton } from "@/app/video/[id]/forms";
import { RunningNote } from "@/components/RunningNote";
import { runningJobsFor } from "@/lib/jobs";
import { estimateCatalogUnits } from "@/lib/my-catalog";
import { fmtCompact, fmtDate } from "@/lib/format";
import { deleteLessonAction } from "@/app/gerador/actions";

type FormatOption = { id: string; name: string; length: string; niche: { name: string } };

function ScriptFields({
  s,
  formats,
}: {
  s?: { title: string; url: string | null; views: number | null; script: string; notes: string | null; formatId: string | null };
  formats: FormatOption[];
}) {
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
        <label className="label">Formato que este roteiro segue</label>
        <select name="formatId" className="input w-auto" defaultValue={s?.formatId ?? ""}>
          <option value="">— nenhum marcado —</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.niche.name}, {f.length === "long" ? "longo" : "Short"})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          No gerador, só os roteiros do formato escolhido entram como amostra de voz (os de outro formato ficam de fora para não misturar).
        </p>
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
      include: {
        scripts: { orderBy: { createdAt: "asc" }, include: { format: { select: { name: true } } } },
        lessons: { orderBy: { createdAt: "desc" }, include: { idea: { select: { id: true, chosenTitle: true, theme: true } }, format: { select: { name: true } } } },
        _count: { select: { ideas: true } },
      },
    }),
    prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!c) notFound();
  // Formatos para marcar nos roteiros: os do nicho do canal primeiro.
  const formatOptions = (
    await prisma.videoFormat.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, length: true, nicheId: true, niche: { select: { name: true } } } })
  ).sort((a, b) => Number(b.nicheId === c.nicheId) - Number(a.nicheId === c.nicheId));
  const [videos, videoCount, job] = await Promise.all([
    prisma.myChannelVideo.findMany({ where: { myChannelId: c.id }, orderBy: { publishedAt: "desc" }, take: 300 }),
    prisma.myChannelVideo.count({ where: { myChannelId: c.id } }),
    runningJobsFor([c.id]).then((js) => js.find((j) => j.kind === "my-videos")),
  ]);
  const gaps = profileGaps(c, c.scripts.length);
  const [draft, profileJob, google] = await Promise.all([
    profileDraft(c.id),
    runningJobsFor([c.id]).then((js) => js.find((j) => j.kind === "profile-from-channel")),
    c.externalId ? prisma.googleAuth.findUnique({ where: { channelExternalId: c.externalId } }) : null,
  ]);
  const profileEst = (await prisma.myVideo.count({ where: { myChannelId: c.id } })) ? await estimateProfileFromChannel(c.id) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/meus-canais" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Meus canais
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-sm text-zinc-400">
            Resultados primeiro; perfil e referências logo abaixo.
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
      <AnalyticsOverview channelId={c.id} />

      {gaps.length > 0 && (
        <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          Falta preencher: {gaps.join(", ")}. Dá para gerar assim mesmo, mas o resultado fica mais genérico.
        </p>
      )}

      <Collapsible
        title={<span className="text-base">Preencher o perfil automaticamente</span>}
        meta="pelos vídeos do canal ou pelo GPT"
        open={gaps.length > 0 || !!draft || !!profileJob}
        className="card p-5"
        bodyClassName="mt-4 space-y-5"
      >
      <div id="do-canal" className="space-y-4">
        <div>
          <h3 className="font-semibold">Pelos vídeos do canal</h3>
          <p className="text-sm text-zinc-400">
            O Radar lê os seus vídeos (títulos, descrições, legendas, views e, com o login do Google, retenção e % visto) e o Claude escreve o
            rascunho do perfil e dos roteiros publicados. Você vê a prévia e só salva se quiser. Lê em detalhe os 6 vídeos que mais deram view e os 6
            mais recentes.
            {google?.status === "ok" ? " Login do Google: conectado." : " Sem login do Google ainda: funciona só com os números públicos."}
          </p>
        </div>
        {profileJob ? (
          <RunningNote job={profileJob} what={`Perfil pelos vídeos do canal${profileJob.step ? ` · ${profileJob.step}` : ""}`} />
        ) : !c.externalId && !c.url ? (
          <p className="text-sm text-amber-300">Coloque a URL do canal no perfil abaixo (ou entre com o Google em Meus vídeos) primeiro.</p>
        ) : (
          <ActionButton
            action={profileFromChannelAction.bind(null, c.id)}
            label={draft ? "Gerar o rascunho de novo" : "Gerar perfil a partir do meu canal"}
            busy="Começando…"
            hint={profileEst ? `${estimateHint(profileEst)} · legendas grátis` : "Lê os vídeos do canal primeiro (grátis, poucas unidades de cota)"}
            className={draft ? "btn-secondary" : "btn-primary"}
          />
        )}
        {draft && (
          <div className="space-y-2 rounded-lg border border-emerald-800/60 bg-emerald-950/10 p-3">
            <p className="text-sm text-emerald-300">
              Rascunho de {fmtDate(new Date(draft.at))}. Confira a prévia e clique em “Importar e salvar no perfil”. Campos que o rascunho deixar vazios mantêm o
              que já está.
            </p>
            {draft.avisos.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-300">
                {draft.avisos.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <ProfileImport
              preview={previewProfileImport}
              apply={applyProfileDraftAction.bind(null, c.id)}
              initialText={draft.md}
              initialParsed={parseProfileMd(draft.md)}
            />
            <form action={discardProfileDraftAction.bind(null, c.id)}>
              <button className="btn-ghost px-2 py-1 text-xs">Descartar rascunho</button>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <div>
          <h3 className="font-semibold">Ou pelo GPT (Maestri)</h3>
          <p className="text-sm text-zinc-400">
            Em vez de preencher à mão: <b>1.</b> baixe o pedido, <b>2.</b> cole no GPT do Maestri que conhece este canal, <b>3.</b> salve a resposta
            como .md (ou copie) e importe aqui. Você vê a prévia antes de salvar.
            {c.profileImportedAt && ` Última importação: ${fmtDate(c.profileImportedAt)}.`}
          </p>
        </div>
        <a href={`/api/meus-canais/${c.id}/pedido-perfil`} className="btn-secondary" download>
          1. Baixar o pedido para o GPT (.md)
        </a>
        <ProfileImport preview={previewProfileImport} apply={applyProfileImport.bind(null, c.id)} />
      </div>

      </Collapsible>

      <WorkSection id="detail-1" title="Perfil do canal">
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
            <div className="md:col-span-2">
              <label className="label">Números do canal{c.analyticsAt ? ` (atualizado em ${fmtDate(c.analyticsAt)})` : ""}</label>
              <textarea
                name="analytics"
                rows={3}
                className="input"
                defaultValue={c.analytics ?? ""}
                placeholder="Cole do YouTube Studio / TikTok (ou venha pelo GPT): inscritos, views 28 dias, retenção, % continuaram assistindo, vídeos que mais foram bem…"
              />
            </div>
          </div>
        </StateForm>
      </WorkSection>

      {c.lessons.length > 0 && (
        <WorkSection id="detail-2" title="Devoluções do Estúdio">
          <div>
            <h2 className="text-lg font-semibold">Devoluções do Estúdio ({c.lessons.length})</h2>
            <p className="text-sm text-zinc-400">
              Pontos em que roteiros foram reprovados antes de produzir. Entram em toda ideia e roteiro, com peso maior que a receita do formato.
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {c.lessons.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 rounded border border-line px-3 py-1.5">
                <span>
                  <span className="text-zinc-200">{l.text}</span>
                  <span className="block text-xs text-zinc-500">
                    {fmtDate(l.createdAt)}
                    {l.format && ` · formato ${l.format.name}`}
                    {l.idea && (
                      <>
                        {" · "}
                        <Link href={`/ideias/${l.idea.id}`} className="hover:underline">
                          {l.idea.chosenTitle || l.idea.theme}
                        </Link>
                      </>
                    )}
                  </span>
                </span>
                <form action={deleteLessonAction.bind(null, l.id)}>
                  <button className="btn-ghost px-2 py-0.5 text-xs text-zinc-500 hover:text-red-400">tirar</button>
                </form>
              </li>
            ))}
          </ul>
        </WorkSection>
      )}

      <WorkSection id="detail-3" title="Roteiros aprovados">
        <div>
          <h2 className="text-lg font-semibold">Roteiros aprovados ({c.scripts.length})</h2>
          <p className="text-sm text-zinc-400">
            Amostra de voz do canal: tamanho das frases, ritmo, jeito dos personagens. O gerador lê até 5 do formato escolhido (os com mais views
            primeiro) para o ritmo, e avisa quando um roteiro novo repete uma frase ou bordão destes.
          </p>
        </div>
        {c.scripts.map((s) => (
          <details key={s.id} className="rounded-lg border border-line">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{s.title}</span>
              {s.views != null && <span className="text-xs text-zinc-500">{fmtInt(s.views)} views</span>}
              <span className="text-xs text-zinc-500">· {s.script.split(/\s+/).length} palavras</span>
              {s.format ? <span className="badge bg-violet-700/30 text-violet-200">Formato: {s.format.name}</span> : <span className="text-xs text-amber-300/80">sem formato marcado</span>}
            </summary>
            <div className="space-y-3 border-t border-line p-3">
              <StateForm action={saveScript.bind(null, c.id, s.id)} label="Salvar" className="btn-secondary">
                <ScriptFields s={s} formats={formatOptions} />
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
            <ScriptFields formats={formatOptions} />
          </StateForm>
        </div>
      </WorkSection>

      <WorkSection id="detail-4" title="Vídeos publicados">
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
          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-300">Ver a lista</summary>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">
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
      </WorkSection>

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
