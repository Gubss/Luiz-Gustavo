import Link from "next/link";
import { Collapsible, Help, PageHeader } from "@/components/ui";
import { ClampText } from "@/components/ui-client";
import { FilterChip } from "@/components/ui";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fmtCompact, fmtDateTime, fmtInt } from "@/lib/format";
import { googleConfigured } from "@/lib/google";
import { ageHours, checkpointLabel, checkpointTolerance, fmtAge, peerStats } from "@/lib/my-videos";
import { estimateChannelReport, type ChannelReportContent, type MyDiagnosisContent } from "@/lib/my-diagnosis";
import { runningJobsFor } from "@/lib/jobs";
import { getSettings } from "@/lib/settings";
import { RunningNote } from "@/components/RunningNote";
import { StateForm } from "@/components/StateForm";
import { ActionButton } from "@/app/video/[id]/forms";
import {
  channelReportAction,
  disconnectGoogleAction,
  importAnalyticsFileAction,
  linkChannelAction,
  refreshChannelAction,
  saveAnalyticsNotesAction,
  setAutoDiagnoseAction,
} from "./actions";
import { estimateHint, parse, ratioClass, VerdictBadge } from "./ui";

const SHOWN_CHECKPOINTS = [1, 3, 24, 48, 72, 168];

const Chip = FilterChip;

function GoogleBanner({ status, msg }: { status?: string; msg?: string }) {
  if (!status) return null;
  if (status === "ok") return <p className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm text-emerald-200">{msg ?? "Conectado."} Os números do Analytics chegam no próximo “Atualizar agora”.</p>;
  if (status === "sem-config")
    return (
      <p className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
        Falta criar o login do Google: coloque GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env e reinicie o app (passo a passo no README, seção “Meus vídeos”).
      </p>
    );
  return <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">Não deu para entrar com o Google: {msg ?? "erro desconhecido"}</p>;
}

type VideoRow = Prisma.MyVideoGetPayload<{ include: { checkpoints: true; diagnoses: true } }>;

