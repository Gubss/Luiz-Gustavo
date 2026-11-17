"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/video/actions";
import { saveEditedReport } from "@/lib/my-diagnosis";
import { startChannelReportJob } from "@/lib/tracker";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

function refresh(myChannelId: string) {
  revalidatePath(`/meus-canais/${myChannelId}/diagnostico`);
  revalidatePath("/meus-videos");
}

export async function updateDiagnosisAction(myChannelId: string): Promise<FormState> {
  try {
    await startChannelReportJob(myChannelId);
    refresh(myChannelId);
    return { ok: "Começou em segundo plano (até 3 min). Esta página atualiza sozinha quando terminar." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Adendo A: salva o texto editado como um diagnóstico novo no histórico ("editado por você"). */
export async function saveEditedDiagnosisAction(myChannelId: string, reportId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const row = await saveEditedReport(reportId, String(fd.get("texto") ?? ""));
    id = row.id;
    refresh(myChannelId);
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/meus-canais/${myChannelId}/diagnostico?d=${id}`);
}
