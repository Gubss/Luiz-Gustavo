/**
 * Fecho do Por Que É Assim? pela regra de 16/11 (decisão do Gubs, posterior à nota de 15/11):
 * 1. Tira do perfil (MyChannel.rules) a linha que exige fecho com pergunta falada de duas opções. O texto antigo
 *    das regras vai inteiro para backups/radar-fecho-pqea-<data>.json (para reverter: colar o "antes" de volta no perfil).
 * 2. Grava como regra de roteiro do canal (ChannelLesson source "devolucao", scope "canal") a regra 10 inteira e só a
 *    parte de roteiro das regras 3 e 9 da nota "Para colar no Radar - direção de câmera". Chegam ao gerador de roteiro.
 * Idempotente: sem a linha no perfil, o perfil não muda; regra com o mesmo texto já gravada não é gravada de novo. Não chama IA.
 * Uso: npm run lessons:fecho-pqea   (ou DATABASE_URL="file:./copia.db" npx tsx scripts/radar-fecho-pqea.ts)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

export const PQEA_SCRIPT_RULES = [
  // Regra 3, só a parte de roteiro (a parte de câmera fica nas regras de direção).
  "MÃE SEM ROSTO E SÓ EM CASA (roteiro). Nunca anda na rua, nunca abraça.",
  // Regra 9, só a parte de roteiro ("A direção não pede" virou "O roteiro não pede").
  "SÓ O QUE O KIT FAZ (roteiro). O roteiro não pede cena que a animação da família 3D não faz (multidão, água, corpo inteiro da mãe andando). Na dúvida, resolver com objeto, reação ou braço pela porta.",
  // Regra 10 inteira (literal).
  "RITMO, GANCHO E FECHO (roteiro). O primeiro quadro é o plano mais forte e mostra o que a primeira frase cita. A tensão sobe até o clímax e depois alivia. Cada ação que a fala cita aparece na tela. O fecho volta ao começo, sem pedir comentário ou inscrição (estrutura que prende).\nCasos: gancho dos balões sem o menino e o brigadeiro; Thor v2 sem crescimento.",
];

/** Linha do perfil que manda fechar com pergunta de duas opções (contrária à regra 10). */
export const isOldClosingLine = (line: string) => /fecho/i.test(line) && /pergunta.*duas opções/i.test(line);

export async function applyPqeaClosingRule(now = new Date(), backupDir = join(process.cwd(), "backups")) {
  const key = (s: string) => s.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, "");
  const channels = (await prisma.myChannel.findMany({ select: { id: true, name: true, rules: true } })).filter((c) => key(c.name) === key("Por Que É Assim?"));
  if (channels.length !== 1) throw new Error(channels.length ? "Mais de um canal Por Que É Assim?; nada foi alterado." : "Canal Por Que É Assim? não encontrado; nada foi alterado.");
  const channel = channels[0];

  const before = channel.rules ?? "";
  const lines = before.split(/\r?\n/);
  const removed = lines.filter(isOldClosingLine);
  const after = lines.filter((l) => !isOldClosingLine(l)).join(before.includes("\r\n") ? "\r\n" : "\n");
  let backup: string | null = null;
  if (removed.length) {
    mkdirSync(backupDir, { recursive: true });
    backup = join(backupDir, `radar-fecho-pqea-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(backup, JSON.stringify({ channelId: channel.id, campo: "MyChannel.rules", removidas: removed, antes: before, depois: after }, null, 2), "utf8");
  }

  const existing = new Set((await prisma.channelLesson.findMany({ where: { myChannelId: channel.id, source: { not: "direcao" } }, select: { text: true } })).map((l) => l.text));
  const missing = PQEA_SCRIPT_RULES.map((text, i) => ({ text, i })).filter((r) => !existing.has(r.text));
  await prisma.$transaction([
    ...(removed.length ? [prisma.myChannel.update({ where: { id: channel.id }, data: { rules: after } })] : []),
    ...missing.map((r) =>
      prisma.channelLesson.create({
        data: { myChannelId: channel.id, text: r.text, source: "devolucao", scope: "canal", createdAt: new Date(now.getTime() + r.i) },
      }),
    ),
  ]);
  return { channelId: channel.id, removed, backup, created: missing.length, skipped: PQEA_SCRIPT_RULES.length - missing.length };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/radar-fecho-pqea.ts")) {
  applyPqeaClosingRule()
    .then((r) => {
      console.log(r.removed.length ? `Perfil: ${r.removed.length} linha(s) de fecho tirada(s):\n${r.removed.map((l) => `  ${l}`).join("\n")}\nTexto antigo inteiro em ${r.backup}` : "Perfil: nenhuma linha de fecho com pergunta; nada mudou.");
      console.log(`Regras de roteiro do Por Que É Assim?: ${r.created} gravadas, ${r.skipped} já existiam. Nenhuma geração executada.`);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
