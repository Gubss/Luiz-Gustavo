"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { addChannelToNiche, refreshChannels } from "@/lib/channels";
import { studiedVideoFilter } from "@/lib/videos";

export type FormState = { ok?: string; error?: string } | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createNiche(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  const n = await prisma.niche.create({ data: { name, description: str(fd, "description") || null } });
  redirect(`/nichos/${n.id}`);
}

export async function updateNiche(id: string, fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  await prisma.niche.update({ where: { id }, data: { name, description: str(fd, "description") || null } });
  revalidatePath(`/nichos/${id}`);
}

export async function deleteNiche(id: string) {
  // Remove o nicho e os vínculos. Canais que ficarem sem nicho são removidos também,
  // menos os que têm vídeos estudados (transcrição/diagnóstico/favorito), que ficam guardados.
  await prisma.niche.delete({ where: { id } });
  await prisma.channel.deleteMany({ where: { niches: { none: {} }, videos: { none: studiedVideoFilter } } });
  redirect("/nichos");
}

export async function addChannels(nicheId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const lines = str(fd, "channels")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: "Cole ao menos uma URL, @handle ou ID." };
  if (lines.length > 50) return { error: "Adicione no máximo 50 canais por vez." };

  const added: string[] = [];
  const already: string[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    try {
      const r = await addChannelToNiche(nicheId, line);
      (r.alreadyInNiche ? already : added).push(r.channel.title);
    } catch (e) {
      errors.push(`${line}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  revalidatePath(`/nichos/${nicheId}`);
  const parts: string[] = [];
  if (added.length) parts.push(`Adicionado: ${added.join(", ")}.`);
  if (already.length) parts.push(`Já estava no nicho: ${already.join(", ")}.`);
  return { ok: parts.join(" ") || undefined, error: errors.length ? errors.join("\n") : undefined };
}

export async function removeChannel(nicheId: string, channelId: string) {
  await prisma.nicheChannel.delete({ where: { nicheId_channelId: { nicheId, channelId } } });
  const remaining = await prisma.nicheChannel.count({ where: { channelId } });
  if (remaining === 0) {
    const studied = await prisma.video.count({ where: { channelId, ...studiedVideoFilter } });
    if (studied === 0) await prisma.channel.delete({ where: { id: channelId } });
  }
  revalidatePath(`/nichos/${nicheId}`);
}

export async function refreshNicheChannels(nicheId: string): Promise<FormState> {
  const links = await prisma.nicheChannel.findMany({ where: { nicheId }, select: { channelId: true } });
  if (links.length === 0) return { error: "Nenhum canal para atualizar." };
  try {
    const r = await refreshChannels({ force: true, channelIds: links.map((l) => l.channelId) });
    revalidatePath(`/nichos/${nicheId}`);
    return { ok: `${r.updated} canais atualizados (${r.units} unidade${r.units === 1 ? "" : "s"} de cota).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao atualizar." };
  }
}

export async function addMyChannel(nicheId: string, fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  await prisma.myChannel.create({
    data: { nicheId, name, url: str(fd, "url") || null, status: str(fd, "status") || "RESEARCH" },
  });
  revalidatePath(`/nichos/${nicheId}`);
}

export async function updateMyChannelStatus(nicheId: string, id: string, fd: FormData) {
  await prisma.myChannel.update({ where: { id }, data: { status: str(fd, "status") } });
  revalidatePath(`/nichos/${nicheId}`);
}

export async function deleteMyChannel(nicheId: string, id: string) {
  await prisma.myChannel.delete({ where: { id } });
  revalidatePath(`/nichos/${nicheId}`);
}
