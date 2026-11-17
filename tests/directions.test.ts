/**
 * Direções reutilizáveis (v3): a migração transforma as 4 caixas do formato em uma Direção sem mudar o texto,
 * e o pedido montado para os diretores fica idêntico antes e depois. Sem IA: só monta o pedido.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const DB = `prisma/test-directions-${process.pid}.db`;
process.env.DATABASE_URL = "file:./" + DB.replace("prisma/", "");
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
rmSync(DB, { force: true });
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "ignore", windowsHide: true });

const MIGRATION = readFileSync("prisma/migrations/20261117200000_direcoes_e_diagnostico/migration.sql", "utf8");
/** O bloco de dados da migração (o mesmo que roda no banco do Gubs). */
const dataStatements = () =>
  MIGRATION.slice(MIGRATION.indexOf("\n", MIGRATION.indexOf("-- DADOS v3")))
    .split(/;\s*\n/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);

const LEGACY = {
  directionGeneral: "GERAL: família 3D, câmera na altura do menino.\nLinha 2 com acentuação — ç ã é.",
  directionScene: "CENA: uma cena por acontecimento.",
  directionPhotography: "FOTO: luz de janela, 9:16.",
  directionSound: "SOM: voz primeiro; trilha baixa.",
};

async function fixture() {
  const { prisma } = await import("../src/lib/db");
  const { appendVersion, approveVersion } = await import("../src/lib/script-versions");
  const niche = await prisma.niche.create({ data: { name: "Curiosidades" } });
  const format = await prisma.videoFormat.create({ data: { name: "Desmontando o Mundo", nicheId: niche.id, ...LEGACY, directionStudy: "## B. Direção\nLuz motivada" } });
  const channel = await prisma.myChannel.create({ data: { name: "Por que é assim?", nicheId: niche.id, characters: "Menino, Avó" } });
  await prisma.channelFormat.create({ data: { myChannelId: channel.id, formatId: format.id, howText: "Mesmo motor" } });
  const idea = await prisma.idea.create({ data: { theme: "Vó", titles: "[]", format: "short", formatId: format.id, myChannelId: channel.id } });
  const content = JSON.stringify({ titulo: "Vó", duracaoSeg: 60, falado: [{ personagem: "Menino", fala: "Vó?" }, { personagem: "Avó", fala: "Tô aqui." }], cenas: [] });
  const version = await appendVersion({ ideaId: idea.id, expectedVersionId: null, content, markdown: () => "x", category: "história", origin: "test" });
  await approveVersion(idea.id, version.id);
  return { prisma, niche, format, channel, idea, content };
}

async function prompts(ideaId: string, content: string) {
  const { initialContext, directionRequest } = await import("../src/lib/directors");
  const ctx = await initialContext(ideaId, content);
  return (["scene", "photography", "sound"] as const).map((stage) => directionRequest(stage, content, { ...ctx, scene: "{}", photography: "{}" }));
}

test("migração: Desmontando o Mundo vira a direção “Padrão do canal — família 3D” e o pedido aos diretores fica idêntico", async () => {
  const { prisma, format, channel, idea, content } = await fixture();
  const before = await prompts(idea.id, content);
  assert.match(before[0].user, /GERAL: família 3D/);

  for (const sql of dataStatements()) await prisma.$executeRawUnsafe(sql);

  const f = await prisma.videoFormat.findUniqueOrThrow({ where: { id: format.id }, include: { direction: true } });
  assert.ok(f.direction, "o formato aponta para a direção");
  assert.equal(f.direction!.name, "Padrão do canal — família 3D");
  assert.equal(f.direction!.origin, "migracao");
  for (const [k, v] of Object.entries(LEGACY)) assert.equal(f.direction![k as keyof typeof LEGACY], v, `${k} sem mudança`);
  assert.ok(f.direction!.createdAt instanceof Date && !Number.isNaN(f.direction!.createdAt.getTime()), "data legível pelo Prisma");
  const ch = await prisma.myChannel.findUniqueOrThrow({ where: { id: channel.id } });
  assert.equal(ch.defaultDirectionId, f.directionId, "vira o padrão do canal");

  const after = await prompts(idea.id, content);
  assert.deepEqual(after, before, "pedido idêntico antes e depois da migração");

  // Rodar de novo não duplica nada.
  for (const sql of dataStatements()) await prisma.$executeRawUnsafe(sql);
  assert.equal(await prisma.direction.count(), 1);

  // Depois da migração vale a direção: mexer nas caixas antigas do formato não muda o pedido; mexer na direção muda.
  await prisma.videoFormat.update({ where: { id: format.id }, data: { directionScene: "ANTIGO_NAO_VALE" } });
  assert.deepEqual(await prompts(idea.id, content), before);
  await prisma.direction.update({ where: { id: f.directionId! }, data: { directionScene: "CENA NOVA DA DIREÇÃO" } });
  const changed = await prompts(idea.id, content);
  assert.match(changed[0].user, /CENA NOVA DA DIREÇÃO/);
  assert.doesNotMatch(changed[0].user, /ANTIGO_NAO_VALE/);
});

test("direções: copiar, a partir de estudo, escolher no formato, padrão do canal em formato novo e não apagar em uso", async () => {
  const { prisma } = await import("../src/lib/db");
  const D = await import("../src/lib/directions");
  const base = await D.createDirection({ name: "Cinematográfica", mode: "manual", fields: { directionGeneral: "G", directionScene: "C", directionPhotography: "F", directionSound: "S" } });
  const copy = await D.createDirection({ name: "Cinematográfica 2", mode: "copia", fromId: base.id });
  assert.equal(copy.directionScene, "C");
  assert.equal(copy.copiedFromId, base.id);
  const fromStudy = await D.createDirection({ name: "Do estudo de X", mode: "estudo", study: "# Estudo\n1. Plano aberto antes da piada; câmera parada na reação." });
  assert.equal(fromStudy.origin, "estudo");
  assert.match(fromStudy.directionGeneral!, /Plano aberto/);
  await assert.rejects(D.createDirection({ name: " ", mode: "manual" }), /nome/);

  const niche = await prisma.niche.create({ data: { name: "Outro" } });
  const ch = await prisma.myChannel.create({ data: { name: "Canal 2", nicheId: niche.id } });
  await D.setChannelDefaultDirection(ch.id, base.id);
  assert.equal(await D.defaultDirectionId({ myChannelId: ch.id }), base.id);
  assert.equal(await D.defaultDirectionId({ nicheId: niche.id }), base.id);

  const { createManualFormat } = await import("../src/lib/own-create");
  const vf = await createManualFormat({ myChannelId: ch.id, name: "Autoral", length: "short", rules: "Gancho na ação. Estrutura: tenta, piora, resolve. Final em loop. 1 a 2 min." });
  assert.equal(vf.directionId, base.id, "formato novo já vem com a direção padrão do canal");
  await D.setFormatDirection(vf.id, copy.id);
  assert.equal((await prisma.videoFormat.findUniqueOrThrow({ where: { id: vf.id } })).directionId, copy.id);
  await assert.rejects(D.deleteDirection(copy.id), /Troque/);
  await D.deleteDirection(fromStudy.id);
  assert.equal(D.effectiveInstructions({ ...LEGACY, direction: null })!.directionScene, LEGACY.directionScene);
  await prisma.$disconnect();
  rmSync(DB, { force: true });
});
