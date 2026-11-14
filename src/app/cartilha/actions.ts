"use server";

import { revalidatePath } from "next/cache";
import { generatePlaybook, type PlaybookFormat } from "@/lib/playbook";
import { usdToBrl } from "@/lib/claude";
import type { FormState } from "@/app/video/actions";

const money = (usd: number) =>
  `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;

export async function generatePlaybookAction(nicheId: string, format: PlaybookFormat): Promise<FormState> {
  try {
    const r = await generatePlaybook(nicheId, format);
    revalidatePath("/cartilha");
    return { ok: `Cartilha pronta com ${r.playbook.diagnosisCount} ${r.playbook.diagnosisCount === 1 ? "estudo" : "estudos"}. Custo: ${money(r.costUsd)}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado." };
  }
}
