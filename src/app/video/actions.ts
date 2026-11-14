"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchAndSaveTranscript, parsePastedTranscript, saveTranscript } from "@/lib/transcript";
import { runDiagnosis } from "@/lib/diagnosis";
import { analyzeComments } from "@/lib/comments";
import { ensureVideo } from "@/lib/videos";
import { prisma } from "@/lib/db";
import { usdToBrl } from "@/lib/claude";
import { startJob } from "@/lib/jobs";

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

const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar.";

const shortTitle = (t: string) => (t.length > 50 ? t.slice(0, 48) + "…" : t);

/** Roda em segundo plano (a tela não fica presa). */
export async function diagnoseAction(videoId: string): Promise<FormState> {
  try {
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId }, select: { title: true } });
    await startJob({ kind: "diagnosis", targetId: videoId, label: `Diagnóstico: ${shortTitle(v.title)}`, href: `/video/${videoId}`, expectedSec: 70 },
      async () => {
        const r = await runDiagnosis(videoId);
        return `Custo: ${money(r.costUsd)}.`;
      },
      ["study"],
    );
    done(videoId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function commentsAction(videoId: string): Promise<FormState> {
  try {
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId }, select: { title: true } });
    await startJob({ kind: "comments", targetId: videoId, label: `Comentários: ${shortTitle(v.title)}`, href: `/video/${videoId}`, expectedSec: 30 },
      async () => {
        const r = await analyzeComments(videoId);
        return `Custo: ${money(r.costUsd)}.`;
      },
      ["study"],
    );
    done(videoId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/**
 * "Estudar tudo": transcrição (se ainda não tiver) → diagnóstico → comentários, numa tarefa só.
 * Se a legenda não vier, segue sem ela (o diagnóstico olha título, thumbnail e números) e avisa.
 */
export async function studyAllAction(videoId: string): Promise<FormState> {
  try {
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId }, select: { title: true, transcript: { select: { id: true } } } });
    await startJob(
      { kind: "study", targetId: videoId, label: `Estudo completo: ${shortTitle(v.title)}`, href: `/video/${videoId}`, expectedSec: 110, step: "Transcrição (1 de 3)" },
      async (report) => {
        const notes: string[] = [];
        let cost = 0;
        if (!v.transcript) {
          try {
            const t = await fetchAndSaveTranscript(videoId);
            notes.push(`transcrição: ${t.wordCount} palavras`);
          } catch (e) {
            notes.push(`sem transcrição (${errMsg(e)}) — diagnóstico feito sem ela`);
          }
        } else notes.push("transcrição já existia");
        await report(10, "Diagnóstico (2 de 3)");
        const d = await runDiagnosis(videoId);
        cost += d.costUsd;
        await report(75, "Comentários (3 de 3)");
        try {
          const c = await analyzeComments(videoId);
          cost += c.costUsd;
          notes.push("comentários analisados");
        } catch (e) {
          notes.push(`comentários: ${errMsg(e)}`);
        }
        return `${notes.join(" · ").replace(/\.+$/, "")}. Custo total: ${money(cost)}.`;
      },
      ["diagnosis", "comments"],
    );
    done(videoId);
    return { ok: BACKGROUND_OK };
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
