"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import { generateIdeas, generateScript, IDEA_STATUS, NO_RECIPE_MSG, revisionDefaults, scriptMissingRecipe, type IdeasRequest, type ScriptMode } from "@/lib/generator";
import { startJob } from "@/lib/jobs";
import { returnPoints } from "@/lib/speech";
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

function startScriptJob(ideaId: string, label: string, title: string, extra: string, mode: ScriptMode | undefined, noRecipeOk: boolean) {
  return startJob(
    { kind: "script", targetId: ideaId, label: `${mode === "corrigir" ? "Correção do roteiro" : "Roteiro"}: ${label}`, href: `/ideias/${ideaId}`, expectedSec: 150 },
    async () => {
      const r = await generateScript(ideaId, { title, extra, mode, noRecipeOk });
      const rv = r.review;
      const check = rv.error
        ? " A leitura de espectador falhou; confira o roteiro com atenção."
        : rv.rewritten
          ? ` A leitura de espectador achou ${rv.points.length} ${rv.points.length === 1 ? "ponto" : "pontos"} e o roteiro foi reescrito uma vez.`
          : ` Passou na leitura de espectador (${rv.laughs} risadas).`;
      return `${r.mode === "corrigir" ? "Roteiro corrigido: " : ""}${r.metrics.scenes} cenas, ~${r.metrics.durationSec}s.${check} Custo: ${money(r.costUsd)}.`;
    },
  );
}

/** Formato sem receita: só escreve com a caixa de confirmação marcada. */
async function recipeBlock(ideaId: string, fd: FormData): Promise<{ error: string } | null> {
  if (fd.get("noRecipeOk") === "on") return null;
  return (await scriptMissingRecipe(ideaId)) ? { error: NO_RECIPE_MSG } : null;
}

const pickedTitle = (fd: FormData) => {
  const picked = String(fd.get("title") ?? "");
  const custom = String(fd.get("customTitle") ?? "").trim();
  return custom || (picked === "__custom" ? "" : picked);
};

export async function generateScriptAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { theme: true, chosenTitle: true } });
    const m = String(fd.get("mode") ?? "");
    const mode: ScriptMode | undefined = m === "corrigir" || m === "nova" ? m : undefined;
    const extra = String(fd.get("extra") ?? "");
    if (mode === "corrigir" && !extra.trim()) {
      const full = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { status: true, scriptData: true, returnNotes: true } });
      if (!revisionDefaults(full).pendingReturn)
        return { error: "Para corrigir o roteiro, diga no pedido extra o que mudar (ou registre a devolução do Estúdio). Para recomeçar, escolha “história nova”." };
    }
    const blocked = await recipeBlock(ideaId, fd);
    if (blocked) return blocked;
    await startScriptJob(ideaId, idea.chosenTitle || idea.theme, pickedTitle(fd), extra, mode, fd.get("noRecipeOk") === "on");
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

/**
 * Põe uma ideia antiga (de antes dos formatos) num formato. O tema fica; a ideia é marcada para ser recontada
 * no motor desse formato (gancho e estrutura antigos deixam de valer).
 */
async function assignFormat(ideaId: string, formatId: string) {
  const [f, idea] = await Promise.all([
    prisma.videoFormat.findUnique({ where: { id: formatId } }),
    prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { ideaData: true, nicheId: true, myChannel: { select: { nicheId: true } } } }),
  ]);
  if (!f) throw new Error("Esse formato não existe mais.");
  const nicheId = idea.nicheId ?? idea.myChannel?.nicheId;
  if (nicheId && nicheId !== f.nicheId) throw new Error("Esse formato é de outro nicho.");
  let ideaData = idea.ideaData;
  if (ideaData) {
    try {
      const d = JSON.parse(ideaData) as Record<string, unknown>;
      d.recontar = { formatId: f.id, formatName: f.name, at: new Date().toISOString() };
      ideaData = JSON.stringify(d);
    } catch {
      /* ideaData estragado: segue só com o tema */
    }
  }
  await prisma.idea.update({ where: { id: ideaId }, data: { formatId: f.id, nicheId: f.nicheId, format: f.length, ideaData } });
  return f;
}

/** Escolhe o formato de uma ideia antiga, sem escrever o roteiro ainda. */
export async function setIdeaFormatAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const formatId = String(fd.get("formatId") ?? "");
  if (!formatId) return { error: "Escolha um formato." };
  try {
    const f = await assignFormat(ideaId, formatId);
    refresh(ideaId);
    return { ok: `Formato: ${f.name}.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Regenerar uma ideia sem formato: primeiro escolhe o formato (pergunta obrigatória), depois escreve o roteiro nele. */
export async function regenerateWithFormatAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const formatId = String(fd.get("formatId") ?? "");
  if (!formatId) return { error: "Escolha o formato antes: o roteiro segue a receita de um formato só." };
  try {
    const f = await assignFormat(ideaId, formatId);
    const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { theme: true, chosenTitle: true } });
    const blocked = await recipeBlock(ideaId, fd);
    if (blocked) return { error: `Formato escolhido: ${f.name}. ${blocked.error}` };
    await startScriptJob(ideaId, idea.chosenTitle || idea.theme, pickedTitle(fd), String(fd.get("extra") ?? ""), "nova", fd.get("noRecipeOk") === "on");
    refresh(ideaId);
    return { ok: `Formato: ${f.name}. ${BACKGROUND_OK}` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Devolução do Estúdio: o roteiro foi reprovado no filtro de produção. Cada ponto vira aprendizado do canal e a ideia fica "devolvida". */
export async function returnIdeaAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const raw = String(fd.get("returnNotes") ?? "").trim();
  const points = returnPoints(raw);
  if (!points.length) return { error: "Cole os pontos em que o roteiro foi reprovado (um por linha)." };
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { myChannelId: true, formatId: true, returnNotes: true } });
  if (!idea.myChannelId) return { error: "Essa ideia não está ligada a um canal seu." };
  const now = new Date();
  const stamp = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await prisma.$transaction([
    prisma.idea.update({
      where: { id: ideaId },
      data: {
        status: "RETURNED",
        returnedAt: now,
        returnNotes: [idea.returnNotes, `Devolução de ${stamp}:\n${raw}`].filter(Boolean).join("\n\n"),
      },
    }),
    ...points.map((text) =>
      prisma.channelLesson.create({ data: { myChannelId: idea.myChannelId!, ideaId, formatId: idea.formatId, text: text.slice(0, 1000) } }),
    ),
  ]);
  refresh(ideaId);
  revalidatePath(`/meus-canais/${idea.myChannelId}`);
  return { ok: `${points.length} ${points.length === 1 ? "ponto virou aprendizado" : "pontos viraram aprendizado"} do canal. A ideia ficou como devolvida.` };
}

export async function deleteLessonAction(lessonId: string) {
  const l = await prisma.channelLesson.delete({ where: { id: lessonId } });
  if (l.ideaId) refresh(l.ideaId);
  revalidatePath(`/meus-canais/${l.myChannelId}`);
}