function Row({ v, all, now }: { v: VideoRow; all: VideoRow[]; now: Date }) {
  const age = ageHours(v.publishedAt, now) ?? 0;
  // normal do canal sem o próprio vídeo (mesma regra da página do vídeo)
  const peers = peerStats(all, v.isShort, v.id, now);
  const ratio = peers.baseMedian && v.viewCount != null ? v.viewCount / peers.baseMedian : null;
  const d = parse<MyDiagnosisContent>(v.diagnoses[0]?.content);
  const pct = v.avgViewPercent != null && v.avgViewPercent > 0 ? v.avgViewPercent : null;
  return (
    <tr className="border-t border-line align-middle">
      <td className="py-2 pr-4">
        <Link href={`/meus-videos/${v.id}`} className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.externalId}/mqdefault.jpg`} alt="" className={`shrink-0 rounded bg-zinc-800 object-cover ${v.isShort ? "h-14 w-9" : "h-12 w-20"}`} />
          <span className="min-w-0">
            <span className="line-clamp-2 block font-medium hover:text-red-400">{v.title ?? v.externalId}</span>
            <span className="block text-xs text-zinc-500">
              {fmtAge(age)} de vida · {v.isShort ? "Short" : "longo"}
              {v.inspiredIdeaId ? " · do gerador" : ""}
            </span>
          </span>
        </Link>
      </td>
      <td className="w-24 py-2 pr-4 text-right tabular-nums">
        <div className="font-medium">{fmtInt(v.viewCount)}</div>
        <div className={`text-xs ${ratioClass(ratio)}`}>{ratio != null ? `${ratio.toFixed(1)}x o normal` : ""}</div>
      </td>
      {SHOWN_CHECKPOINTS.map((h) => {
        const cp = v.checkpoints.find((x) => x.ageHours === h);
        const med = peers.byCheckpoint[h]?.median;
        const r = cp?.viewCount != null && med ? cp.viewCount / med : null;
        const est = cp?.source === "analytics";
        const notYet = age < h - checkpointTolerance(h);
        const title =
          cp?.viewCount != null
            ? `${est ? "estimado pelas views por dia do Analytics" : "medido pelo app"}${med != null ? ` · normal do canal em ${checkpointLabel(h)}: ${fmtInt(med)}` : ""}`
            : notYet
              ? `o vídeo ainda não fez ${checkpointLabel(h)}`
              : h < 24
                ? "o app não estava acompanhando nessa hora (o YouTube não guarda views por hora)"
                : "ainda sem dado do Analytics para essa idade";
        return (
          <td key={h} className={`w-16 border-l border-line/60 py-2 text-center text-xs tabular-nums ${ratioClass(r)}`} title={title}>
            {cp?.viewCount != null ? (
              <>
                {est && <span className="text-zinc-500">≈</span>}
                {fmtCompact(cp.viewCount)}
              </>
            ) : notYet ? (
              <span className="text-zinc-800">·</span>
            ) : (
              <span className="text-zinc-600">—</span>
            )}
          </td>
        );
      })}
      <td
        className="w-16 border-l border-line/60 py-2 text-center text-xs tabular-nums"
        title={pct != null && pct > 100 ? "acima de 100% = gente assistindo mais de uma vez (loop)" : "% médio do vídeo assistido (YouTube Analytics)"}
      >
        {pct != null ? `${pct.toFixed(0)}%` : <span className="text-zinc-600">—</span>}
      </td>
      <td className="w-36 py-2 pl-4 text-xs">{d ? <VerdictBadge v={d.veredito} /> : <span className="text-zinc-600">—</span>}</td>
    </tr>
  );
}

function VideosTable({ rows, all, now }: { rows: VideoRow[]; all: VideoRow[]; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="font-normal" colSpan={2} />
            <th className="border-l border-line/60 pb-1 text-center font-normal text-zinc-400" colSpan={SHOWN_CHECKPOINTS.length}>
              Views com…
            </th>
            <th className="font-normal" colSpan={2} />
          </tr>
          <tr>
            <th className="pb-2 text-left font-normal">Vídeo</th>
            <th className="pb-2 pr-4 text-right font-normal">Views agora</th>
            {SHOWN_CHECKPOINTS.map((h) => (
              <th key={h} className="border-l border-line/60 pb-2 text-center font-normal">
                {h < 24 ? checkpointLabel(h) : h === 24 ? "1 dia" : h === 48 ? "2 dias" : `${Math.round(h / 24)} dias`}
              </th>
            ))}
            <th className="border-l border-line/60 pb-2 text-center font-normal" title="% médio do vídeo assistido (YouTube Analytics)">
              % visto
            </th>
            <th className="pb-2 pl-4 text-left font-normal">Diagnóstico</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <Row key={v.id} v={v} all={all} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MyVideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const channels = await prisma.myChannel.findMany({ orderBy: { createdAt: "asc" } });
  const s = await getSettings();

  if (!channels.length)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Meus vídeos</h1>
        <GoogleBanner status={one(sp.google)} msg={one(sp.msg)} />
        <p className="text-zinc-400">
          Cadastre seu canal em{" "}
          <Link href="/meus-canais" className="text-red-400 hover:underline">
            Meus canais
          </Link>{" "}
          ou{" "}
          <a href="/api/google/login" className="text-red-400 hover:underline">
            entre com o Google
          </a>{" "}
          (o canal é criado sozinho).
        </p>
      </div>
    );

  const c = channels.find((x) => x.id === one(sp.canal)) ?? channels[0];
  const [videos, google, report, jobs, diagCount] = await Promise.all([
    prisma.myVideo.findMany({
      where: { myChannelId: c.id },
      orderBy: { publishedAt: "desc" },
      include: { checkpoints: true, diagnoses: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    c.externalId ? prisma.googleAuth.findUnique({ where: { channelExternalId: c.externalId } }) : null,
    prisma.myChannelReport.findFirst({ where: { myChannelId: c.id }, orderBy: { createdAt: "desc" } }),
    runningJobsFor([c.id]),
    prisma.myVideoDiagnosis.count({ where: { myVideo: { myChannelId: c.id } } }),
  ]);
  const est = videos.length ? await estimateChannelReport(c.id) : null;
  const refreshJob = jobs.find((j) => j.kind === "my-channel-refresh");
  const reportJob = jobs.find((j) => j.kind === "my-channel-report");
  const rc = parse<ChannelReportContent>(report?.content);
  const now = new Date();
  const recent = videos.filter((v) => (ageHours(v.publishedAt, now) ?? 0) <= 30 * 24);
  const older = videos.filter((v) => (ageHours(v.publishedAt, now) ?? 0) > 30 * 24);
  const showAll = one(sp.todos) === "1";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Meus vídeos"
        subtitle="Como cada vídeo seu está indo comparado com o normal do canal, e por quê."
        help={
          <p>
            Acompanha cada vídeo do seu canal em 1h, 3h, 24h, 48h, 3 dias e 7 dias, compara com o normal do próprio canal na mesma idade e explica por
            que deu certo ou não (gancho, retenção, título, cartilha). As lições vão direto para o Gerador.
          </p>
        }
      />

      <GoogleBanner status={one(sp.google)} msg={one(sp.msg)} />

      {channels.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {channels.map((x) => (
            <Chip key={x.id} href={`/meus-videos?canal=${x.id}`} active={x.id === c.id}>
              {x.name}
            </Chip>
          ))}
        </div>
      )}

      <section className="card grid gap-5 p-5 md:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {c.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.thumbnailUrl} alt="" className="h-12 w-12 rounded-full" />
            )}
            <div>
              <div className="text-lg font-semibold">{c.name}</div>
              <div className="text-xs text-zinc-500">
                {c.externalId ? `${c.title ?? ""}${c.subscriberCount != null ? ` · ${fmtCompact(c.subscriberCount)} inscritos` : ""} · ${videos.length} vídeos lidos` : "ainda não ligado ao YouTube"}
                {c.syncedAt ? ` · conferido ${fmtDateTime(c.syncedAt)}` : ""}
              </div>
            </div>
          </div>
          {!c.externalId ? (
            <StateForm action={linkChannelAction.bind(null, c.id)} label="Ligar ao canal" busy="Procurando…">
              <input name="url" className="input" defaultValue={c.url ?? ""} placeholder="https://www.youtube.com/@seucanal" />
              <p className="text-xs text-zinc-500">Cole o link do canal (1–2 unidades de cota) ou entre com o Google ao lado.</p>
            </StateForm>
          ) : refreshJob ? (
            <RunningNote job={refreshJob} what="Atualização" />
          ) : (
            <ActionButton
              action={refreshChannelAction.bind(null, c.id)}
              label="↻ Atualizar agora"
              busy="Começando…"
              hint={`Vídeos novos + números de todos${google?.status === "ok" ? " + Analytics" : ""}. Grátis (≈ ${2 + Math.ceil(videos.length / 50)} unidades de cota).`}
              className="btn-secondary"
            />
          )}
          <Link href={`/meus-canais/${c.id}#do-canal`} className="text-sm text-red-400 hover:underline">
            Gerar o perfil do canal a partir destes vídeos →
          </Link>
          <p className="text-xs text-zinc-500">
            Com o app aberto, ele confere sozinho a cada 5 minutos (vídeo novo, marcos de 1h, 3h, 24h…). Com o app fechado, use o <code>npm run track</code> no
            Agendador de Tarefas (README).
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-zinc-950/50 p-4 text-sm">
          <div className="font-medium">YouTube Analytics (retenção, % visto, de onde vieram as views)</div>
          {google?.status === "ok" ? (
            <div className="space-y-2">
              <p className="text-emerald-300">✓ Conectado como {google.channelTitle} (só leitura).</p>
              <form action={disconnectGoogleAction.bind(null, c.id)}>
                <button className="btn-ghost px-2 py-1 text-xs">Sair (apaga o acesso salvo)</button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              {google?.status === "expired" && <p className="text-amber-300">O login expirou. Entre de novo.</p>}
              <a href={`/api/google/login?canal=${c.id}`} className="btn-primary">
                Entrar com Google
              </a>
              <p className="text-xs text-zinc-500">
                Abre a tela do próprio Google (o app nunca vê sua senha) e pede permissão só para LER o YouTube e o Analytics. Sem isso, o diagnóstico usa os
                números públicos e o que você colar do Studio.
                {!googleConfigured() && " Antes, crie o login do Google (passo a passo no README)."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="card space-y-4 p-5" id="canal">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Diagnóstico do canal</h2>
            <p className="text-sm text-zinc-400">O que os seus vídeos que foram bem têm em comum, o que os que foram mal têm em comum e o que da cartilha funciona no seu canal.</p>
          </div>
        </header>
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-72 flex-1">
            {reportJob ? (
              <RunningNote job={reportJob} what="Diagnóstico do canal" />
            ) : est ? (
              <ActionButton
                action={channelReportAction.bind(null, c.id)}
                label={rc ? "Refazer diagnóstico do canal" : "Fazer diagnóstico do canal"}
                busy="Começando…"
                hint={`${est.videos} vídeos · ${estimateHint(est)}${!s.anthropicApiKey ? " · falta a chave da Anthropic" : ""}`}
                className={rc ? "btn-secondary" : "btn-primary"}
              />
            ) : (
              <p className="text-sm text-zinc-500">Ligue o canal e atualize para ler os vídeos.</p>
            )}
          </div>
          <form action={setAutoDiagnoseAction.bind(null, c.id)} className="max-w-md space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="auto" defaultChecked={c.autoDiagnose} className="h-4 w-4 accent-red-600" />
              Diagnóstico automático
              <button className="btn-ghost px-2 py-0.5 text-xs">Salvar</button>
            </label>
            <p className="text-xs text-zinc-500">
              Faz sozinho o diagnóstico de cada vídeo novo com 24h, 3 dias e 7 dias de vida, e o do canal 1 vez por semana. Cada um custa como o botão (≈ US$
              0,05 a 0,20). No máximo {s.autoDiagnoseMaxPerDay} por dia (muda em <Link href="/configuracoes#automatico" className="underline">Configurações</Link>). Precisa do app aberto. {c.autoDiagnose ? "Está LIGADO." : "Está desligado."}
            </p>
          </form>
        </div>
        <details className="rounded-lg border border-dashed border-zinc-700">
          <summary className="cursor-pointer px-3 py-2 text-sm">
            Reserva sem login do Google: números colados do canal (Studio, Maestri/GPT)
            {c.analytics ? ` · colados em ${fmtDateTime(c.analyticsAt)} (o que o app mede agora vale mais)` : ""}
          </summary>
          <div className="grid gap-4 border-t border-line p-3 md:grid-cols-[2fr_1fr]">
            <StateForm action={saveAnalyticsNotesAction.bind(null, c.id)} label="Salvar" className="btn-secondary">
              <textarea
                name="analyticsNotes"
                rows={6}
                className="input font-mono text-xs"
                defaultValue={c.analytics ?? ""}
                placeholder={"Sem login do Google (ou para complementar), cole aqui os números do canal: por vídeo, views, % visto, continuaram assistindo, CTR…\nExemplo:\nPuxei um fiozinho — 21.000 views · continuaram assistindo 78% · % visto 92%\nVulcão na escola — 800 views · continuaram assistindo 55%"}
              />
            </StateForm>
            <StateForm action={importAnalyticsFileAction.bind(null, c.id)} label="Importar arquivo" className="btn-secondary">
              <input type="file" name="file" accept=".md,.txt,.csv" className="text-sm text-zinc-400" />
              <p className="text-xs text-zinc-500">Um .md ou .txt (ex.: o relatório que o GPT do Maestri gera). Substitui o texto ao lado. O diagnóstico do canal e o de cada vídeo leem esses números.</p>
            </StateForm>
          </div>
        </details>
        {rc && report && (
          <div className="space-y-4 border-t border-line pt-4 text-sm">
            <p className="text-xs text-zinc-500">
              {fmtDateTime(report.createdAt)} · {report.videoCount} vídeos · {report.trigger === "auto" ? "automático" : "manual"} · {diagCount} diagnósticos de vídeo até agora
            </p>
            <ClampText lines={4} className="text-[15px] leading-relaxed text-zinc-200">
              {rc.resumo}
            </ClampText>
            <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3">
              <h3 className="mb-1 text-xs font-semibold text-red-300">Lições que o Gerador vai seguir</h3>
              <ul className="list-disc space-y-1 pl-5">
                {rc.licoesParaRoteiros.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
            <Collapsible
              title="O que funciona, o que não funciona e a cartilha no seu canal"
              meta={`${rc.padroesQueFuncionam.length} funcionam · ${rc.padroesQueNaoFuncionam.length} não`}
              className="rounded-lg border border-line p-4"
              bodyClassName="mt-3 space-y-4"
            >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-emerald-400">O que funciona no seu canal</h3>
                <ul className="space-y-1">
                  {rc.padroesQueFuncionam.map((p, i) => (
                    <li key={i}>
                      <b>{p.padrao}</b> <span className="text-zinc-400">— {p.evidencia}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-red-400">O que não funciona</h3>
                <ul className="space-y-1">
                  {rc.padroesQueNaoFuncionam.map((p, i) => (
                    <li key={i}>
                      <b>{p.padrao}</b> <span className="text-zinc-400">— {p.evidencia}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {rc.cartilhaNoMeuCanal.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold text-zinc-400">Cartilha × seu canal</h3>
                <ul className="space-y-1">
                  {rc.cartilhaNoMeuCanal.map((x, i) => (
                    <li key={i}>
                      <span className={x.status === "confirmado" ? "text-emerald-300" : x.status === "contrariado" ? "text-red-300" : "text-zinc-500"}>
                        {x.status === "confirmado" ? "✓" : x.status === "contrariado" ? "✗" : "?"} {x.item}
                      </span>{" "}
                      <span className="text-zinc-400">— {x.evidencia}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </Collapsible>
            {rc.proximosTestes.length > 0 && (
              <Collapsible title={`Próximos testes (${rc.proximosTestes.length})`} className="rounded-lg border border-line p-4">
                <ul className="list-disc space-y-1 pl-5 text-zinc-300">
                  {rc.proximosTestes.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Últimos 30 dias ({recent.length})</h2>
        <Help label="Como ler a tabela">
          Cada coluna é o número de views naquela idade. Verde = bem acima do normal do canal na mesma idade; vermelho = abaixo. “≈” = estimado pelas views por
          dia do Analytics. “—” = o app não estava acompanhando naquela hora (1h e 3h só existem para vídeos publicados com o app aberto ou agendado). “·” = o vídeo
          ainda não chegou nessa idade. Passe o mouse para ver o normal.
        </Help>
        {recent.length ? <VideosTable rows={recent} all={videos} now={now} /> : <p className="text-sm text-zinc-500">Nenhum vídeo nos últimos 30 dias.</p>}
      </section>

      {older.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">Mais antigos ({older.length})</h2>
          <VideosTable rows={showAll ? older : older.slice(0, 20)} all={videos} now={now} />
          {!showAll && older.length > 20 && (
            <Link href={`/meus-videos?canal=${c.id}&todos=1`} className="text-sm text-red-400 hover:underline">
              Mostrar todos
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
