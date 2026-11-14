"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { FormState } from "@/app/video/actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const optInt = (fd: FormData, k: string) => {
  const n = parseInt(str(fd, k).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

function refresh(id?: string) {
  revalidatePath("/meus-canais");
  if (id) revalidatePath(`/meus-canais/${id}`);
  revalidatePath("/gerador");
}

export async function createMyChannel(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const c = await prisma.myChannel.create({
    data: {
      name,
      url: optStr(fd, "url"),
      nicheId: optStr(fd, "nicheId"),
      status: str(fd, "status") || "RESEARCH",
      format: str(fd, "format") === "long" ? "long" : "short",
    },
  });
  refresh();
  redirect(`/meus-canais/${c.id}`);
}

export async function saveProfile(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  if (!name) return { error: "O canal precisa de um nome." };
  await prisma.myChannel.update({
    where: { id },
    data: {
      name,
      url: optStr(fd, "url"),
      nicheId: optStr(fd, "nicheId"),
      status: str(fd, "status") || "RESEARCH",
      format: str(fd, "format") === "long" ? "long" : "short",
      platforms: optStr(fd, "platforms"),
      durationSec: optInt(fd, "durationSec"),
      concept: optStr(fd, "concept"),
      characters: optStr(fd, "characters"),
      storyFormats: optStr(fd, "storyFormats"),
      visualStyle: optStr(fd, "visualStyle"),
      tone: optStr(fd, "tone"),
      audience: optStr(fd, "audience"),
      rules: optStr(fd, "rules"),
      notes: optStr(fd, "notes"),
    },
  });
  refresh(id);
  return { ok: "Perfil salvo." };
}

export async function saveScript(myChannelId: string, scriptId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const title = str(fd, "title");
  const script = str(fd, "script");
  if (!title) return { error: "Dê um título (o título do vídeo publicado)." };
  if (script.length < 20) return { error: "Cole o roteiro inteiro (falas e, se quiser, as cenas)." };
  const data = { title, script, url: optStr(fd, "url"), views: optInt(fd, "views"), notes: optStr(fd, "notes") };
  if (scriptId) await prisma.myChannelScript.update({ where: { id: scriptId }, data });
  else await prisma.myChannelScript.create({ data: { ...data, myChannelId } });
  refresh(myChannelId);
  return { ok: scriptId ? "Roteiro atualizado." : "Roteiro adicionado." };
}

export async function deleteScript(myChannelId: string, scriptId: string) {
  await prisma.myChannelScript.delete({ where: { id: scriptId } });
  refresh(myChannelId);
}

export async function deleteMyChannelFromProfile(id: string) {
  await prisma.myChannel.delete({ where: { id } });
  refresh();
  redirect("/meus-canais");
}
