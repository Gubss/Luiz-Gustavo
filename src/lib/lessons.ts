/**
 * O que o canal aprende com as devoluções do Estúdio e as correções de fala (Gubs, 19/11).
 * Cada ponto é "canal" (vira ChannelLesson e entra em todos os formatos do canal) ou
 * "roteiro" (fica só em returnNotes, no projeto). O padrão é "roteiro".
 * Grava a frase que o Gubs escreveu, sem resumo: o gerador aplica pelo princípio.
 */
import { prisma } from "@/lib/db";
import { returnPoints } from "@/lib/speech";

export type LessonScope = "canal" | "roteiro";
export type ReturnPoint = { text: string; scope: LessonScope };

export const scopeOf = (v: unknown): LessonScope => (String(v ?? "") === "canal" ? "canal" : "roteiro");

/** Lê os pontos do formulário de devolução: `ponto` (em ordem) + `escopo-<i>`. Sem `ponto`, divide o texto colado e tudo fica "roteiro". */
export function returnPointsFromForm(fd: FormData): { raw: string; points: ReturnPoint[] } {
  const raw = String(fd.get("returnNotes") ?? "").trim();
  const listed = fd.getAll("ponto").map((p) => String(p).trim());
  const points = listed.length
    ? listed.map((text, i) => ({ text, scope: scopeOf(fd.get(`escopo-${i}`)) })).filter((p) => p.text.length >= 3)
    : returnPoints(raw).map((text) => ({ text, scope: "roteiro" as const }));
  return { raw, points };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function returnMessage(channel: number, script: number) {
  return `Devolução registrada: ${plural(channel, "ponto virou regra do canal", "pontos viraram regra do canal")} e ${plural(script, "ficou só neste roteiro", "ficaram só neste roteiro")}.`;
}

/** Registra a devolução: a ideia fica "devolvida", o texto inteiro vai para returnNotes e só os pontos "canal" viram lição. */
export async function recordReturn(ideaId: string, raw: string, points: ReturnPoint[], now = new Date()) {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { myChannelId: true, formatId: true, returnNotes: true } });
  if (!idea.myChannelId) throw new Error("Essa ideia não está ligada a um canal seu.");
  if (!points.length) throw new Error("Cole os pontos em que o roteiro foi reprovado (um por linha).");
  const stamp = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const body = raw || points.map((p) => `- ${p.text}`).join("\n");
  const channel = points.filter((p) => p.scope === "canal");
  const marked = channel.length ? `\nViraram regra do canal:\n${channel.map((p) => `- ${p.text}`).join("\n")}` : "";
  await prisma.$transaction([
    prisma.idea.update({
      where: { id: ideaId },
      data: {
        status: "RETURNED",
        returnedAt: now,
        returnNotes: [idea.returnNotes, `Devolução de ${stamp}:\n${body}${marked}`].filter(Boolean).join("\n\n"),
      },
    }),
    ...channel.map((p) =>
      prisma.channelLesson.create({
        data: { myChannelId: idea.myChannelId!, ideaId, formatId: idea.formatId, text: p.text.slice(0, 1000), source: "devolucao", scope: "canal" },
      }),
    ),
  ]);
  return { myChannelId: idea.myChannelId, channel: channel.length, script: points.length - channel.length };
}

/** Correção de fala marcada "canal todo": o pedido dele vira lição do canal. */
export async function recordCorrectionLesson(ideaId: string, request: string) {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { myChannelId: true, formatId: true } });
  if (!idea.myChannelId || !request.trim()) return null;
  return prisma.channelLesson.create({
    data: { myChannelId: idea.myChannelId, ideaId, formatId: idea.formatId, text: request.trim().slice(0, 1000), source: "correcao", scope: "canal" },
  });
}

/** Correção da direção marcada "canal todo": o pedido vira regra de direção do canal (source "direcao"). */
export async function recordDirectionLesson(ideaId: string, request: string) {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: ideaId }, select: { myChannelId: true, formatId: true } });
  if (!idea.myChannelId || !request.trim()) return null;
  return prisma.channelLesson.create({
    data: { myChannelId: idea.myChannelId, ideaId, formatId: idea.formatId, text: request.trim().slice(0, 1000), source: "direcao", scope: "canal" },
  });
}

/** Cabeçalho do bloco de direção: as regras valem pelo princípio, não pelo texto literal. */
export const DIRECTION_LESSONS_HEADER =
  "REGRAS DE DIREÇÃO DO CANAL (o Gubs marcou para o canal todo; valem em toda cena de todo episódio): aplique cada regra pelo princípio (a técnica por trás dela), não pelo texto literal; o exemplo é só o caso em que o erro apareceu. Use o que couber nesta etapa. As intenções do Gubs desta versão prevalecem se conflitarem.";

/** Lições de direção do canal, da mais antiga à mais recente (as 40 últimas). Só source "direcao". */
export async function directionLessonsBlock(myChannelId: string | null | undefined) {
  if (!myChannelId) return "";
  const rows = await prisma.channelLesson.findMany({
    where: { myChannelId, source: "direcao" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
    select: { text: true },
  });
  if (!rows.length) return "";
  return [DIRECTION_LESSONS_HEADER, ...rows.reverse().map((r) => "- " + r.text)].join("\n");
}
