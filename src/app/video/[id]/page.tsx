import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { channelUrl, videoUrl } from "@/lib/youtube";
import { fmtCompact, fmtDate, fmtDateTime, fmtInt, fmtMult } from "@/lib/format";
import { readSegments } from "@/lib/transcript";
import { computeStudyMetrics, type StudyMetrics } from "@/lib/study-metrics";
import { estimateDiagnosis, type DiagnosisContent } from "@/lib/diagnosis";
import { estimateComments, type CommentsAnalysis, type RawComment } from "@/lib/comments";
import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import type { VideoMetrics } from "@/lib/metrics";
import {
  commentsAction,
  deleteTranscriptAction,
  diagnoseAction,
  fetchTranscriptAction,
  pasteTranscriptAction,
  setStudyNicheAction,
  studyAllAction,
} from "../actions";
import { ActionButton, PasteTranscriptForm } from "./forms";
import { runningJobsFor } from "@/lib/jobs";
import { RunningNote } from "@/components/RunningNote";

const ts = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`);
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
const estimateHint = (e: CostEstimate) =>
  `${modelLabel(e.model)} · custo estimado ${usd(e.usd)} a ${usd(e.usdMax)} (≈ ${brl(e.usd)} a ${brl(e.usdMax)})`;

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function Section({ n, title, right, children }: { n: number; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="mr-2 text-zinc-500">{n}.</span>
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3" title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{hint}</div>}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
}

function MetricsPanel({ m, isShort, channel }: { m: StudyMetrics; isShort: boolean; channel?: VideoMetrics | null }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Duração" value={m.durationSec != null ? ts(m.durationSec) : "—"} />
        <Tile label="Palavras" value={fmtInt(m.wordCount)} />
        <Tile label="Palavras/s" value={m.wordsPerSec != null ? String(m.wordsPerSec).replace(".", ",") : "—"} hint={m.wordsPerMin ? `${m.wordsPerMin} por minuto` : undefined} />
        <Tile
          label="Ritmo"
          value={m.paceThirds ? m.paceThirds.map((x) => x.toFixed(1).replace(".", ",")).join(" · ") : "—"}
          hint="palavras/s no começo · meio · fim"
        />
        {m.beats ? (
          <>
            <Tile label="Algo novo a cada" value={m.beats.avgInterval != null ? `${String(m.beats.avgInterval).replace(".", ",")}s` : "—"} hint={`${m.beats.count} momentos novos`} />
            <Tile
              label="Maior buraco"
              value={m.beats.maxGap != null ? `${String(m.beats.maxGap).replace(".", ",")}s` : "—"}
              hint={m.beats.maxGapAt != null ? `sem novidade a partir de ${ts(m.beats.maxGapAt)}` : undefined}
            />
          </>
        ) : (
          <Tile label="Perguntas" value={String(m.questions)} hint="“?” na fala" />
        )}
      </div>
      {channel && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="x média do canal" value={fmtMult(channel.multAvg)} hint={`base: ${fmtCompact(channel.baseMedian)} views (${channel.baseCount} ${isShort ? "Shorts" : "longos"})`} />
          <Tile label="x inscritos" value={fmtMult(channel.multSubs)} />
          <Tile label="Views/dia" value={fmtCompact(channel.viewsPerDay)} />
          <Tile label="x velocidade" value={fmtMult(channel.velocityRatio)} hint="sobre a velocidade normal do canal" />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {m.opening && (
          <div className="rounded-lg border border-zinc-800 p-3 text-sm">
            <div className="mb-1 text-xs text-zinc-500">
              Abertura (primeiros {m.opening.seconds}s{m.firstWordAt != null ? ` · primeira fala em ${m.firstWordAt}s` : ""} · {m.opening.words} palavras)
            </div>
            <p className="text-zinc-200">{m.opening.text || "—"}</p>
          </div>
        )}
        {m.closing && (
          <div className="rounded-lg border border-zinc-800 p-3 text-sm">
            <div className="mb-1 text-xs text-zinc-500">
              Fecho (últimos {m.closing.seconds}s){m.closing.hasCta ? " · tem chamada (inscreva-se/comente/parte 2)" : " · sem chamada"}
              {m.closing.endsWithQuestion ? " · termina em pergunta" : ""}
            </div>
            <p className="text-zinc-200">{m.closing.text || "—"}</p>
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        Título: {m.title.chars} caracteres · {m.title.words} palavras
        {m.title.hasNumber && " · número"}
        {m.title.hasQuestion && " · pergunta"}
        {m.title.hasExclamation && " · exclamação"}
        {m.title.capsWords.length > 0 && ` · CAIXA ALTA (${m.title.capsWords.join(" ")})`}
        {m.title.secondPerson && " · fala com “você”"}
        {m.title.firstPerson && " · primeira pessoa"}
        {m.title.startsWithWhatIf && " · “E se…”"}
        {m.title.hasBrackets && " · parênteses/colchetes"}
        {m.title.emoji && " · emoji"}
      </div>
    </div>
  );
}

const CONF: Record<string, string> = { alta: "bg-emerald-600/30 text-emerald-300", média: "bg-amber-600/30 text-amber-300", baixa: "bg-zinc-700 text-zinc-300" };
const PART_LABEL: Record<string, string> = { gancho: "Gancho", virada: "Virada", desenvolvimento: "Desenvolvimento", climax: "Clímax", fecho: "Fecho" };

function DiagnosisView({ d, duration }: { d: DiagnosisContent; duration: number | null }) {
  return (
    <div className="space-y-6 text-sm">
      <p className="text-base text-zinc-200">{d.resumo}</p>

      <div>
        <H3>Por que funcionou (hipóteses)</H3>
        <ul className="space-y-2">
          {d.porqueFuncionou.map((h, i) => (
            <li key={i} className="rounded-lg border border-zinc-800 p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-zinc-100">{h.hipotese}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${CONF[h.confianca] ?? CONF.baixa}`}>confiança {h.confianca}</span>
              </div>
              <p className="mt-1 text-zinc-400">{h.evidencia}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <H3>Título</H3>
          <p className="rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-amber-300">{d.titulo.formula}</p>
          <p className="mt-2 text-xs text-zinc-500">Gatilhos: {d.titulo.gatilhos.join(", ")}</p>
          <p className="mt-1 text-zinc-300">{d.titulo.comentario}</p>
        </div>
        <div>
          <H3>Thumbnail</H3>
          <p className="text-zinc-300">{d.thumbnail.descricao}</p>
          <p className="mt-1 text-xs text-zinc-500">Elementos: {d.thumbnail.elementos.join(", ")}</p>
          <p className="mt-1 text-zinc-400">{d.thumbnail.relacaoComTitulo}</p>
        </div>
        <div>
          <H3>Gancho</H3>
          {d.gancho.texto && <blockquote className="border-l-2 border-red-500 pl-2 italic text-zinc-200">{d.gancho.texto}</blockquote>}
          <p className="mt-1 text-xs text-zinc-500">{d.gancho.tecnica}</p>
          <p className="mt-1 text-zinc-300">{d.gancho.comentario}</p>
        </div>
      </div>

      {d.estrutura && (
        <div>
          <H3>Esqueleto do roteiro</H3>
          {duration ? (
            <div className="mb-3 flex h-3 overflow-hidden rounded bg-zinc-800">
              {Object.entries(d.estrutura).map(([k, p], i) => (
                <div
                  key={k}
                  title={`${PART_LABEL[k]} ${ts(p.inicio)}–${ts(p.fim)}`}
                  className={["bg-red-500", "bg-amber-500", "bg-sky-600", "bg-fuchsia-500", "bg-emerald-500"][i]}
                  style={{ width: `${Math.max(1, ((p.fim - p.inicio) / duration) * 100)}%` }}
                />
              ))}
            </div>
          ) : null}
          <ol className="space-y-1">
            {Object.entries(d.estrutura).map(([k, p]) => (
              <li key={k} className="flex gap-3">
                <span className="w-32 shrink-0 text-zinc-500">
                  {PART_LABEL[k]} <span className="tabular-nums">{ts(p.inicio)}–{ts(p.fim)}</span>
                </span>
                <span className="text-zinc-200">{p.resumo}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {d.beats.length > 0 && (
        <div>
          <H3>Momentos que prendem ({d.beats.length})</H3>
          <ol className="max-h-80 space-y-1 overflow-y-auto pr-2">
            {d.beats.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-zinc-500">{ts(b.t)}</span>
                <span className="w-28 shrink-0 text-xs text-zinc-400">{b.tipo}</span>
                <span className="text-zinc-200">{b.texto}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {d.pontosDeRisco.length > 0 && (
        <div>
          <H3>Pontos de risco</H3>
          <ul className="space-y-1">
            {d.pontosDeRisco.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-zinc-500">{ts(p.t)}</span>
                <span className="text-zinc-300">{p.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H3>Como replicar</H3>
          <ul className="list-disc space-y-1 pl-5 text-zinc-200">
            {d.comoReplicar.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <H3>Temas derivados</H3>
          <ul className="list-disc space-y-1 pl-5 text-zinc-200">
            {d.temasDerivados.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <H3>{title}</H3>
      <ul className="list-disc space-y-1 pl-5 text-zinc-200">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function CommentsView({ c }: { c: CommentsAnalysis }) {
  return (
    <div className="space-y-5 text-sm">
      <p className="text-base text-zinc-200">{c.resumo}</p>
      {c.publico && <p className="text-zinc-400">Público: {c.publico}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H3>O que gostaram</H3>
          <ul className="space-y-2">
            {c.oQueGostaram.map((x, i) => (
              <li key={i}>
                <span className="text-zinc-200">{x.ponto}</span>
                <span className="block text-xs italic text-zinc-500">“{x.exemplo}”</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <H3>Críticas</H3>
          <ul className="space-y-2">
            {c.criticas.length === 0 && <li className="text-zinc-500">Nenhuma relevante.</li>}
            {c.criticas.map((x, i) => (
              <li key={i}>
                <span className="text-zinc-200">{x.ponto}</span>
                <span className="block text-xs italic text-zinc-500">“{x.exemplo}”</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <BulletList title="Perguntas do público" items={c.perguntas} />
        <BulletList title="Temas pedidos" items={c.pedidosDeTema} />
        <BulletList title="Ideias de vídeo" items={c.ideiasDeVideo} />
      </div>
      {c.frasesMarcantes.length > 0 && (
        <div>
          <H3>Comentários marcantes</H3>
          <ul className="space-y-1">
            {c.frasesMarcantes.map((f, i) => (
              <li key={i} className="text-zinc-300">
                “{f.texto}” <span className="text-xs text-zinc-500">· {fmtInt(f.likes)} likes</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function VideoStudyPage({ params }: PageProps<"/video/[id]">) {
  const { id } = await params;
  const v = await prisma.video.findUnique({
    where: { id },
    include: { channel: { include: { niches: { include: { niche: { select: { id: true, name: true } } } } } }, transcript: true, diagnosis: true },
  });
  if (!v) notFound();
  const channelNiches = v.channel.niches.map((nc) => nc.niche);
  const allNiches = channelNiches.length ? [] : await prisma.niche.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const s = await getSettings();

  const segs = readSegments(v.transcript?.segments);
  const diag = v.diagnosis;
  const content = parse<DiagnosisContent>(diag?.content);
  const savedMetrics = parse<StudyMetrics & { channel?: VideoMetrics | null }>(diag?.metrics);
  const liveMetrics = v.transcript
    ? computeStudyMetrics({ title: v.title, isShort: v.isShort, durationSec: v.durationSec, segments: segs, text: v.transcript.text })
    : null;
  // Se a transcrição mudou depois do diagnóstico, mostra as medidas atuais (sem os beats antigos).
  const transcriptNewer = !!(v.transcript && diag?.diagnosedAt && v.transcript.updatedAt > diag.diagnosedAt);
  const metrics = savedMetrics && !transcriptNewer ? savedMetrics : liveMetrics;
  const comments = parse<CommentsAnalysis>(diag?.commentsAnalysis);
  const rawComments = parse<RawComment[]>(diag?.commentsRaw) ?? [];
  const [diagEst, comEst, jobs] = await Promise.all([estimateDiagnosis(v.id), estimateComments(v.id), runningJobsFor([v.id])]);
  const studyJob = jobs.find((j) => j.kind === "study");
  const diagJob = studyJob ?? jobs.find((j) => j.kind === "diagnosis");
  const comJob = studyJob ?? jobs.find((j) => j.kind === "comments");
  const allDone = !!v.transcript && !!diag?.content && !!diag?.commentsAnalysis;
  const noKey = !s.anthropicApiKey;
  const url = videoUrl(v.externalId, v.isShort);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/estudos" className="text-sm text-zinc-400 hover:text-white">
        ← Estudos
      </Link>

      <header className="card flex flex-col gap-5 p-5 md:flex-row">
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/hqdefault.jpg`}
            alt=""
            className={`rounded-lg bg-zinc-800 object-cover ${v.isShort ? "h-56 w-40" : "w-full md:w-80"}`}
          />
        </a>
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className="text-xl font-bold leading-snug">{v.title}</h1>
          <a href={channelUrl(v.channel)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            {v.channel.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.channel.thumbnailUrl} alt="" className="h-6 w-6 rounded-full" />
            )}
            {v.channel.title} · {v.channel.subscriberCount != null ? `${fmtCompact(v.channel.subscriberCount)} inscritos` : "inscritos ocultos"}
          </a>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300">
            <span>{fmtInt(v.viewCount)} views</span>
            <span>{fmtInt(v.likeCount)} likes</span>
            <span>{fmtInt(v.commentCount)} comentários</span>
            <span>{v.isShort ? "Short" : "Vídeo longo"}{v.durationSec != null ? ` · ${ts(v.durationSec)}` : ""}</span>
            <span>publicado {fmtDate(v.publishedAt)}</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={url} target="_blank" rel="noreferrer" className="btn-secondary">
              Abrir no YouTube ↗
            </a>
          </div>
          <div className="text-sm text-zinc-400">
            {channelNiches.length ? (
              <>
                Entra na cartilha de:{" "}
                {channelNiches.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && ", "}
                    <Link href={`/cartilha?niche=${n.id}&format=${v.isShort ? "short" : "long"}`} className="text-red-400 hover:underline">
                      {n.name}
                    </Link>
                  </span>
                ))}{" "}
                <span className="text-xs text-zinc-500">({v.isShort ? "Shorts" : "vídeos longos"}, pelo nicho do canal)</span>
              </>
            ) : allNiches.length ? (
              <form action={setStudyNicheAction.bind(null, v.id)} className="flex flex-wrap items-center gap-2">
                <label htmlFor="studyNiche">Entra na cartilha de:</label>
                <select id="studyNiche" name="nicheId" defaultValue={v.studyNicheId ?? ""} className="input w-auto py-1">
                  <option value="">nenhum nicho</option>
                  {allNiches.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost">Salvar</button>
                <span className="text-xs text-zinc-500">O canal deste vídeo não está em nenhum nicho; escolha para o estudo contar na cartilha.</span>
              </form>
            ) : null}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            {studyJob ? (
              <RunningNote job={studyJob} what={`Estudo completo · ${studyJob.step ?? ""}`} />
            ) : diagJob || comJob ? (
              <p className="text-xs text-zinc-500">Tem uma etapa rodando abaixo; o “Estudar tudo” libera quando ela terminar.</p>
            ) : (
              <ActionButton
                action={studyAllAction.bind(null, v.id)}
                label={allDone ? "Estudar tudo de novo" : "Estudar tudo (transcrição → diagnóstico → comentários)"}
                busy="Começando…"
                hint={`Um clique só, em segundo plano. ${modelLabel(diagEst.model)} + ${modelLabel(comEst.model)}: custo estimado ${usd(diagEst.usd + comEst.usd)} a ${usd(diagEst.usdMax + comEst.usdMax)}${rawComments.length ? "" : " · comentários usam 2 unidades de cota"}`}
                className={allDone ? "btn-secondary" : "btn-primary"}
              />
            )}
            <p className="mt-1 text-xs text-zinc-500">Ou faça uma etapa de cada vez nos botões abaixo.</p>
          </div>
          {noKey && (
            <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
              Falta a chave da Anthropic: coloque <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> e reinicie o app (feche o
              terminal e rode <code>npm run dev</code> de novo). A transcrição funciona sem ela.
            </p>
          )}
        </div>
      </header>

      {/* 1. Transcrição */}
      <Section
        n={1}
        title="Transcrição"
        right={
          v.transcript && (
            <span className="text-xs text-zinc-500">
              {fmtInt(v.transcript.wordCount)} palavras · {v.transcript.language} ·{" "}
              {v.transcript.source === "youtube"
                ? v.transcript.trackKind === "asr"
                  ? "legenda automática do YouTube"
                  : "legenda do YouTube"
                : v.transcript.source === "manual"
                  ? "colada à mão"
                  : `importada${v.transcript.importSource ? ` (${v.transcript.importSource})` : ""}`}{" "}
              · {fmtDateTime(v.transcript.updatedAt)}
            </span>
          )
        }
      >
        {!v.transcript && (
          <ActionButton
            action={fetchTranscriptAction.bind(null, v.id)}
            label="Buscar legenda do YouTube"
            busy="Buscando legenda…"
            hint="Grátis e não gasta cota. Se o vídeo não tiver legenda, cole a transcrição abaixo."
          />
        )}
        {v.transcript && (
          <details className="rounded-lg border border-zinc-800">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-300">Ver transcrição</summary>
            <div className="max-h-96 space-y-0.5 overflow-y-auto px-3 pb-3 text-sm">
              {segs.length
                ? segs.map((sg, i) => (
                    <p key={i}>
                      <a href={`https://www.youtube.com/watch?v=${v.externalId}&t=${Math.floor(sg.start)}s`} target="_blank" rel="noreferrer" className="mr-2 tabular-nums text-zinc-500 hover:text-red-400">
                        {ts(sg.start)}
                      </a>
                      <span className="text-zinc-200">{sg.text}</span>
                    </p>
                  ))
                : <p className="whitespace-pre-line text-zinc-200">{v.transcript.text}</p>}
            </div>
          </details>
        )}
        <details className="rounded-lg border border-zinc-800" open={!v.transcript ? undefined : false}>
          <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">
            {v.transcript ? "Trocar pela transcrição colada à mão" : "Colar transcrição à mão"}
          </summary>
          <div className="space-y-3 px-3 pb-3">
            <p className="text-xs text-zinc-500">
              No YouTube: abaixo do vídeo, clique em “…mais” → “Mostrar transcrição”, selecione tudo no painel, copie e cole aqui.
            </p>
            <PasteTranscriptForm action={pasteTranscriptAction.bind(null, v.id)} defaultLang={v.transcript?.language ?? v.defaultLang?.split("-")[0] ?? "pt"} />
            {v.transcript && (
              <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-3">
                <ActionButton action={fetchTranscriptAction.bind(null, v.id)} label="Buscar de novo no YouTube" busy="Buscando…" className="btn-ghost" />
                <form action={deleteTranscriptAction.bind(null, v.id)}>
                  <button className="btn-danger">Apagar transcrição</button>
                </form>
              </div>
            )}
          </div>
        </details>
      </Section>

      {/* 2. Diagnóstico */}
      <Section
        n={2}
        title="Diagnóstico"
        right={
          diag?.diagnosedAt && (
            <span className="text-xs text-zinc-500">
              {modelLabel(diag.model)} · {fmtDateTime(diag.diagnosedAt)} · custou {usd(diag.costUsd)}
              {!diag.usedTranscript && " · sem transcrição"}
            </span>
          )
        }
      >
        {metrics && (
          <div>
            <H3>Medidas (calculadas, não são opinião do Claude)</H3>
            <MetricsPanel m={metrics} isShort={v.isShort} channel={savedMetrics?.channel} />
          </div>
        )}
        {transcriptNewer && <p className="text-xs text-amber-300">A transcrição mudou depois deste diagnóstico. Gere de novo para atualizar os momentos e o esqueleto.</p>}
        {content ? (
          <>
            <div className="border-t border-zinc-800 pt-4">
              <DiagnosisView d={content} duration={metrics?.durationSec ?? v.durationSec} />
            </div>
            {diag?.markdown && (
              <details className="rounded-lg border border-zinc-800">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar (Markdown)</summary>
                <textarea readOnly rows={14} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={diag.markdown} />
              </details>
            )}
          </>
        ) : diag?.markdown ? (
          <div className="whitespace-pre-line rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">{diag.markdown}</div>
        ) : null}
        <div className="border-t border-zinc-800 pt-4">
          {!v.transcript && (
            <p className="mb-3 text-sm text-amber-300">
              Sem transcrição o diagnóstico olha só título, thumbnail e números (sem esqueleto e sem ritmo). Pegue a transcrição primeiro, se der.
            </p>
          )}
          {diagJob ? (
            <RunningNote job={diagJob} what="Diagnóstico" />
          ) : (
            <ActionButton
              action={diagnoseAction.bind(null, v.id)}
              label={content ? "Gerar diagnóstico de novo" : "Gerar diagnóstico"}
              busy="Começando…"
              hint={`${estimateHint(diagEst)} · roda em segundo plano (até 2 min)`}
              className={content ? "btn-secondary" : "btn-primary"}
            />
          )}
        </div>
      </Section>

      {/* 3. Comentários */}
      <Section
        n={3}
        title="Comentários"
        right={
          diag?.commentsAnalyzedAt && (
            <span className="text-xs text-zinc-500">
              {rawComments.length} comentários lidos · {modelLabel(diag.commentsModel)} · {fmtDateTime(diag.commentsAnalyzedAt)} · custou {usd(diag.commentsCostUsd)}
            </span>
          )
        }
      >
        {comments && <CommentsView c={comments} />}
        <div className={comments ? "border-t border-zinc-800 pt-4" : ""}>
          {comJob ? (
            <RunningNote job={comJob} what="Análise dos comentários" />
          ) : (
            <ActionButton
              action={commentsAction.bind(null, v.id)}
              label={comments ? "Analisar de novo" : "Ler e analisar comentários"}
              busy="Começando…"
              hint={`${rawComments.length ? `${rawComments.length} já baixados · ` : "Lê os 200 mais relevantes (2 unidades de cota) · "}${estimateHint(comEst)}`}
              className={comments ? "btn-secondary" : "btn-primary"}
            />
          )}
        </div>
      </Section>
    </div>
  );
}
