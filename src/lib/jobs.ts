/**
 * Tarefas em segundo plano. Uma chamada ao Claude leva de 30s a 3 min; se ela rodasse dentro da ação do botão,
 * o Next.js seguraria a navegação até terminar (a tela "presa"). Aqui o botão só cria a tarefa e volta na hora;
 * o trabalho continua no servidor local e o aviso no canto da tela mostra quando terminou.
 */
import { prisma } from "./db";
import { withQuotaSource } from "./quota";

/** Tarefa "rodando" há mais que isso foi interrompida (app fechado no meio). */
const STALE_MS = 15 * 60_000;

export class JobBusyError extends Error {}

async function expireStale() {
  await prisma.job.updateMany({
    where: { status: "running", startedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "error", message: "Interrompida (o app foi fechado no meio?). Tente de novo.", finishedAt: new Date() },
  });
}

export async function runningJob(kinds: string | string[], targetId: string) {
  await expireStale();
  return prisma.job.findFirst({
    where: { kind: { in: Array.isArray(kinds) ? kinds : [kinds] }, targetId, status: "running" },
    orderBy: { startedAt: "desc" },
  });
}

/** Avança a barra: progress 0-100 e o nome da etapa. */
export type Report = (progress: number | null, step?: string) => Promise<void>;

/** Tarefas rodando para um alvo (para a página mostrar "em andamento" no lugar do botão). */
export async function runningJobsFor(targetIds: string[]) {
  await expireStale();
  return prisma.job.findMany({ where: { targetId: { in: targetIds }, status: "running" } });
}

/**
 * Cria a tarefa e dispara o trabalho sem esperar. `work` devolve a mensagem de sucesso.
 * Não deixa rodar duas vezes a mesma tarefa no mesmo alvo.
 */
export async function startJob(
  job: { kind: string; targetId: string; label: string; href: string; expectedSec?: number; step?: string },
  work: (report: Report) => Promise<string>,
  /** Outras tarefas no mesmo alvo que não podem rodar junto (ex.: "estudar tudo" × "diagnóstico"). */
  conflicts: string[] = [],
): Promise<{ id: string }> {
  const busy = await runningJob([job.kind, ...conflicts], job.targetId);
  if (busy) throw new JobBusyError(`Já tem uma tarefa rodando aqui (${busy.label}). Espere terminar.`);
  const row = await prisma.job.create({ data: job });
  const report: Report = async (progress, step) => {
    await prisma.job
      .update({
        where: { id: row.id },
        data: { progress: progress == null ? null : Math.max(0, Math.min(100, Math.round(progress))), ...(step !== undefined ? { step } : {}) },
      })
      .catch(() => {});
  };
  // a cota do YouTube gasta dentro da tarefa fica registrada com o tipo dela (tela Configurações)
  void withQuotaSource(job.kind, async () => {
    try {
      const message = await work(report);
      await prisma.job.update({ where: { id: row.id }, data: { status: "ok", message, finishedAt: new Date() } });
    } catch (e) {
      await prisma.job
        .update({ where: { id: row.id }, data: { status: "error", message: e instanceof Error ? e.message : String(e), finishedAt: new Date() } })
        .catch(() => {});
    }
  });
  return { id: row.id };
}

/** Para o aviso no canto: tarefas rodando + as que terminaram nos últimos minutos. */
export async function jobsSummary(sinceMs = 10 * 60_000) {
  await expireStale();
  return prisma.job.findMany({
    where: { OR: [{ status: "running" }, { finishedAt: { gte: new Date(Date.now() - sinceMs) } }] },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
}
