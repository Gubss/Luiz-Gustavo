import type { Job } from "@prisma/client";

/** No lugar do botão enquanto a tarefa roda em segundo plano. */
export function RunningNote({ job, what }: { job: Job; what: string }) {
  const at = job.startedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
      <span>
        {what} em andamento (começou às {at}). Pode sair desta tela; esta página atualiza sozinha quando terminar.
      </span>
    </div>
  );
}
