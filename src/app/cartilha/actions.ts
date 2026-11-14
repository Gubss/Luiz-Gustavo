"use server";

import { revalidatePath } from "next/cache";
import { formatLabel, generatePlaybook, type PlaybookFormat } from "@/lib/playbook";
import { startJob } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import type { FormState } from "@/app/video/actions";

const money = (usd: number) =>
  `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;

export async function generatePlaybookAction(nicheId: string, format: PlaybookFormat): Promise<FormState> {
  try {
    const niche = await prisma.niche.findUniqueOrThrow({ where: { id: nicheId }, select: { name: true } });
    await startJob(
      { kind: "playbook", targetId: `${nicheId}:${format}`, label: `Cartilha: ${niche.name} (${formatLabel(format, true)})`, href: `/cartilha?niche=${nicheId}&format=${format}`, expectedSec: 100 },
      async () => {
        const r = await generatePlaybook(nicheId, format);
        return `${r.playbook.diagnosisCount} ${r.playbook.diagnosisCount === 1 ? "estudo" : "estudos"}. Custo: ${money(r.costUsd)}.`;
      },
    );
    revalidatePath("/cartilha");
    return { ok: "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado." };
  }
}
