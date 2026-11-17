/** Banco isolado para uma única geração real e testes de tela. Nunca faz setup/reset no radar.db. */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = "C:/Users/gubsB/Documents/GUBS OS/GUBS OS/.maestri/tmp/radar-missao/pqea-evidencias";
async function main() {
  if (!process.env.DATABASE_URL?.includes("test-pqea-ui.db")) throw new Error("Use exclusivamente test-pqea-ui.db.");
  await mkdir(evidence, { recursive: true });
  const source = new PrismaClient({ datasources: { db: { url: "file:./radar.db" } } });
  const target = resolve("prisma/test-pqea-ui.db").replace(/\\/g, "/");
  try { await source.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`); } finally { await source.$disconnect(); }
  const { prisma } = await import("../src/lib/db");
  try {
    const { getSettings } = await import("../src/lib/settings");
    const settings = await getSettings();
    const { costUsd } = await import("../src/lib/claude");
    const model = [settings.modelFast, settings.modelDeep].sort((a, b) => costUsd(a, 1000, 1000) - costUsd(b, 1000, 1000))[0];
    await prisma.setting.upsert({ where: { key: "modelDeep" }, create: { key: "modelDeep", value: model }, update: { value: model } });
    const format = await prisma.videoFormat.findFirstOrThrow({ where: { name: { contains: "Desmontando" } } });
    const channel = await prisma.myChannel.findFirstOrThrow({ where: { nicheId: format.nicheId, name: { contains: "Assim" } } });
    const empty = await prisma.videoFormat.create({ data: { nicheId: format.nicheId, name: "Teste de direção sem estudo", length: format.length } });
    const idea = await prisma.idea.create({ data: { myChannelId: channel.id, nicheId: format.nicheId, formatId: format.id, format: format.length, theme: "Teste técnico: a família monta um carrinho de rolimã e descobre a função das rodas e do freio.", titles: "[]" } });
    const ids = { formatId: format.id, emptyId: empty.id, channelId: channel.id, ideaId: idea.id, model };
    await writeFile(`${evidence}/run.json`, JSON.stringify(ids, null, 2));
    console.log(JSON.stringify(ids));
    if (!settings.anthropicApiKey) throw new Error("Chave Anthropic não configurada; geração real não executada.");
    const { generateScript } = await import("../src/lib/generator");
    const result = await generateScript(idea.id, { noRecipeOk: true });
    if (!result.data.planoCenas?.length) throw new Error("Geração sem plano de cenas.");
    await writeFile(`${evidence}/roteiro-teste.md`, result.version.markdown);
    await writeFile(`${evidence}/generation.json`, JSON.stringify({ model: result.model, scenes: result.data.planoCenas.length, lines: result.data.falado?.length, costUsd: result.costUsd }, null, 2));
    console.log(JSON.stringify({ scenes: result.data.planoCenas.length, costUsd: result.costUsd }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
