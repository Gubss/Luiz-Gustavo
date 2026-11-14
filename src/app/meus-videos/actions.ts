"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { linkMyChannel } from "@/lib/my-videos";
import { fetchYoutubeTranscript, parsePastedTranscript } from "@/lib/transcript";
import { startChannelReportJob, startMyDiagnosisJob, startRefreshChannelJob, startRefreshVideoJob } from "@/lib/tracker";
import type { FormState } from "@/app/video/actions";
import { applyProfileImport } from "@/app/meus-canais/actions";
import { startJob } from "@/lib/jobs";
import { usdToBrl } from "@/lib/claude";
import { clearProfileDraft, runProfileFromChannel } from "@/lib/profile-from-channel";

const money = (usd: number) => `US$ ${usd.toFixed(usd < 0.1 ? 3 : 2).replace(".", ",")} (≈ R$ ${(usd * usdToBrl()).toFixed(2).replace(".", ",")})`;

const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra quando terminar.";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optNum = (fd: FormData, k: string) => {
  const raw = str(fd, k).replace("%", "").replace(/\s/g, "");
  if (!raw) return null;
  // aceita "1.234" (milhar) e "45,6" (decimal)
  const n = Number(/,/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  return Number.isFinite(n) ? n : null;
};
/** "0:23", "1:05" ou "23" → segundos */
const optSec = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (!raw) return null;
  const m = raw.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return optNum(fd, k);
};

function refresh(myChannelId?: string, myVideoId?: string) {
  revalidatePath("/meus-videos");
  if (myVideoId) revalidatePath(`/meus-videos/${myVideoId}`);
  if (myChannelId) revalidatePath(`/meus-canais/${myChannelId}`);
}

