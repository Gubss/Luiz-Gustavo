/**
 * Direções reutilizáveis (v3, Gubs 17/11): conjuntos de geral/cena/fotografia/som com nome.
 * Cada formato escolhe uma; os diretores leem a direção do formato. Formato antigo sem direção
 * continua lendo as próprias caixas (nada se perde).
 */
import type { Direction, VideoFormat } from "@prisma/client";
import { prisma } from "./db";
import { INSTRUCTION_FIELDS, normalizeInstructions, type DirectionInstructions } from "./direction-instructions";

export const DIRECTION_ORIGINS: Record<string, string> = { manual: "escrita à mão", copia: "cópia", estudo: "de estudo", migracao: "veio do formato" };
export const NAME_MAX = 80;
export const DIRECTION_BOXES = [
  ["directionGeneral", "Geral de gravação"],
  ["directionScene", "Diretor de cena"],
  ["directionPhotography", "Diretor de fotografia"],
  ["directionSound", "Diretor de som e trilha"],
] as const;


type FormatWithDirection = Pick<VideoFormat, (typeof INSTRUCTION_FIELDS)[number]> & { direction?: Pick<Direction, (typeof INSTRUCTION_FIELDS)[number]> | null };

/** As 4 instruções que valem para o formato: as da direção escolhida; sem direção, as caixas antigas do próprio formato. */
export function effectiveInstructions(f: FormatWithDirection | null | undefined): DirectionInstructions | null {
  if (!f) return null;
  const src = f.direction ?? f;
  return Object.fromEntries(INSTRUCTION_FIELDS.map((k) => [k, src[k] ?? null])) as DirectionInstructions;
}

export function directionsList() {
  return prisma.direction.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { _count: { select: { formats: true } }, defaultChannels: { select: { id: true, name: true } } },
  });
}

/** Direção padrão para um formato novo: a do canal; sem canal, a de um canal do mesmo nicho. */
export async function defaultDirectionId(opts: { myChannelId?: string | null; nicheId?: string | null }) {
  if (opts.myChannelId) {
    const c = await prisma.myChannel.findUnique({ where: { id: opts.myChannelId }, select: { defaultDirectionId: true } });
    if (c?.defaultDirectionId) return c.defaultDirectionId;
  }
  if (opts.nicheId) {
    const c = await prisma.myChannel.findFirst({ where: { nicheId: opts.nicheId, defaultDirectionId: { not: null } }, select: { defaultDirectionId: true }, orderBy: { createdAt: "asc" } });
    if (c?.defaultDirectionId) return c.defaultDirectionId;
  }
  return null;
}

function cleanName(name: string) {
  const n = name.replace(/\s+/g, " ").trim();
  if (!n) throw new Error("Dê um nome à direção (ex.: Cinematográfica).");
  return n.slice(0, NAME_MAX);
}

/** Criar: à mão (caixas), copiando outra, ou a partir de um estudo colado (vai para consulta e para a Geral). */
export async function createDirection(input: { name: string; description?: string; mode: "manual" | "copia" | "estudo"; fromId?: string; study?: string; fields?: Record<string, unknown> }) {
  const name = cleanName(input.name);
  const description = input.description?.trim() || null;
  if (input.mode === "copia") {
    const src = await prisma.direction.findUnique({ where: { id: input.fromId ?? "" } });
    if (!src) throw new Error("Escolha a direção para copiar.");
    return prisma.direction.create({
      data: {
        name,
        description: description ?? `Cópia de “${src.name}”.`,
        ...Object.fromEntries(INSTRUCTION_FIELDS.map((k) => [k, src[k]])),
        study: src.study,
        origin: "copia",
        copiedFromId: src.id,
      },
    });
  }
  if (input.mode === "estudo") {
    const study = (input.study ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
    if (study.length < 40) throw new Error("Cole o estudo de direção (o texto que o GEPETO devolveu).");
    if (study.length > 30000) throw new Error("Estudo grande demais: use até 30.000 caracteres.");
    // Sem IA: o estudo inteiro vai para a Geral (todo diretor recebe); as funções você separa depois, na tela da direção.
    return prisma.direction.create({ data: { name, description, directionGeneral: study, study, origin: "estudo" } });
  }
  const fields = normalizeInstructions(input.fields ?? {});
  return prisma.direction.create({ data: { name, description, ...fields, origin: "manual" } });
}

export async function updateDirection(id: string, input: { name: string; description?: string; fields: Record<string, unknown> }) {
  return prisma.direction.update({
    where: { id },
    data: { name: cleanName(input.name), description: input.description?.trim() || null, ...normalizeInstructions(input.fields) },
  });
}

export async function setFormatDirection(formatId: string, directionId: string | null) {
  if (directionId) await prisma.direction.findUniqueOrThrow({ where: { id: directionId } });
  return prisma.videoFormat.update({ where: { id: formatId }, data: { directionId } });
}

export async function setChannelDefaultDirection(myChannelId: string, directionId: string | null) {
  if (directionId) await prisma.direction.findUniqueOrThrow({ where: { id: directionId } });
  return prisma.myChannel.update({ where: { id: myChannelId }, data: { defaultDirectionId: directionId } });
}

/** Apagar só se nenhum formato usa (para não deixar formato sem direção por acidente). */
export async function deleteDirection(id: string) {
  const used = await prisma.videoFormat.count({ where: { directionId: id } });
  if (used) throw new Error(`Esta direção está em ${used} ${used === 1 ? "formato" : "formatos"}. Troque a direção deles antes de apagar.`);
  await prisma.direction.delete({ where: { id } });
}
