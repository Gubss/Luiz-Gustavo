/**
 * Limpeza depois dos formatos: apaga a cartilha antiga do nicho e as ideias/roteiros feitos antes dos formatos (sem formato).
 * Sempre faz a cópia de segurança do banco ANTES; se a cópia falhar, não apaga nada.
 * Nunca apaga estudos (vídeos, transcrições, diagnósticos) nem os roteiros aprovados do perfil (MyChannelScript).
 */
import { prisma } from "./db";
import { makeBackup, type BackupFile } from "./backup";

/** A ideia dos balões: fica (vai ser regenerada com formato depois da devolução). */
export const KEEP_IDEA_IDS = ["cmwgn1qge0009fs0wvgtyoms8"];

/** Ideias do nicho: as marcadas com o nicho e as dos meus canais que são desse nicho. */
const ideasOfNiche = (nicheId: string) => ({ OR: [{ nicheId }, { nicheId: null, myChannel: { nicheId } }] });

export async function cleanupPreview(nicheId: string) {
  const [playbooks, ideas, studies, scripts] = await Promise.all([
    prisma.nichePlaybook.findMany({ where: { nicheId }, orderBy: { createdAt: "desc" }, select: { id: true, format: true, createdAt: true, diagnosisCount: true } }),
    prisma.idea.findMany({
      where: { AND: [ideasOfNiche(nicheId), { formatId: null }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        theme: true,
        chosenTitle: true,
        titles: true,
        status: true,
        format: true,
        script: true,
        scriptData: true,
        createdAt: true,
        myChannel: { select: { name: true } },
        _count: { select: { myVideos: true } },
        publishedVideoId: true,
      },
    }),
    prisma.diagnosis.count(),
    prisma.myChannelScript.count(),
  ]);
  return { playbooks, ideas, keep: { studies, scripts } };
}

export type CleanupResult = { backup: BackupFile; playbooks: number; ideas: number; kept: string[] };

export class CleanupError extends Error {}

/**
 * Apaga o que foi escolhido. `ideaIds` só vale para ideias SEM formato deste nicho, e nunca as de KEEP_IDEA_IDS
 * (mesmo que venham marcadas). A cópia de segurança vem primeiro.
 */
export async function runCleanup(nicheId: string, opts: { playbooks: boolean; ideaIds: string[] }): Promise<CleanupResult> {
  const allowed = await prisma.idea.findMany({
    where: { AND: [ideasOfNiche(nicheId), { formatId: null }, { id: { in: opts.ideaIds } }, { id: { notIn: KEEP_IDEA_IDS } }] },
    select: { id: true },
  });
  if (!opts.playbooks && !allowed.length) throw new CleanupError("Nada marcado para apagar.");
  let backup: BackupFile;
  try {
    backup = await makeBackup();
  } catch (e) {
    throw new CleanupError(`Não consegui fazer a cópia de segurança, então não apaguei nada. (${e instanceof Error ? e.message : String(e)})`);
  }
  const ids = allowed.map((x) => x.id);
  const [pb, ideas] = await prisma.$transaction([
    prisma.nichePlaybook.deleteMany({ where: opts.playbooks ? { nicheId } : { id: "__nada__" } }),
    prisma.idea.deleteMany({ where: { id: { in: ids } } }),
  ]);
  const kept = (await prisma.idea.findMany({ where: { id: { in: KEEP_IDEA_IDS } }, select: { theme: true, chosenTitle: true } })).map((x) => x.chosenTitle || x.theme);
  return { backup, playbooks: pb.count, ideas: ideas.count, kept };
}
