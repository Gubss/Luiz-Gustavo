"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { FormState } from "@/app/video/actions";
import { INSTRUCTION_FIELDS } from "@/lib/direction-instructions";
import { writeStudyRequest } from "@/lib/direction-study";
import { createDirection, deleteDirection, setChannelDefaultDirection, setFormatDirection, updateDirection } from "@/lib/directions";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");
const fieldsOf = (fd: FormData) => Object.fromEntries(INSTRUCTION_FIELDS.map((k) => [k, fd.get(k)]));

function refresh(id?: string) {
  revalidatePath("/direcoes");
  if (id) revalidatePath(`/direcoes/${id}`);
  revalidatePath("/formatos", "layout");
}

export async function createDirectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  try {
    const mode = fd.get("modo") === "copia" ? "copia" : fd.get("modo") === "estudo" ? "estudo" : "manual";
    let study = String(fd.get("estudo") ?? "");
    const file = fd.get("arquivo");
    if (mode === "estudo" && file instanceof File && file.size) study = await file.text();
    const d = await createDirection({ name: String(fd.get("nome") ?? ""), description: String(fd.get("descricao") ?? ""), mode, fromId: String(fd.get("de") ?? ""), study, fields: fieldsOf(fd) });
    id = d.id;
    refresh();
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(`/direcoes/${id}`);
}

export async function updateDirectionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await updateDirection(id, { name: String(fd.get("nome") ?? ""), description: String(fd.get("descricao") ?? ""), fields: fieldsOf(fd) });
    refresh(id);
    return { ok: "Direção salva. Vale para todos os formatos que usam ela; direções de vídeo já começadas mantêm o que usaram." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteDirectionAction(id: string): Promise<FormState> {
  try {
    await deleteDirection(id);
    refresh();
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect("/direcoes");
}

export async function requestDirectionStudyAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const d = await prisma.direction.findUniqueOrThrow({ where: { id } });
    await writeStudyRequest({ id: d.id, name: `Direção ${d.name}` }, String(fd.get("links") ?? ""));
    return { ok: "Pedido salvo para o GEPETO estudar fora do Radar. Nenhuma API foi chamada. O estudo volta como direção nova (Direções → a partir de estudo)." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setChannelDefaultAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const canal = String(fd.get("canal") ?? "");
    if (!canal) return { error: "Escolha o canal." };
    await setChannelDefaultDirection(canal, id);
    refresh(id);
    return { ok: "Agora é a direção padrão do canal: formatos novos dele já vêm com ela." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setFormatDirectionAction(formatId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const v = String(fd.get("direcao") ?? "");
    await setFormatDirection(formatId, v || null);
    refresh();
    revalidatePath(`/formatos/${formatId}`);
    return { ok: v ? "Direção do formato trocada. Vale para as próximas direções de vídeo." : "Formato sem direção: usa as caixas antigas dele." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
