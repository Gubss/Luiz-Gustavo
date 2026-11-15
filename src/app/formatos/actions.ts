"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import { startJob } from "@/lib/jobs";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import { FormatError, MAX_FORMAT_VIDEOS, generateRecipe, generateRule, setVideoFormat } from "@/lib/formats";
import type { FormState } from "@/app/video/actions";

const money = (usd: number) => `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar.";

function refresh(formatId?: string) {
  revalidatePath("/formatos");
  if (formatId) revalidatePath(`/formatos/${formatId}`);
  revalidatePath("/gerador");
  revalidatePath("/estudos");
}

export async function createFormatAction(nicheId: string, length: PlaybookFormat, _prev: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Dê um nome ao formato (ex.: desastre em cadeia)." };
  const f = await prisma.videoFormat.create({
    data: { nicheId, length, name: name.slice(0, 80), description: String(fd.get("description") ?? "").trim() || null },
  });
  refresh();
  redirect(`/formatos/${f.id}`);
}

export async function updateFormatAction(formatId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "O nome não pode ficar vazio." };
  await prisma.videoFormat.update({
    where: { id: formatId },
    data: { name: name.slice(0, 80), description: String(fd.get("description") ?? "").trim() || null },
  });
  refresh(formatId);
  return { ok: "Salvo." };
}

export async function deleteFormatAction(formatId: string) {
  const f = await prisma.videoFormat.delete({ where: { id: formatId } });
  refresh();
  redirect(`/formatos?niche=${f.nicheId}&format=${f.length}`);
}

export async function addVideoToFormatAction(formatId: string, videoId: string) {
  const f = await prisma.videoFormat.findUniqueOrThrow({ where: { id: formatId }, include: { _count: { select: { videos: true } } } });
  if (f._count.videos >= MAX_FORMAT_VIDEOS) return;
  await setVideoFormat(videoId, f.nicheId, formatId);
  refresh(formatId);
  revalidatePath(`/video/${videoId}`);
}

export async function removeVideoFromFormatAction(formatId: string, videoId: string) {
  await prisma.formatVideo.deleteMany({ where: { formatId, videoId } });
  refresh(formatId);
  revalidatePath(`/video/${videoId}`);
}

/** Na tela do estudo: escolhe em qual formato do nicho o vídeo entra (ou nenhum). */
export async function setVideoFormatAction(videoId: string, nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const formatId = String(fd.get("formatId") ?? "") || null;
  try {
    if (formatId) {
      const count = await prisma.formatVideo.count({ where: { formatId, NOT: { videoId } } });
      if (count >= MAX_FORMAT_VIDEOS) return { error: `Esse formato já tem ${MAX_FORMAT_VIDEOS} vídeos. Tire um antes de pôr outro.` };
    }
    await setVideoFormat(videoId, nicheId, formatId);
  } catch (e) {
    return { error: errMsg(e) };
  }
  refresh(formatId ?? undefined);
  revalidatePath(`/video/${videoId}`);
  return { ok: formatId ? "Vídeo colocado no formato." : "Vídeo tirado do formato." };
}

export async function saveChannelHowAction(formatId: string, myChannelId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const howText = String(fd.get("howText") ?? "").trim();
  if (!howText) {
    await prisma.channelFormat.deleteMany({ where: { formatId, myChannelId } });
  } else {
    await prisma.channelFormat.upsert({
      where: { myChannelId_formatId: { myChannelId, formatId } },
      create: { myChannelId, formatId, howText },
      update: { howText },
    });
  }
  refresh(formatId);
  return { ok: howText ? "Salvo. Entra em toda ideia e roteiro deste formato." : "Apagado." };
}

export async function generateRecipeAction(formatId: string): Promise<FormState> {
  try {
    const f = await prisma.videoFormat.findUniqueOrThrow({ where: { id: formatId } });
    await startJob(
      { kind: "recipe", targetId: formatId, label: `Receita: ${f.name}`, href: `/formatos/${formatId}`, expectedSec: 90 },
      async () => {
        const r = await generateRecipe(formatId);
        return `Receita v${r.recipe.version}. Custo: ${money(r.costUsd)}.`;
      },
    );
    refresh(formatId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function generateRuleAction(nicheId: string, length: PlaybookFormat): Promise<FormState> {
  try {
    const n = await prisma.niche.findUniqueOrThrow({ where: { id: nicheId } });
    await startJob(
      { kind: "rule", targetId: `${nicheId}:${length}`, label: `Regra geral: ${n.name} (${formatLabel(length, true)})`, href: `/formatos?niche=${nicheId}&format=${length}&aba=regra`, expectedSec: 70 },
      async () => {
        const r = await generateRule(nicheId, length);
        return `Regra geral v${r.rule.version}. Custo: ${money(r.costUsd)}.`;
      },
    );
    refresh();
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: e instanceof FormatError ? e.message : errMsg(e) };
  }
}