export async function linkChannelAction(myChannelId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const c = await linkMyChannel(myChannelId, str(fd, "url"));
    await startRefreshChannelJob(myChannelId, true);
    refresh(myChannelId);
    return { ok: `Ligado ao canal “${c.title}”. Lendo os vídeos em segundo plano…` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function refreshChannelAction(myChannelId: string): Promise<FormState> {
  try {
    await startRefreshChannelJob(myChannelId);
    refresh(myChannelId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function channelReportAction(myChannelId: string): Promise<FormState> {
  try {
    await startChannelReportJob(myChannelId);
    refresh(myChannelId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setAutoDiagnoseAction(myChannelId: string, fd: FormData) {
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { autoDiagnose: fd.get("auto") === "on" } });
  refresh(myChannelId);
}

export async function disconnectGoogleAction(myChannelId: string) {
  const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId } });
  if (c.externalId) await prisma.googleAuth.deleteMany({ where: { channelExternalId: c.externalId } });
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { oauthConnected: false } });
  refresh(myChannelId);
}

export async function refreshVideoAction(myVideoId: string): Promise<FormState> {
  try {
    await startRefreshVideoJob(myVideoId);
    refresh(undefined, myVideoId);
    return { ok: "Atualizando… a página recarrega sozinha quando terminar." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function diagnoseMyVideoAction(myVideoId: string): Promise<FormState> {
  try {
    await startMyDiagnosisJob(myVideoId, { trigger: "manual", refreshFirst: true });
    refresh(undefined, myVideoId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function saveCheckpointAction(myVideoId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ageHours = Number(str(fd, "ageHours"));
  if (!ageHours) return { error: "Escolha o marco (1h, 3h, 24h…)." };
  const data = {
    viewCount: optNum(fd, "views"),
    stayedPct: optNum(fd, "stayedPct"),
    avgViewPct: optNum(fd, "avgViewPct"),
    avgViewDuration: optSec(fd, "avgViewDuration"),
    ctr: optNum(fd, "ctr"),
    impressions: optNum(fd, "impressions"),
    notes: str(fd, "notes") || null,
  };
  const filled = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) as Partial<typeof data>;
  if (!Object.keys(filled).length) return { error: "Preencha pelo menos um número." };
  const prev = await prisma.myVideoCheckpoint.findUnique({ where: { myVideoId_ageHours: { myVideoId, ageHours } } });
  // as views da API não são sobrescritas por uma digitada sem querer; só preenchem se estiver vazio
  if (prev?.viewCount != null && (prev.source === "api" || prev.source === "mixed")) delete filled.viewCount;
  await prisma.myVideoCheckpoint.upsert({
    where: { myVideoId_ageHours: { myVideoId, ageHours } },
    create: { myVideoId, ageHours, ...filled, source: "manual" },
    update: { ...filled, source: prev && prev.source === "api" ? "mixed" : prev?.source === "mixed" ? "mixed" : "manual" },
  });
  refresh(undefined, myVideoId);
  return { ok: "Números do Studio salvos." };
}

export async function saveScriptAction(myVideoId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ideaId = str(fd, "ideaId") || null;
  const scriptText = str(fd, "scriptText") || null;
  await prisma.myVideo.update({ where: { id: myVideoId }, data: { inspiredIdeaId: ideaId, scriptText } });
  if (ideaId) {
    // liga também no Banco de ideias ("Virou vídeo no seu canal?"), se o vídeo já estiver na lista do canal
    const v = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId } });
    const cv = await prisma.myChannelVideo.findUnique({ where: { myChannelId_externalId: { myChannelId: v.myChannelId, externalId: v.externalId } } });
    await prisma.idea.update({ where: { id: ideaId }, data: { status: "PUBLISHED", ...(cv ? { publishedVideoId: cv.id } : {}) } }).catch(() => {});
  }
  refresh(undefined, myVideoId);
  revalidatePath("/ideias");
  return { ok: "Roteiro salvo." };
}

export async function saveStudioNotesAction(myVideoId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await prisma.myVideo.update({ where: { id: myVideoId }, data: { studioNotes: str(fd, "studioNotes") || null } });
  refresh(undefined, myVideoId);
  return { ok: "Anotações salvas." };
}

export async function fetchMyTranscriptAction(myVideoId: string): Promise<FormState> {
  try {
    const v = await prisma.myVideo.findUniqueOrThrow({ where: { id: myVideoId } });
    const t = await fetchYoutubeTranscript(v.externalId, "pt");
    await prisma.myVideo.update({
      where: { id: myVideoId },
      data: { transcriptText: t.text, transcriptSegments: JSON.stringify(t.segments), transcriptSource: "youtube" },
    });
    refresh(undefined, myVideoId);
    return { ok: `Legenda salva (${t.segments.length} trechos${t.trackKind === "asr" ? ", automática" : ""}).` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function pasteMyTranscriptAction(myVideoId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const raw = String(fd.get("transcript") ?? "");
  if (raw.trim().length < 20) return { error: "Cole a transcrição inteira." };
  const p = parsePastedTranscript(raw);
  await prisma.myVideo.update({
    where: { id: myVideoId },
    data: { transcriptText: p.text, transcriptSegments: p.timed ? JSON.stringify(p.segments) : null, transcriptSource: "manual" },
  });
  refresh(undefined, myVideoId);
  return { ok: p.timed ? `Transcrição salva com ${p.segments.length} trechos com tempo.` : "Transcrição salva (sem tempos)." };
}

export async function saveAnalyticsNotesAction(myChannelId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const text = String(fd.get("analyticsNotes") ?? "").trim();
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { analytics: text || null, analyticsAt: text ? new Date() : null } });
  refresh(myChannelId);
  return { ok: text ? "Salvo. Os próximos diagnósticos (do canal e dos vídeos) leem esses números." : "Apagado." };
}

/** Importa um arquivo .md/.txt com números do canal (ex.: relatório do Maestri/GPT). */
export async function importAnalyticsFileAction(myChannelId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Escolha um arquivo .md ou .txt." };
  if (f.size > 300_000) return { error: "Arquivo grande demais (máx. 300 KB)." };
  const text = (await f.text()).trim();
  await prisma.myChannel.update({ where: { id: myChannelId }, data: { analytics: text, analyticsAt: new Date() } });
  refresh(myChannelId);
  return { ok: `Importado: ${f.name} (${text.length.toLocaleString("pt-BR")} caracteres).` };
}

// ---------- Perfil a partir do meu canal ----------

export async function profileFromChannelAction(myChannelId: string): Promise<FormState> {
  try {
    const c = await prisma.myChannel.findUniqueOrThrow({ where: { id: myChannelId }, select: { name: true, externalId: true, url: true } });
    if (!c.externalId && !c.url) return { error: "Coloque a URL do canal no perfil (ou entre com o Google em Meus vídeos) primeiro." };
    await startJob(
      { kind: "profile-from-channel", targetId: myChannelId, label: `Perfil de ${c.name} pelos vídeos do canal`, href: `/meus-canais/${myChannelId}#do-canal`, expectedSec: 120, step: "Começando" },
      async (report) => {
        const r = await runProfileFromChannel(myChannelId, (p, step) => report(p, step));
        return `Rascunho pronto (${r.videos} vídeos lidos, ${r.captions} legendas novas). Confira a prévia e salve. Custo: ${money(r.costUsd)}.`;
      },
    );
    refresh(myChannelId);
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Salva o rascunho (pela mesma importação do .md) e apaga o rascunho. */
export async function applyProfileDraftAction(myChannelId: string, text: string): Promise<FormState> {
  const r = await applyProfileImport(myChannelId, text);
  if (r?.ok) await clearProfileDraft(myChannelId);
  refresh(myChannelId);
  return r;
}

export async function discardProfileDraftAction(myChannelId: string) {
  await clearProfileDraft(myChannelId);
  refresh(myChannelId);
}
