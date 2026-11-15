import Link from "next/link";
import { Chevron, Collapsible } from "@/components/ui";
import { WorkSection } from "@/components/workflow";
import { ClampText } from "@/components/ui-client";
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
import { CompareWithPlaybook } from "@/components/CompareWithPlaybook";
import { StateForm } from "@/components/StateForm";
import { confirmSuggestionAction, setVideoFormatAction } from "@/app/formatos/actions";
import { latestPlaybook, type PlaybookStats } from "@/lib/playbook";

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

/** Etapa do estudo: bloco que abre e fecha e lembra o estado no navegador. */
function Section({ n, id, title, right, open, children }: { n: number; id: string; title: string; right?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <WorkSection id={id} title={`${n} · ${title}`} open={open}>
      {right && <div className="-mt-2">{right}</div>}
      {children}
    </WorkSection>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-raised p-3" title={hint}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{hint}</div>}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-zinc-300">{children}</h3>;
}

function MetricsPanel({ m, isShort, channel }: { m: StudyMetrics; isShort: boolean; channel?: VideoMetrics | null }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Duração" value={m.durationSec != null ? ts(m.durationSec) : "—"} />
        <Tile label="Palavras" value={fmtInt(m.wordCount)} />
        <Tile label="Palavras/s" value={m.wordsPerSec != null ? String(m.wordsPerSec).replace(".", ",") : "—"} hint="Velocidade da fala. Perto de 3 é rápido, bom para Short." />
        <Tile
          label="Ritmo"
          value={m.paceThirds ? m.paceThirds.map((x) => x.toFixed(1).replace(".", ",")).join(" · ") : "—"}
          hint="Velocidade no começo · meio · fim"
        />
        {m.beats ? (
          <>
            <Tile label="Algo novo a cada" value={m.beats.avgInterval != null ? `${String(m.beats.avgInterval).replace(".", ",")}s` : "—"} hint={`De quanto em quanto tempo acontece algo novo (${m.beats.count} momentos). Menor prende mais.`} />
            <Tile
              label="Maior buraco"
              value={m.beats.maxGap != null ? `${String(m.beats.maxGap).replace(".", ",")}s` : "—"}
              hint={m.beats.maxGapAt != null ? `Trecho mais longo sem novidade, a partir de ${ts(m.beats.maxGapAt)}. É onde o público pode sair.` : undefined}
            />
          </>
        ) : (
          <Tile label="Perguntas" value={String(m.questions)} hint="“?” na fala" />
        )}
      </div>
      {channel && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="x média do canal" value={fmtMult(channel.multAvg)} hint={`Quantas vezes mais views que o normal do canal (${fmtCompact(channel.baseMedian)} em ${channel.baseCount} ${isShort ? "Shorts" : "longos"}). Acima de 3x é um estouro.`} />
          <Tile label="x inscritos" value={fmtMult(channel.multSubs)} hint="Views ÷ inscritos. Acima de 1x: passou de quem já segue." />
          <Tile label="Views/dia" value={fmtCompact(channel.viewsPerDay)} hint="Média por dia desde que saiu." />
          <Tile label="x velocidade" value={fmtMult(channel.velocityRatio)} hint="Rapidez comparada ao normal do canal." />
        </div>
      )}
      <Collapsible title={<span className="text-sm">Abertura, fecho e título medidos</span>} bodyClassName="mt-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {m.opening && (
          <div className="rounded-lg border border-line p-3 text-sm">
            <div className="mb-1 text-xs text-zinc-500">
              Abertura (primeiros {m.opening.seconds}s{m.firstWordAt != null ? ` · primeira fala em ${m.firstWordAt}s` : ""} · {m.opening.words} palavras)
            </div>
            <p className="text-zinc-200">{m.opening.text || "—"}</p>
          </div>
        )}
        {m.closing && (
          <div className="rounded-lg border border-line p-3 text-sm">
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
      </Collapsible>
    </div>
  );
}

