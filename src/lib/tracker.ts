/**
 * Etapa 7 — tarefas dos meus vídeos (em segundo plano, com o aviso no canto da tela) e o acompanhamento automático.
 */
import { prisma } from "./db";
import { getSettings } from "./settings";
import { usdToBrl } from "./claude";
import { startJob } from "./jobs";
import { refreshChannelNow, refreshVideoNow, trackDue, type TrackSummary } from "./my-videos";
import { runChannelReport, runMyDiagnosis } from "./my-diagnosis";

const money = (usd: number) => `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;
const short = (t: string | null) => (!t ? "vídeo" : t.length > 50 ? t.slice(0, 48) + "…" : t);

/** Diagnóstico de um vídeo meu. `refreshFirst`: atualiza números e Analytics antes ("Atualizar agora e diagnosticar"). */
export async function startMyDiagnosisJob(myVideoId: string, opts: { trigger?: "auto" | "manual"; milestone?: number | null; refreshFirst?: boolean } = {}) {
  const v = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId }, select: { title: true } });
  const auto = opts.trigger === "auto";
  return startJob(
    {
      kind: "my-diagnosis",
      targetId: myVideoId,
      label: `${auto ? "Diagnóstico automático" : "Diagnóstico"}: ${short(v.title)}`,
      href: `/meus-videos/${myVideoId}`,
      expectedSec: opts.refreshFirst ? 80 : 65,
      step: opts.refreshFirst ? "Atualizando números (1 de 2)" : undefined,
    },
    async (report) => {
      let note = "";
      if (opts.refreshFirst) {
        note = await refreshVideoNow(myVideoId);
        await report(15, "Diagnóstico (2 de 2)");
      }
      const r = await runMyDiagnosis(myVideoId, { trigger: opts.trigger ?? "manual", milestone: opts.milestone ?? null });
      const c = JSON.parse(r.diagnosis.content) as { veredito: string };
      return `${c.veredito[0].toUpperCase()}${c.veredito.slice(1)}.${note ? ` ${note}.` : ""} Custo: ${money(r.costUsd)}.`;
    },
    ["my-refresh"],
  );
}

export async function startRefreshVideoJob(myVideoId: string) {
  const v = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId }, select: { title: true } });
  return startJob(
    { kind: "my-refresh", targetId: myVideoId, label: `Atualizando: ${short(v.title)}`, href: `/meus-videos/${myVideoId}`, expectedSec: 10 },
    async () => `${await refreshVideoNow(myVideoId)}.`,
    ["my-diagnosis"],
  );
}

export async function startRefreshChannelJob(myChannelId: string, full = false) {
  const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId }, select: { name: true } });
  return startJob(
    { kind: "my-channel-refresh", targetId: myChannelId, label: `Atualizando vídeos de ${c.name}`, href: `/meus-videos?canal=${myChannelId}`, expectedSec: full ? 60 : 25 },
    async () => `${await refreshChannelNow(myChannelId, { full })}.`,
  );
}

export async function startChannelReportJob(myChannelId: string, trigger: "auto" | "manual" = "manual") {
  const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId }, select: { name: true } });
  return startJob(
    { kind: "my-channel-report", targetId: myChannelId, label: `Diagnóstico do canal ${c.name}`, href: `/meus-videos?canal=${myChannelId}#canal`, expectedSec: 75 },
    async () => {
      const r = await runChannelReport(myChannelId, trigger);
      return `${r.report.videoCount} vídeos analisados. As lições já valem no Gerador. Custo: ${money(r.costUsd)}.`;
    },
    ["my-channel-refresh"],
  );
}

const WEEK = 7 * 86_400_000;

/**
 * Acompanhamento: números (sempre), Analytics (com login) e, nos canais com "diagnóstico automático" ligado,
 * diagnóstico em 24h, 3 dias e 7 dias + diagnóstico do canal 1 vez por semana (se houve diagnóstico novo).
 */
export async function runTracker(): Promise<TrackSummary> {
  const s = await getSettings();
  const canDiagnose = !!s.anthropicApiKey;
  const sum = await trackDue({
    onDiagnose: canDiagnose
      ? async (id, milestone) => {
          try {
            await startMyDiagnosisJob(id, { trigger: "auto", milestone });
            return true;
          } catch {
            return false; // já tem tarefa rodando nesse vídeo
          }
        }
      : undefined,
  });
  if (canDiagnose) {
    for (const c of await prisma.myChannel.findMany({ where: { autoDiagnose: true } })) {
      const last = await prisma.myChannelReport.findFirst({ where: { myChannelId: c.id }, orderBy: { createdAt: "desc" } });
      if (last && Date.now() - last.createdAt.getTime() < WEEK) continue;
      const newDiag = await prisma.myVideoDiagnosis.count({ where: { myVideo: { myChannelId: c.id }, ...(last ? { createdAt: { gt: last.createdAt } } : {}) } });
      if (newDiag < 2) continue;
      try {
        await startChannelReportJob(c.id, "auto");
        sum.diagnoses++;
      } catch {
        /* já rodando */
      }
    }
  }
  return sum;
}
