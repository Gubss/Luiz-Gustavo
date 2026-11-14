"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import { generateIdeas, generateScript, IDEA_STATUS, type IdeasRequest } from "@/lib/generator";
import { startJob } from "@/lib/jobs";
import type { FormState } from "@/app/video/actions";

const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar.";

const money = (usd: number) =>
  `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

function refresh(ideaId?: string) {
  revalidatePath("/gerador");
  revalidatePath("/ideias");
  if (ideaId) revalidatePath(`/ideias/${ideaId}`);
}

export async function generateIdeasAction(req: Omit<IdeasRequest, "ponto">, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const ch = await prisma.myChannel.findUniqueOrThrow({ where: { id: req.myChannelId }, select: { name: true } });
    const ponto = String(fd.get("ponto") ?? "");
    await startJob(
      { kind: "ideas", targetId: req.myChannelId, label: `${req.count} ideias para ${ch.name}`, href: `/gerador?canal=${req.myChannelId}`, expectedSec: 40 + 10 * req.count },
      async () => {
        const r = await generateIdeas({ ...req, ponto });
        return `${r.ideas.length} ideias novas. Custo: ${money(r.costUsd)}.`;
      },
    );
    refresh();
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function generateScriptAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const picked = String(fd.get("title") ?? "");
  const custom = String(fd.get("customTitle") ?? "").trim();
  try {
    const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { theme: true, chosenTitle: true } });
    const extra = String(fd.get("extra") ?? "");
    await startJob(
      { kind: "script", targetId: ideaId, label: `Roteiro: ${idea.chosenTitle || idea.theme}`, href: `/ideias/${ideaId}`, expectedSec: 90 },
      async () => {
        const r = await generateScript(ideaId, { title: custom || (picked === "__custom" ? "" : picked), extra });
        return `${r.metrics.scenes} cenas, ~${r.metrics.durationSec}s. Custo: ${money(r.costUsd)}.`;
      },
    );
    refresh(ideaId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setIdeaStatus(ideaId: string, fd: FormData) {
  const status = String(fd.get("status") ?? "");
  if (!(status in IDEA_STATUS)) return;
  await prisma.idea.update({ where: { id: ideaId }, data: { status } });
  refresh(ideaId);
}

export async function saveIdeaNotes(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await prisma.idea.update({ where: { id: ideaId }, data: { notes: String(fd.get("notes") ?? "").trim() || null } });
  refresh(ideaId);
  return { ok: "Anotação salva." };
}

/** Apaga a ideia sem sair da lista. */
export async function deleteIdeaInline(ideaId: string) {
  await prisma.idea.delete({ where: { id: ideaId } });
  refresh();
}

/** Liga a ideia ao vídeo do meu canal em que ela virou (escolhido na lista ou pelo link) e marca como publicada. */
export async function linkPublishedAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { myChannelId: true } });
  if (!idea.myChannelId) return { error: "Essa ideia não está ligada a um canal seu." };
  let videoId = String(fd.get("videoId") ?? "");
  const link = String(fd.get("link") ?? "").trim();
  if (link) {
    const ext = link.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(link) ? link : null);
    if (!ext) return { error: "Não reconheci o link do vídeo." };
    const v = await prisma.myChannelVideo.findUnique({ where: { myChannelId_externalId: { myChannelId: idea.myChannelId, externalId: ext } } });
    if (!v) return { error: "Esse vídeo ainda não está na lista do seu canal. No perfil do canal, clique em “Ler de novo” e tente outra vez." };
    videoId = v.id;
  }
  if (!videoId) return { error: "Escolha o vídeo na lista ou cole o link." };
  await prisma.idea.update({ where: { id: ideaId }, data: { publishedVideoId: videoId, status: "PUBLISHED" } });
  refresh(ideaId);
  return { ok: "Marcada como publicada." };
}

export async function unlinkPublishedAction(ideaId: string) {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { script: true } });
  await prisma.idea.update({ where: { id: ideaId }, data: { publishedVideoId: null, status: idea.script ? "SCRIPT" : "IDEA" } });
  refresh(ideaId);
}

export async function deleteIdea(ideaId: string) {
  await prisma.idea.delete({ where: { id: ideaId } });
  refresh();
  redirect("/ideias");
}
