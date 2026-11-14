"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startJob } from "@/lib/jobs";
import {
  analyzeCandidate,
  discoverBySearch,
  discoverFromLink,
  discoverFeatured,
  monitorCandidate,
  setCandidateStatus,
  type Format,
  type LongDuration,
} from "@/lib/discover";

export type FormState = { ok?: string; error?: string } | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const BACKGROUND_OK = "Começou em segundo plano. Pode sair desta tela: o aviso no canto mostra o andamento e quando terminar.";
const nicheName = async (id: string) => (await prisma.niche.findUniqueOrThrow({ where: { id }, select: { name: true } })).name;
const discoverHref = (nicheId: string) => `/descobrir?niche=${nicheId}`;

function done() {
  // O layout também muda (contador de cota na barra lateral).
  revalidatePath("/", "layout");
}

export async function searchAction(nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const keywords = str(fd, "keywords")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const format: Format = str(fd, "format") === "long" ? "long" : "short";
  const ld = str(fd, "longDuration");
  const days = Number(str(fd, "days"));
  try {
    if (!keywords.length) throw new Error("Escreva ao menos uma palavra-chave.");
    const opts = {
      nicheId,
      keywords,
      format,
      longDuration: (["medium", "long", "any"].includes(ld) ? ld : "medium") as LongDuration,
      days: [0, 30, 90, 180, 365].includes(days) ? days : 90,
      order: (str(fd, "order") === "relevance" ? "relevance" : "viewCount") as "relevance" | "viewCount",
      language: str(fd, "language") || undefined,
      region: str(fd, "region") || undefined,
    };
    await startJob(
      { kind: "discover", targetId: nicheId, label: `Descobrir (${keywords.length} palavra${keywords.length === 1 ? "" : "s"}): ${await nicheName(nicheId)}`, href: discoverHref(nicheId), expectedSec: 6 + 4 * keywords.length },
      async (report) => (await discoverBySearch({ ...opts, onProgress: (p, step) => report(p, step) })).message,
    );
    done();
    return { ok: BACKGROUND_OK };
  } catch (e) {
    done();
    return { error: errMsg(e) };
  }
}

export async function featuredAction(nicheId: string): Promise<FormState> {
  try {
    await startJob(
      { kind: "discover", targetId: nicheId, label: `Canais indicados: ${await nicheName(nicheId)}`, href: discoverHref(nicheId), expectedSec: 20 },
      async (report) => (await discoverFeatured(nicheId, (p, step) => report(p, step))).message,
    );
    done();
    return { ok: BACKGROUND_OK };
  } catch (e) {
    done();
    return { error: errMsg(e) };
  }
}

export async function monitorAction(id: string): Promise<FormState> {
  try {
    const ch = await monitorCandidate(id);
    done();
    return { ok: `${ch.title} agora é monitorado. Os vídeos dele entram no radar na próxima coleta.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function analyzeAction(id: string): Promise<FormState> {
  try {
    const c = await prisma.discoveredChannel.findUniqueOrThrow({ where: { id }, select: { title: true, nicheId: true } });
    await startJob({ kind: "xray", targetId: id, label: `Raio-x: ${c.title}`, href: discoverHref(c.nicheId), expectedSec: 10 }, async () => {
      await analyzeCandidate(id);
      return "Raio-x pronto.";
    });
    done();
    return { ok: "Raio-x em segundo plano…" };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function dismissAction(id: string) {
  await setCandidateStatus(id, "dismissed");
  done();
}

export async function restoreAction(id: string) {
  await setCandidateStatus(id, "new");
  done();
}

/** Canais parecidos com um link (vídeo ou canal), em segundo plano. */
export async function linkAction(nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const link = str(fd, "link");
  const f = str(fd, "format");
  const format = f === "short" || f === "long" ? f : "auto";
  const n = Math.max(1, Math.min(3, Number(str(fd, "keywordCount")) || 2));
  const days = Number(str(fd, "days"));
  try {
    if (!link) throw new Error("Cole o link de um vídeo ou de um canal.");
    await startJob(
      { kind: "discover", targetId: nicheId, label: `Parecidos com um link: ${await nicheName(nicheId)}`, href: discoverHref(nicheId), expectedSec: 12 + 4 * n },
      async (report) =>
        (
          await discoverFromLink({
            nicheId,
            link,
            format,
            keywordCount: n,
            days: [0, 30, 90, 180, 365].includes(days) ? days : 365,
            onProgress: (p, step) => report(p, step),
          })
        ).message,
    );
    done();
    return { ok: BACKGROUND_OK };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
