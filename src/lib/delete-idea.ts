import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "./db";

export const IDEA_DELETE_BLOCKED = "Esta ideia já foi aprovada/produzida; arquive em vez de apagar";
export type DeleteIdeaResult = { message?: string };

export function isIdeaDeleteProtected(idea: Pick<Idea, "status" | "approvedVersionId" | "approvedAt">) {
  return ["PRODUCED", "PUBLISHED"].includes(idea.status) || idea.approvedVersionId !== null || idea.approvedAt !== null;
}

/** Call inside the same transaction as selection/cleanup to avoid approval races. */
export async function deleteIdeasInTransaction(tx: Prisma.TransactionClient, where: Prisma.IdeaWhereInput) {
  const ideas = await tx.idea.findMany({ where, select: { id: true, theme: true, chosenTitle: true, status: true, approvedVersionId: true, approvedAt: true } });
  const protectedIdeas = ideas.filter(isIdeaDeleteProtected);
  const protectedIds = new Set(protectedIdeas.map(i => i.id));
  const ids = ideas.filter(i => !protectedIds.has(i.id)).map(i => i.id);
  await tx.directionRun.deleteMany({ where: { version: { ideaId: { in: ids } } } });
  // VersionBase is Restrict too: detach only the versions being deleted.
  await tx.scriptVersion.updateMany({ where: { ideaId: { in: ids } }, data: { baseVersionId: null } });
  await tx.scriptVersion.deleteMany({ where: { ideaId: { in: ids } } });
  const deleted = await tx.idea.deleteMany({ where: { id: { in: ids } } });
  return { count: deleted.count, protectedIdeas };
}

export async function deleteIdeaSafely(ideaId: string): Promise<DeleteIdeaResult> {
  return prisma.$transaction(async tx => {
    const result = await deleteIdeasInTransaction(tx, { id: ideaId });
    return result.protectedIdeas.length ? { message: IDEA_DELETE_BLOCKED } : {};
  });
}