const CONF: Record<string, string> = { alta: "bg-emerald-600/30 text-emerald-300", média: "bg-amber-600/30 text-amber-300", baixa: "bg-zinc-700 text-zinc-300" };
const PART_LABEL: Record<string, string> = { gancho: "Gancho", virada: "Virada", desenvolvimento: "Desenvolvimento", climax: "Clímax", fecho: "Fecho" };

function DiagnosisView({ d, duration }: { d: DiagnosisContent; duration: number | null }) {
  const box = "rounded-lg border border-line p-4";
  return (
    <div className="space-y-4 text-sm">
      <div>
        <H3>Por que funcionou</H3>
        <ul className="space-y-1.5">
          {d.porqueFuncionou.map((h, i) => (
            <li key={i} className="rounded-lg border border-line">
              <details className="group">
                <summary className="flex items-start gap-2 px-3 py-2 hover:bg-raised">
                  <span className="mt-1">
                    <Chevron />
                  </span>
                  <span className="min-w-0 flex-1 font-medium text-zinc-100">{h.hipotese}</span>
                  <span className={`badge shrink-0 ${CONF[h.confianca] ?? CONF.baixa}`}>confiança {h.confianca}</span>
                </summary>
                <p className="px-3 pb-3 pl-8 text-zinc-400">{h.evidencia}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>

      <Collapsible title="Título, thumbnail e gancho" className={box}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <H3>Título</H3>
            <p className="rounded bg-ink px-2 py-1 font-mono text-xs text-amber-200">{d.titulo.formula}</p>
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
            {d.gancho.texto && <blockquote className="border-l-2 border-red-500/70 pl-2 text-zinc-200 italic">{d.gancho.texto}</blockquote>}
            <p className="mt-1 text-xs text-zinc-500">{d.gancho.tecnica}</p>
            <p className="mt-1 text-zinc-300">{d.gancho.comentario}</p>
          </div>
        </div>
      </Collapsible>

      {(d.estrutura || d.beats.length > 0) && (
        <Collapsible title="Esqueleto do roteiro e momentos que prendem" meta={d.beats.length ? `${d.beats.length} momentos` : undefined} className={box} bodyClassName="mt-3 space-y-4">
          {d.estrutura && (
            <div>
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
                    <span className="w-12 shrink-0 text-zinc-500 tabular-nums">{ts(b.t)}</span>
                    <span className="w-28 shrink-0 text-xs text-zinc-400">{b.tipo}</span>
                    <span className="text-zinc-200">{b.texto}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Collapsible>
      )}

      {(d.pontosDeRisco.length > 0 || d.temasDerivados.length > 0) && (
        <Collapsible title="Pontos de risco e temas derivados" className={box}>
          <div className="grid gap-4 md:grid-cols-2">
            {d.pontosDeRisco.length > 0 && (
              <div>
                <H3>Pontos de risco</H3>
                <ul className="space-y-1">
                  {d.pontosDeRisco.map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-12 shrink-0 text-zinc-500 tabular-nums">{ts(p.t)}</span>
                      <span className="text-zinc-300">{p.motivo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.temasDerivados.length > 0 && (
              <div>
                <H3>Temas derivados</H3>
                <ul className="list-disc space-y-1 pl-5 text-zinc-200">
                  {d.temasDerivados.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Collapsible>
      )}
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
      {c.publico && <ClampText lines={2} className="text-zinc-400">Público: {c.publico}</ClampText>}
      <Collapsible title="Ver o que o público disse" className="rounded-lg border border-line p-4" bodyClassName="mt-3 space-y-5">
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
      </Collapsible>
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

  // Vídeo de um canal meu? (para comparar com a cartilha e não misturar nas referências)
  const myChannel = await prisma.myChannel.findFirst({ where: { externalId: v.channel.externalId }, select: { id: true, name: true, nicheId: true } });
  const cmpNicheIds = [...new Set([...channelNiches.map((n) => n.id), v.studyNicheId, myChannel?.nicheId].filter((x): x is string => !!x))];
  // Formatos do vídeo (um por nicho) e opções para escolher
  const videoNicheIds = [...new Set([...channelNiches.map((n) => n.id), v.studyNicheId].filter((x): x is string => !!x))];
  const [inFormats, formatOptions, suggestions] = await Promise.all([
    prisma.formatVideo.findMany({ where: { videoId: v.id }, include: { format: { include: { recipes: { orderBy: { createdAt: "desc" }, take: 1 } } } } }),
    prisma.videoFormat.findMany({
      where: { nicheId: { in: videoNicheIds }, length: v.isShort ? "short" : "long" },
      orderBy: { createdAt: "asc" },
      include: { niche: { select: { name: true } }, _count: { select: { videos: true } } },
    }),
    prisma.formatSuggestion.findMany({ where: { videoId: v.id, nicheId: { in: videoNicheIds } }, include: { niche: { select: { name: true } } } }),
  ]);
  let cmp: { st: PlaybookStats; label: string; href: string } | null = null;
  for (const fv of inFormats) {
    const st = parse<PlaybookStats>(fv.format.recipes[0]?.stats);
    if (st) {
      cmp = { st, label: `receita do formato ${fv.format.name}`, href: `/formatos/${fv.format.id}` };
      break;
    }
  }
  for (const nid of cmp ? [] : cmpNicheIds) {
    const pb = await latestPlaybook(nid, v.isShort ? "short" : "long");
    const st = parse<PlaybookStats>(pb?.stats);
    if (pb && st) {
      const nn = await prisma.niche.findUnique({ where: { id: nid }, select: { name: true } });
      cmp = { st, label: `cartilha antiga de ${nn?.name ?? ""}`, href: `/cartilha?niche=${nid}&format=${v.isShort ? "short" : "long"}` };
      break;
    }
  }
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Views" value={fmtCompact(v.viewCount)} />
            {savedMetrics?.channel ? (
              <Tile label="x o normal do canal" value={fmtMult(savedMetrics.channel.multAvg)} />
            ) : (
              <Tile label="Likes" value={fmtCompact(v.likeCount)} />
            )}
            <Tile label={v.isShort ? "Short" : "Vídeo longo"} value={v.durationSec != null ? ts(v.durationSec) : "—"} />
            <Tile label="Publicado" value={fmtDate(v.publishedAt)} />
          </div>
          <p className="text-xs text-zinc-500">
            {fmtInt(v.likeCount)} likes · {fmtInt(v.commentCount)} comentários ·{" "}
            <a href={url} target="_blank" rel="noreferrer" className="underline hover:text-white">
              abrir no YouTube ↗
            </a>
          </p>
          {myChannel && (
            <p className="rounded-lg border border-sky-800 bg-sky-950/40 p-2 text-sm text-sky-200">
              Este vídeo é do seu canal <Link href={`/meus-canais/${myChannel.id}`} className="underline">{myChannel.name}</Link>. Não ponha em formato nem em nicho: as receitas são só das referências.
            </p>
          )}
          <Collapsible
            title={<span className="text-sm">Nicho e formato</span>}
            meta={inFormats.length ? inFormats.map((x) => x.format.name).join(", ") : suggestions.some((sg) => sg.status === "pending") ? "sugestão para conferir" : "sem formato"}
            open={suggestions.some((sg) => sg.status === "pending") || (!inFormats.length && !myChannel)}
            bodyClassName="mt-3 space-y-3"
          >
          <div className="text-sm text-zinc-400">
            {channelNiches.length ? (
              <>
                Conta no nicho:{" "}
                {channelNiches.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && ", "}
                    <Link href={`/formatos?niche=${n.id}&format=${v.isShort ? "short" : "long"}`} className="text-red-400 hover:underline">
                      {n.name}
                    </Link>
                  </span>
                ))}{" "}
                <span className="text-xs text-zinc-500">({v.isShort ? "Shorts" : "vídeos longos"}, pelo nicho do canal)</span>
              </>
            ) : allNiches.length ? (
              <form action={setStudyNicheAction.bind(null, v.id)} className="flex flex-wrap items-center gap-2">
                <label htmlFor="studyNiche">Conta no nicho:</label>
                <select id="studyNiche" name="nicheId" defaultValue={v.studyNicheId ?? ""} className="input w-auto py-1">
                  <option value="">nenhum nicho</option>
                  {allNiches.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost">Salvar</button>
                <span className="text-xs text-zinc-500">O canal deste vídeo não está em nenhum nicho; escolha para o estudo poder entrar num formato.</span>
              </form>
            ) : null}
          </div>
          {videoNicheIds.length > 0 && !myChannel && (
            <div id="formato" className="text-sm text-zinc-400">
              {suggestions.map((sg) => (
                <div key={sg.id} className={`mb-2 rounded-lg border px-3 py-2 ${sg.status === "pending" ? "border-violet-700/60 bg-violet-950/30" : "border-line"}`}>
                  <p>
                    <span className="text-zinc-400">Sugestão do Radar{suggestions.length > 1 ? ` em ${sg.niche.name}` : ""}:</span>{" "}
                    <span className="font-medium text-zinc-100">{sg.label}</span>{" "}
                    <span className="text-xs text-zinc-500">(confiança {sg.confidence})</span>
                    {sg.status !== "pending" && (
                      <span className="ml-2 text-xs text-zinc-500">{sg.status === "confirmed" ? "· confirmada" : `· você trocou por ${sg.chosen}`}</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-400">{sg.reason}</p>
                  {sg.status === "pending" && (
                    <div className="mt-1.5">
                      <ActionButton action={confirmSuggestionAction.bind(null, v.id, sg.nicheId)} label="Confirmar" busy="Gravando…" className="btn-secondary px-2 py-1 text-xs" hint="ou troque no campo abaixo" />
                    </div>
                  )}
                </div>
              ))}
              {diag?.content || diag?.markdown ? (
                formatOptions.length ? (
                  <StateForm action={setVideoFormatAction.bind(null, v.id, formatOptions[0].nicheId)} label="Salvar" className="btn-ghost" formClassName="flex flex-wrap items-center gap-2">
                    <label htmlFor="videoFormat">Formato:</label>
                    <select id="videoFormat" name="formatId" defaultValue={inFormats.find((x) => x.nicheId === formatOptions[0].nicheId)?.formatId ?? ""} className="input w-auto py-1">
                      <option value="">nenhum</option>
                      {formatOptions
                        .filter((o) => o.nicheId === formatOptions[0].nicheId)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({o._count.videos} {o._count.videos === 1 ? "vídeo" : "vídeos"})
                          </option>
                        ))}
                    </select>
                  </StateForm>
                ) : (
                  <span>
                    Formato: nenhum criado em {channelNiches[0]?.name ?? "este nicho"}.{" "}
                    <Link href={`/formatos?niche=${videoNicheIds[0]}&format=${v.isShort ? "short" : "long"}`} className="text-red-400 hover:underline">
                      Criar formato
                    </Link>
                  </span>
                )
              ) : (
                <span className="text-xs text-zinc-500">Depois do diagnóstico, dá para pôr este vídeo num formato do nicho.</span>
              )}
              {inFormats.length > 0 && (
                <span className="mt-1 block text-xs text-zinc-500">
                  Está em:{" "}
                  {inFormats.map((x, i) => (
                    <span key={x.formatId}>
                      {i > 0 && ", "}
                      <Link href={`/formatos/${x.formatId}`} className="text-violet-300 hover:underline">
                        {x.format.name}
                      </Link>
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          </Collapsible>
          <div className="rounded-lg border border-line bg-zinc-950/50 p-3">
            {studyJob ? (
              <RunningNote job={studyJob} what={`Estudo completo · ${studyJob.step ?? ""}`} />
            ) : diagJob || comJob ? (
              <p className="text-xs text-zinc-500">Tem uma etapa rodando abaixo; o “Estudar tudo” libera quando ela terminar.</p>
            ) : (
              <ActionButton
                action={studyAllAction.bind(null, v.id)}
                label={allDone ? "Estudar tudo de novo" : "Estudar este vídeo"}
                busy="Começando…"
                hint={`Legenda, diagnóstico e comentários num clique. Custo estimado ${usd(diagEst.usd + comEst.usd)} a ${usd(diagEst.usdMax + comEst.usdMax)}${rawComments.length ? "" : " e 2 de cota"}.`}
                className={allDone ? "btn-secondary" : "btn-primary"}
              />
            )}
            <p className="mt-1 text-xs text-zinc-500">Ou uma etapa de cada vez, nos blocos abaixo.</p>
          </div>
          {noKey && (
            <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
              Falta a chave da Anthropic: cole a chave em <Link href="/configuracoes#chaves" className="underline">Configurações</Link> (não precisa reiniciar). A transcrição funciona sem ela.
            </p>
          )}
        </div>
      </header>

      {content && (
        <section className="card space-y-3 p-5">
          <h2 className="text-base font-semibold">O que isso quer dizer pra você</h2>
          <ClampText lines={3} className="text-[15px] leading-relaxed text-zinc-200">
            {content.resumo}
          </ClampText>
          {content.comoReplicar.length > 0 && (
            <div className="rounded-lg bg-emerald-500/5 p-4 ring-1 ring-emerald-500/20">
              <h3 className="mb-2 text-sm font-semibold text-zinc-300">O que fazer agora (como repetir no seu canal)</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-200">
                {content.comoReplicar.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 1. Transcrição */}
      {cmp && metrics && (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">Comparado com a {cmp.label.startsWith("receita") ? "receita do formato" : "cartilha antiga"}</h2>
          <CompareWithPlaybook m={metrics} st={cmp.st} label={cmp.label} href={cmp.href} own={!!myChannel} />
        </section>
      )}
      <Section
        n={1}
        id="transcricao"
        title="Transcrição"
        open={!v.transcript}
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
          <details className="rounded-lg border border-line">
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
        <details className="rounded-lg border border-line" open={!v.transcript ? undefined : false}>
          <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">
            {v.transcript ? "Trocar pela transcrição colada à mão" : "Colar transcrição à mão"}
          </summary>
          <div className="space-y-3 px-3 pb-3">
            <p className="text-xs text-zinc-500">
              No YouTube: abaixo do vídeo, clique em “…mais” → “Mostrar transcrição”, selecione tudo no painel, copie e cole aqui.
            </p>
            <PasteTranscriptForm action={pasteTranscriptAction.bind(null, v.id)} defaultLang={v.transcript?.language ?? v.defaultLang?.split("-")[0] ?? "pt"} />
            {v.transcript && (
              <div className="flex flex-wrap gap-3 border-t border-line pt-3">
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
        id="diagnostico"
        title="Por que funcionou"
        open={!!v.transcript && !!diag?.content}
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
            <H3>Números medidos (contados no texto, não é opinião da IA)</H3>
            <MetricsPanel m={metrics} isShort={v.isShort} channel={savedMetrics?.channel} />
          </div>
        )}
        {transcriptNewer && <p className="text-xs text-amber-300">A transcrição mudou depois deste diagnóstico. Gere de novo para atualizar os momentos e o esqueleto.</p>}
        {content ? (
          <>
            <div className="border-t border-line pt-4">
              <DiagnosisView d={content} duration={metrics?.durationSec ?? v.durationSec} />
            </div>
            {diag?.markdown && (
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Texto para copiar (Markdown)</summary>
                <textarea readOnly rows={14} className="input m-3 w-[calc(100%-1.5rem)] font-mono text-xs" defaultValue={diag.markdown} />
              </details>
            )}
          </>
        ) : diag?.markdown ? (
          <div className="whitespace-pre-line rounded-lg border border-line p-4 text-sm text-zinc-200">{diag.markdown}</div>
        ) : null}
        <div className="border-t border-line pt-4">
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
        id="comentarios"
        title="O que o público disse"
        right={
          diag?.commentsAnalyzedAt && (
            <span className="text-xs text-zinc-500">
              {rawComments.length} comentários lidos · {modelLabel(diag.commentsModel)} · {fmtDateTime(diag.commentsAnalyzedAt)} · custou {usd(diag.commentsCostUsd)}
            </span>
          )
        }
      >
        {comments && <CommentsView c={comments} />}
        <div className={comments ? "border-t border-line pt-4" : ""}>
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
