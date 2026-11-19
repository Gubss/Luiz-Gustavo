"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteIdeaSafely } from "@/lib/delete-idea";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import { applyOriginalOpening, correctScript, requestCritique, generateIdeas, generateScript, IDEA_STATUS, NO_RECIPE_MSG, revisionDefaults, scriptMissingRecipe, type IdeasRequest, type ScriptMode } from "@/lib/generator";
import { captureLegacyVersion, approveVersion, restoreVersion } from "@/lib/script-versions";
import { startJob } from "@/lib/jobs";
import { createOwnIdeas, createStoryIdea } from "@/lib/own-create";
import { IDEAS_MAX, ideasFromPairs, parseOwnIdeas } from "@/lib/own-story";
import { recordCorrectionLesson, recordReturn, returnMessage, returnPointsFromForm, scopeOf } from "@/lib/lessons";
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
      return `Versão ${r.version.number} salva; duração estimada ${r.data.duracaoSeg}s. Custo: ${money(r.costUsd)}.`;
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
  const result = await deleteIdeaSafely(ideaId);
  if (result.message) return result;
  refresh();
  return result;
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
  const result = await deleteIdeaSafely(ideaId);
  if (result.message) return result;
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

/** Devolução do Estúdio: o roteiro foi reprovado no filtro de produção. Ponto "canal todo" vira lição do canal; "só este roteiro" fica no projeto. A ideia fica "devolvida". */
export async function returnIdeaAction(ideaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { raw, points } = returnPointsFromForm(fd);
  if (!points.length) return { error: "Cole os pontos em que o roteiro foi reprovado (um por linha)." };
  try {
    const r = await recordReturn(ideaId, raw, points);
    refresh(ideaId);
    revalidatePath(`/meus-canais/${r.myChannelId}`);
    return { ok: returnMessage(r.channel, r.script) };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteLessonAction(lessonId: string) {
  const l = await prisma.channelLesson.delete({ where: { id: lessonId } });
  if (l.ideaId) refresh(l.ideaId);
  revalidatePath(`/meus-canais/${l.myChannelId}`);
}

export async function correctScriptAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState> {
 try { const versionId=String(fd.get("versionId")??""); const line=Number(fd.get("line")); const request=String(fd.get("request")??""); const category=String(fd.get("category")??""); const scope=scopeOf(fd.get("escopo"));
 await startJob({kind:"script",targetId:ideaId,label:"Correção de fala",href:"/ideias/"+ideaId,expectedSec:60},async()=>{const v=await correctScript(ideaId,versionId,line,request,category,Number(fd.get("endLine"))||line);const lesson=scope==="canal"?await recordCorrectionLesson(ideaId,request):null;if(lesson)revalidatePath("/meus-canais/"+lesson.myChannelId);return "Versão "+v.number+" salva; demais falas preservadas. "+(lesson?"A correção virou regra do canal.":"A correção ficou só neste roteiro.");}); refresh(ideaId);return {ok:BACKGROUND_OK}; } catch(e){return {error:errMsg(e)}}
}
export async function critiqueAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState> {
 try {const versionId=String(fd.get("versionId")??"");await startJob({kind:"script",targetId:ideaId,label:"Crítica opcional",href:"/ideias/"+ideaId,expectedSec:45},async()=>{const r=await requestCritique(ideaId,versionId);return "Crítica registrada, sem alterar o roteiro. Custo: "+money(r.costUsd);});refresh(ideaId);return {ok:BACKGROUND_OK};} catch(e){return {error:errMsg(e)}}
}
export async function approveAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState> {
 try{await approveVersion(ideaId,String(fd.get("versionId")??""));refresh(ideaId);return {ok:"Esta versão das falas foi aprovada."}}catch(e){return {error:errMsg(e)}}
}
export async function restoreAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState> {
 try{await restoreVersion(ideaId,String(fd.get("versionId")??""),String(fd.get("currentVersionId")??"")||null);refresh(ideaId);return {ok:"Restaurada como nova versão; histórico preservado."}}catch(e){return {error:errMsg(e)}}
}

/** Adendo B: "usar a original" troca só a abertura do roteiro pela da história. Sem IA. */
export async function originalOpeningAction(ideaId:string,versionId:string):Promise<FormState>{try{await applyOriginalOpening(ideaId,versionId);refresh(ideaId);return {ok:"Abertura original de volta, como nova versão (sem custo)."}}catch(e){return {error:errMsg(e)}}}

export async function captureLegacyAction(ideaId:string,_prev:FormState):Promise<FormState>{void _prev;try{await captureLegacyVersion(ideaId);refresh(ideaId);return {ok:"Roteiro preservado como versão legada, ainda sem aprovação."}}catch(e){return {error:errMsg(e)}}}

// ---------- O que o Gubs traz pronto: história (a) e ideias (b). Criar é sem IA. ----------

async function pastedOrFile(fd: FormData, field: string, fileField: string) {
  const file = fd.get(fileField);
  if (file instanceof File && file.size > 0) {
    if (file.size > 200_000) throw new Error("Arquivo grande demais (máx. 200 KB).");
    return await file.text();
  }
  return String(fd.get(field) ?? "");
}

/** (a) Cria a ideia com a história dele e já começa o roteiro em segundo plano; abre a tela da ideia. */
export async function createStoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let ideaId = "";
  try {
    const markdown = await pastedOrFile(fd, "historia", "arquivo");
    const idea = await createStoryIdea({
      myChannelId: String(fd.get("canal") ?? ""),
      formatId: String(fd.get("formato") ?? ""),
      markdown,
      manterFalas: fd.get("falas") !== "reescrever",
      manterAbertura: fd.get("abertura") === "manter",
      title: String(fd.get("titulo") ?? ""),
    });
    ideaId = idea.id;
    await startScriptJob(idea.id, idea.theme, idea.theme, "", "nova", true);
    refresh(idea.id);
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/ideias/${ideaId}#roteiro`);
}

/** (b) Uma ideia por linha (ou o banco de ideias inteiro); nenhuma chamada de IA. */
export async function createOwnIdeasAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let canal = "";
  try {
    canal = String(fd.get("canal") ?? "");
    // v3: pares Título + Resumo; o banco colado/arquivo (opção recolhida) continua valendo e soma.
    const items = ideasFromPairs(fd.getAll("titulo").map(String), fd.getAll("resumo").map(String));
    const text = await pastedOrFile(fd, "ideias", "arquivo");
    const all = [...items, ...parseOwnIdeas(text)].slice(0, IDEAS_MAX);
    if (!all.length) throw new Error("Escreva pelo menos uma ideia: um título e, se quiser, o resumo.");
    await createOwnIdeas({ myChannelId: canal, formatId: String(fd.get("formato") ?? ""), items: all });
    refresh();
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/ideias?canal=${canal}`);
}
