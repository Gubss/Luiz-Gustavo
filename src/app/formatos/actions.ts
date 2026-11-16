"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeStudy, STUDY_MAX, writeStudyRequest } from "@/lib/direction-study";
import { usdToBrl } from "@/lib/claude";
import { startJob } from "@/lib/jobs";
import { formatLabel, type PlaybookFormat } from "@/lib/playbook";
import { FormatError, MAX_FORMAT_VIDEOS, generateRecipe, generateRule, setVideoFormat } from "@/lib/formats";
import type { FormState } from "@/app/video/actions";
import { runCleanup } from "@/lib/cleanup";
import { NONE, applyChoices, classifyMany, findGaps, nicheStudiesForClassify, recipesAndGaps, sameName } from "@/lib/classify";

const money = (usd: number) => `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar.";

export async function importDirectionAction(formatId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const file = fd.get("studyFile");
    let text = String(fd.get("directionStudy") ?? "");
    if (file instanceof File && file.size) {
      if (!file.name.toLowerCase().endsWith(".md") || file.size > STUDY_MAX * 4) throw new Error("Envie um arquivo .md de até 48 KB.");
      text = await file.text();
    }
    await prisma.videoFormat.update({ where: { id: formatId }, data: { directionStudy: normalizeStudy(text) } });
    refresh(formatId);
    return { ok: "Estudo de direção importado. Os próximos roteiros terão plano de cenas." };
  } catch (error) { return { error: errMsg(error) }; }
}

export async function requestDirectionAction(formatId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const format = await prisma.videoFormat.findUniqueOrThrow({ where: { id: formatId } });
    await writeStudyRequest(format, String(fd.get("links") ?? ""));
    return { ok: "Pedido salvo para o GEPETO estudar fora do Radar. Nenhuma API foi chamada." };
  } catch (error) { return { error: errMsg(error) }; }
}

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
    await markSuggestion(videoId, nicheId, formatId);
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

/** Escolha feita à mão na tela do estudo: a sugestão automática conta como confirmada (se bateu) ou trocada. */
async function markSuggestion(videoId: string, nicheId: string, formatId: string | null) {
  const sug = await prisma.formatSuggestion.findUnique({ where: { videoId_nicheId: { videoId, nicheId } } });
  if (!sug) return;
  const chosen = formatId ? ((await prisma.videoFormat.findUnique({ where: { id: formatId }, select: { name: true } }))?.name ?? NONE) : NONE;
  await prisma.formatSuggestion.update({
    where: { id: sug.id },
    data: { status: sameName(sug.label, chosen) ? "confirmed" : "changed", chosen, decidedAt: new Date() },
  });
}

// ---------- Classificação automática ----------

const classifyHref = (nicheId: string) => `/formatos/classificar?niche=${nicheId}`;

function refreshClassify(nicheId: string) {
  refresh();
  revalidatePath("/formatos/classificar");
  revalidatePath(classifyHref(nicheId));
}

/** Sugere o formato de todos os estudos do nicho (só dos que ainda não têm sugestão, ou de todos de novo). Não grava formato nenhum. */
export async function classifyNicheAction(nicheId: string, redo: boolean): Promise<FormState> {
  try {
    const n = await prisma.niche.findUniqueOrThrow({ where: { id: nicheId } });
    const rows = await nicheStudiesForClassify(nicheId);
    const ids = rows.filter((r) => redo || !r.suggestion).map((r) => r.study.id);
    if (!ids.length) return { ok: "Todos os estudos do nicho já têm sugestão." };
    await startJob(
      { kind: "classify", targetId: `classify:${nicheId}`, label: `Sugerir formatos: ${n.name} (${ids.length} estudos)`, href: classifyHref(nicheId), expectedSec: 8 * ids.length },
      async (report) => {
        const r = await classifyMany(nicheId, ids, (done, total) => report((done / total) * 100, `${done} de ${total}`));
        const err = r.errors.length ? ` ${r.errors.length} falharam (${r.errors[0]}).` : "";
        return `${r.ok} sugestões prontas para conferir.${err} Custo: ${money(r.costUsd)}.`;
      },
      ["recipes-batch"],
    );
    refreshClassify(nicheId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Grava o que eu confirmei na lista, cria os formatos que faltam e começa a gerar as receitas (e o que falta nos rascunhos). */
export async function applyChoicesAction(nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const choices = [...fd.entries()]
    .filter(([k]) => k.startsWith("pick:"))
    .map(([k, v]) => ({ videoId: k.slice(5), label: String(v) }));
  if (!choices.some((c) => c.label)) return { error: "Nenhuma escolha para gravar (todas estão em “decidir depois”)." };
  let res;
  try {
    res = await applyChoices(nicheId, choices);
  } catch (e) {
    return { error: errMsg(e) };
  }
  const touched = res.placed.filter((p) => p.total > 0).map((p) => p.formatId);
  const lines = [
    res.created.length ? `Formatos criados: ${res.created.join(", ")}.` : "",
    ...res.placed.map(
      (p) =>
        `${p.name} (${formatLabel(p.length, true)}): ${p.total} vídeo(s)${p.added ? `, ${p.added} entraram agora` : ""}${p.reserve.length ? `; ficaram de reserva (formato cheio): ${p.reserve.join("; ")}` : ""}.`,
    ),
    res.none ? `${res.none} ficaram sem formato.` : "",
  ].filter(Boolean);
  if (touched.length) {
    try {
      const n = await prisma.niche.findUniqueOrThrow({ where: { id: nicheId } });
      await startJob(
        { kind: "recipes-batch", targetId: `classify:${nicheId}`, label: `Receitas dos formatos: ${n.name}`, href: classifyHref(nicheId), expectedSec: 100 * touched.length },
        async (report) => {
          const r = await recipesAndGaps(touched, (done, total, step) => report((done / total) * 100, step));
          return `${r.notes.join(" · ")}. Custo: ${money(r.costUsd)}.`;
        },
        ["classify"],
      );
      lines.push("Gerando as receitas em segundo plano; o aviso no canto mostra quando terminar.");
    } catch (e) {
      lines.push(`Não comecei as receitas: ${errMsg(e)}`);
    }
  }
  refreshClassify(nicheId);
  return { ok: lines.join("\n") };
}

/** Na tela do estudo: aceita a sugestão do Radar (cria o formato se ainda não existe). */
export async function confirmSuggestionAction(videoId: string, nicheId: string): Promise<FormState> {
  try {
    const sug = await prisma.formatSuggestion.findUniqueOrThrow({ where: { videoId_nicheId: { videoId, nicheId } } });
    const res = await applyChoices(nicheId, [{ videoId, label: sug.label }]);
    refreshClassify(nicheId);
    revalidatePath(`/video/${videoId}`);
    const p = res.placed[0];
    if (sug.label === NONE) return { ok: "Confirmado: fica sem formato." };
    if (p?.reserve.length) return { ok: `Confirmado, mas ${p.name} já tem ${MAX_FORMAT_VIDEOS} vídeos: este ficou de reserva.` };
    return { ok: `Confirmado: entrou em ${p?.name ?? sug.label}.${res.created.length ? " Formato criado." : ""}` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Refaz a lista do que falta num formato rascunho (tipo de vídeo e candidatos do radar). */
export async function findGapsAction(formatId: string): Promise<FormState> {
  try {
    const f = await prisma.videoFormat.findUniqueOrThrow({ where: { id: formatId } });
    await startJob({ kind: "gaps", targetId: formatId, label: `O que falta: ${f.name}`, href: `/formatos/${formatId}`, expectedSec: 25 }, async () => {
      const g = await findGaps(formatId);
      return `${g.candidatos.length} candidato(s) no radar. Custo: ${money(g.costUsd)}.`;
    });
    refresh(formatId);
    revalidatePath(classifyHref(f.nicheId));
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------- Limpeza (cartilha antiga + ideias sem formato) ----------

/** Faz a cópia de segurança e só depois apaga o que está marcado. */
export async function cleanupAction(nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (fd.get("confirm") !== "on") return { error: "Marque a caixa de confirmação antes de apagar." };
  try {
    const r = await runCleanup(nicheId, { playbooks: fd.get("playbooks") === "on", ideaIds: fd.getAll("idea").map(String) });
    revalidatePath("/cartilha");
    revalidatePath("/ideias");
    revalidatePath("/gerador");
    revalidatePath("/formatos/limpeza");
    revalidatePath("/configuracoes");
    return {
      ok: [
        `Cópia de segurança feita antes: ${r.backup.path}`,
        `Apagado: ${r.playbooks} ${r.playbooks === 1 ? "versão da cartilha antiga" : "versões da cartilha antiga"} e ${r.ideas} ${r.ideas === 1 ? "ideia" : "ideias"} (com os roteiros).`,
        r.kept.length ? `Ficou: ${r.kept.join("; ")}.` : "",
        "Estudos e roteiros aprovados do perfil não foram tocados.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
