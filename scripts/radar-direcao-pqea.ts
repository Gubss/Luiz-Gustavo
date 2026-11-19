/**
 * Importa as 11 regras de "Para colar no Radar - direção de câmera" (vault do Gubs, versão enxuta de 19/11 18h5x) como lições de
 * direção do canal Por Que É Assim? (ChannelLesson source "direcao", scope "canal"). Texto literal de cada regra, com o dono entre parênteses e a linha de casos;
 * só decisões de roteiro e direção (erro de execução do editor fica no Checklist do Estúdio, não aqui).
 * Idempotente: regra com o mesmo texto já gravada no canal não é gravada de novo. Não chama IA.
 * Uso: npm run lessons:direction-pqea   (ou DATABASE_URL="file:./copia.db" npx tsx scripts/radar-direcao-pqea.ts)
 */
import { prisma } from "../src/lib/db";

export const PQEA_CAMERA_RULES = [
  "ROSTO DE QUEM FALA (fotografia). Quem fala dentro da cena tem o rosto visível (close ou três quartos), e o mesmo quadro mostra o que a fala cita: close no rosto com o objeto ao fundo, ou os personagens aproximados para caber todos. Os outros podem ficar de lado ou de costas, olhando para quem fala. Só a narração do menino contando a história pode ficar em off, sobre a ação exata que ela descreve.\nCasos: avó falando de perfil no fim da pipa (certo: close nela com a pipa alta ao fundo).",
  "PAI SEM ROSTO (cena). A câmera mostra a reação do menino, a sombra, a silhueta, as pernas ou o alto da cabeça (quadrada, como a de todos) atrás de um objeto opaco.\nCaso aprovado: menino no sofá olhando para o pai em silhueta.",
  "MÃE SEM ROSTO E SÓ EM CASA (roteiro e cena). Cena simples = só o braço pela porta (chinelo quando briga, objeto da cena quando não); ação = corpo cortado no pescoço; cena com a cabeça = câmera atrás ou ao lado. Nunca anda na rua, nunca abraça.",
  "O OBJETO CITADO APARECE (cena e fotografia). Toda fala que cita objeto pede um plano de destaque dele (close, inserto ou bloquinho com outra vista) e mostra onde ele fica. Fala que conta uma montagem pede a montagem passo a passo no objeto. Objetos do mesmo tipo na cena são de tipos diferentes, salvo o que a fala nomeia.\nCasos: estirante da pipa amarrado (certo); rodinhas do rolimã e mão-francesa da prateleira sem plano de destaque (errado).",
  "A CENA PREVÊ A AÇÃO E A REAÇÃO (cena). Quem solta pipa está do lado de fora, com o céu livre. Quem leva o tombo tem a reação escrita na cena.\nCasos: pipa caindo no Thor e ele se mexendo (certo); avó soltando pipa da porta (errado).",
  "CÂMERA VIVA E COM MOTIVO (fotografia). Um plano novo a cada 1–2 s e nenhum plano parado mais de 4 s; nada de \"apresentação de slide\". Zoom e close só no objeto ou na ação que a fala cita, nunca em nuca, barriga ou parte do corpo. A base é o carrinho de rolimã publicado.\nCasos: rolimã r1–r4 parado como slide; zoom na nuca e na barriga no rolimã B/C.",
  "TRANSIÇÃO NATURAL (cena). Ação que continua não tem corte (ou o corte mantém a velocidade); de um clima de drama para o seguinte, a luz e o tom seguem até a virada, sem corte seco de escuro para claro.",
  "CENÁRIO E LUZ (cena e fotografia). Luz de uma fonte visível, sempre do mesmo lado; geografia fixa (quem fica de cada lado, de onde a mãe entra, para onde o fio corre). Fundo de casa ou cidade, rua com calçada até o horizonte, nada acabando no vazio nem fora do lugar.",
  "SÓ O QUE O KIT FAZ (roteiro e cena). A direção não pede cena que a animação da família 3D não faz (multidão, água, corpo inteiro da mãe andando). Na dúvida, resolver com objeto, reação ou braço pela porta.",
  "RITMO, GANCHO E FECHO (roteiro). O primeiro quadro é o plano mais forte e mostra o que a primeira frase cita. A tensão sobe até o clímax e depois alivia. Cada ação que a fala cita aparece na tela. O fecho volta ao começo, sem pedir comentário ou inscrição (estrutura que prende).\nCasos: gancho dos balões sem o menino e o brigadeiro; Thor v2 sem crescimento.",
  "SOM (sonoplastia). Uma trilha linear do começo ao fim; a direção marca onde ela sai (só em drama sincero, descendo em ~3 s e voltando aos poucos), e o drama vem da imagem. Efeito só onde tem motivo, combinando com o objeto; golpe pede som de impacto.",
];

export async function importPqeaDirectionRules(now = new Date()) {
  // O nome no banco real é "Por que é assim?": compara sem caixa nem pontuação.
  const key = (s: string) => s.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, "");
  const channels = (await prisma.myChannel.findMany({ select: { id: true, name: true } })).filter((c) => key(c.name) === key("Por Que É Assim?"));
  if (channels.length !== 1) throw new Error(channels.length ? "Mais de um canal Por Que É Assim?; nada foi alterado." : "Canal Por Que É Assim? não encontrado; nada foi alterado.");
  const channel = channels[0];
  const existing = new Set(
    (await prisma.channelLesson.findMany({ where: { myChannelId: channel.id, source: "direcao" }, select: { text: true } })).map((l) => l.text),
  );
  const missing = PQEA_CAMERA_RULES.map((text, i) => ({ text, i })).filter((r) => !existing.has(r.text));
  // createdAt crescente mantém a ordem 1 → 11 no prompt dos diretores.
  await prisma.$transaction(
    missing.map((r) =>
      prisma.channelLesson.create({
        data: { myChannelId: channel.id, text: r.text, source: "direcao", scope: "canal", createdAt: new Date(now.getTime() + r.i) },
      }),
    ),
  );
  return { channelId: channel.id, created: missing.length, skipped: PQEA_CAMERA_RULES.length - missing.length };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/radar-direcao-pqea.ts")) {
  importPqeaDirectionRules()
    .then((r) => console.log(`Regras de câmera do Por Que É Assim?: ${r.created} gravadas, ${r.skipped} já existiam. Nenhuma geração executada.`))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
