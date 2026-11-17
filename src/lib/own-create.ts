/**
 * Inserções sem IA para o que o Gubs traz pronto: a história (a), as ideias (b) e o formato escrito à mão (c).
 * Nenhuma função aqui chama o Claude.
 */
import { prisma } from "./db";
import { ensureProjectCode } from "./script-versions";
import { GeneratorError, type IdeaData } from "./generator";
import { parseOwnIdeas, parseStory } from "./own-story";

async function channelAndFormat(myChannelId: string, formatId: string) {
  const channel = await prisma.myChannel.findUnique({ where: { id: myChannelId } });
  if (!channel) throw new GeneratorError("Escolha um canal.");
  const vf = await prisma.videoFormat.findUnique({ where: { id: formatId } });
  if (!vf) throw new GeneratorError("Escolha um formato.");
  if (channel.nicheId && vf.nicheId !== channel.nicheId) throw new GeneratorError("Esse formato é de outro nicho.");
  return { channel, vf };
}

const emptyIdea = (tema: string, premissa: string): IdeaData => ({
  tema,
  premissa,
  formatoDeHistoria: "",
  gancho: "",
  ganchoPadrao: "",
  titulos: [{ titulo: tema, formula: "do Gubs" }],
  adaptacao: { daCartilha: "", doCanal: "" },
  porQueVaiFuncionar: "",
  risco: "",
});

/** Linha "**Proposta:** …" do .md, ou o começo do texto. */
export function storyPremise(md: string) {
  const p = md.match(/^\*\*Proposta:\*\*\s*(.+)$/im)?.[1]?.trim();
  if (p) return p;
  const body = md.replace(/^#.*$/gm, "").replace(/\*\*/g, "").trim();
  return body.slice(0, 400);
}

/** (a) A história vira uma ideia (sem IA); o roteiro sai depois, pelo gerador, preservando o que ela pede. */
export async function createStoryIdea(input: { myChannelId: string; formatId: string; markdown: string; manterFalas: boolean; title?: string }) {
  const md = input.markdown.trim();
  if (md.length < 80) throw new GeneratorError("Cole a história inteira (o .md) ou suba o arquivo.");
  const { channel, vf } = await channelAndFormat(input.myChannelId, input.formatId);
  const historia = parseStory(md, input.manterFalas);
  const title = input.title?.trim() || historia.title;
  const data: IdeaData = { ...emptyIdea(title, storyPremise(md)), historia };
  const idea = await prisma.idea.create({
    data: {
      myChannelId: channel.id,
      nicheId: vf.nicheId,
      format: vf.length === "long" ? "long" : "short",
      formatId: vf.id,
      theme: title,
      justification: "História do Gubs",
      titles: JSON.stringify([title]),
      chosenTitle: title,
      status: "IDEA",
      ideaData: JSON.stringify(data),
      ideaCostUsd: 0,
      notes: "História do Gubs (roteiro a partir da minha história).",
    },
  });
  await ensureProjectCode(idea.id);
  return idea;
}

/** (b) Uma ideia por linha (ou por seção "## 1." do banco de ideias); a premissa é o texto dele, literal. */
export async function createOwnIdeas(input: { myChannelId: string; formatId: string; text: string }) {
  const items = parseOwnIdeas(input.text);
  if (!items.length) throw new GeneratorError("Escreva pelo menos uma ideia (uma por linha).");
  const { channel, vf } = await channelAndFormat(input.myChannelId, input.formatId);
  const created = [];
  for (const it of items) {
    const data: IdeaData = { ...emptyIdea(it.tema, it.premissa), doGubs: true };
    const idea = await prisma.idea.create({
      data: {
        myChannelId: channel.id,
        nicheId: vf.nicheId,
        format: vf.length === "long" ? "long" : "short",
        formatId: vf.id,
        theme: it.tema,
        justification: "Ideia do Gubs",
        titles: JSON.stringify([it.tema]),
        chosenTitle: it.tema,
        status: "IDEA",
        ideaData: JSON.stringify(data),
        ideaCostUsd: 0,
        notes: "Ideia do Gubs.",
      },
    });
    await ensureProjectCode(idea.id);
    created.push(idea);
  }
  return created;
}

/** (c) Formato sem vídeo de referência: as regras escritas viram narrativeRules; o exemplo vira roteiro do canal (amostra de voz). */
export async function createManualFormat(input: {
  myChannelId: string;
  name: string;
  length: "short" | "long";
  rules: string;
  exampleTitle?: string;
  example?: string;
}) {
  const name = input.name.trim();
  const rules = input.rules.trim();
  if (!name) throw new GeneratorError("Dê um nome ao formato.");
  if (rules.length < 40) throw new GeneratorError("Escreva como é o formato em 3 a 6 linhas (gancho, estrutura, duração, quem fala, tom).");
  const channel = await prisma.myChannel.findUnique({ where: { id: input.myChannelId } });
  if (!channel) throw new GeneratorError("Escolha um canal.");
  if (!channel.nicheId) throw new GeneratorError("Esse canal ainda não tem nicho. Escolha o nicho no perfil do canal.");
  const firstLine = rules.split("\n").map((l) => l.replace(/^[-*#\s]+/, "").trim()).find(Boolean) ?? "";
  return prisma.$transaction(async (tx) => {
    const vf = await tx.videoFormat.create({
      data: { nicheId: channel.nicheId!, name, length: input.length, description: firstLine.slice(0, 240), narrativeRules: rules },
    });
    if (input.example?.trim())
      await tx.myChannelScript.create({
        data: { myChannelId: channel.id, formatId: vf.id, title: input.exampleTitle?.trim() || `Exemplo de ${name}`, script: input.example.trim(), integrity: "complete", notes: "Exemplo escrito à mão no formato novo." },
      });
    return vf;
  });
}
