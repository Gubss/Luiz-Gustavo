"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchAndSaveTranscript, parsePastedTranscript, saveTranscript } from "@/lib/transcript";
import { runDiagnosis } from "@/lib/diagnosis";
import { analyzeComments } from "@/lib/comments";
import { ensureVideo } from "@/lib/videos";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";

export type FormState = { ok?: string; error?: string } | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const money = (usd: number) =>
  `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;

function done(videoId: string) {
  revalidatePath(`/video/${videoId}`);
  revalidatePath("/estudos");
}

export async function fetchTranscriptAction(videoId: string): Promise<FormState> {
  try {
    const t = await fetchAndSaveTranscript(videoId);
    done(videoId);
    return { ok: `Transcrição salva: ${t.wordCount} palavras (${t.language}${t.trackKind === "asr" ? ", legenda automática" : ""}).` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function pasteTranscriptAction(videoId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const raw = String(fd.get("transcript") ?? "");
  const language = String(fd.get("language") ?? "").trim() || "pt";
  if (raw.trim().length < 20) return { error: "Cole a transcrição inteira (está vazia ou curta demais)." };
  const p = parsePastedTranscript(raw);
  if (!p.text) return { error: "Não encontrei texto na transcrição colada." };
  const t = await saveTranscript(videoId, { language, source: "manual", segments: p.segments, text: p.text });
  done(videoId);
  return {
    ok: `Transcrição salva: ${t.wordCount} palavras${p.timed ? `, ${p.segments.length} trechos com tempo` : " (sem marcação de tempo — as medidas por segundo usam a duração do vídeo)"}.`,
  };
}

export async function deleteTranscriptAction(videoId: string) {
  await prisma.transcript.deleteMany({ where: { videoId } });
  done(videoId);
}

export async function diagnoseAction(videoId: string): Promise<FormState> {
  try {
    const r = await runDiagnosis(videoId);
    done(videoId);
    return { ok: `Diagnóstico pronto. Custo: ${money(r.costUsd)}.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function commentsAction(videoId: string): Promise<FormState> {
  try {
    const r = await analyzeComments(videoId);
    done(videoId);
    return { ok: `Comentários analisados. Custo: ${money(r.costUsd)}.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function studyByLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let id: string;
  try {
    const v = await ensureVideo(String(fd.get("url") ?? ""));
    id = v.id;
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/video/${id}`);
}

/** Nicho do estudo (para vídeo de canal que não está em nenhum nicho): faz o estudo entrar na cartilha. */
export async function setStudyNicheAction(videoId: string, fd: FormData) {
  const nicheId = String(fd.get("nicheId") ?? "");
  await prisma.video.update({ where: { id: videoId }, data: { studyNicheId: nicheId || null } });
  done(videoId);
  revalidatePath("/cartilha");
}
