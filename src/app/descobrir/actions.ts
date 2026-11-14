"use server";

import { revalidatePath } from "next/cache";
import {
  analyzeCandidate,
  discoverBySearch,
  discoverFeatured,
  monitorCandidate,
  setCandidateStatus,
  type Format,
  type LongDuration,
} from "@/lib/discover";

export type FormState = { ok?: string; error?: string } | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

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
    const r = await discoverBySearch({
      nicheId,
      keywords,
      format,
      longDuration: (["medium", "long", "any"].includes(ld) ? ld : "medium") as LongDuration,
      days: [0, 30, 90, 180, 365].includes(days) ? days : 90,
      order: str(fd, "order") === "relevance" ? "relevance" : "viewCount",
      language: str(fd, "language") || undefined,
      region: str(fd, "region") || undefined,
    });
    done();
    return { ok: r.message };
  } catch (e) {
    done();
    return { error: errMsg(e) };
  }
}

export async function featuredAction(nicheId: string): Promise<FormState> {
  try {
    const r = await discoverFeatured(nicheId);
    done();
    return { ok: r.message };
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
    await analyzeCandidate(id);
    done();
    return { ok: "Raio-x pronto." };
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
