/**
 * Roteiro próprio do Gubs: (a) história, (b) minhas ideias, (c) formato à mão.
 * Sem IA nenhuma: testa a leitura do .md, a montagem do prompt e as inserções no banco descartável prisma/test-own.db.
 * OWN_STORY_DUMP=<arquivo> grava o prompt montado em (a), como prova para quem revisa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-own.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-own.db", "prisma/test-own.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const S = () => import("../src/lib/own-story");
const G = () => import("../src/lib/generator");
const C = () => import("../src/lib/own-create");
const AVO = readFileSync("tests/fixtures/historia-01-avo.md", "utf8");
const BANCO = readFileSync("tests/fixtures/banco-de-ideias.md", "utf8");
const MARCADA = "Você ficou aqui comigo. Isso já é cuidar";

const fakeCtx = {
  block: "# MEU CANAL\nPor Que É Assim? — família 3D\nDuração alvo: 120s",
  channel: { durationSec: 120 },
  videoFormat: { id: "f", name: "Desmontando o Mundo", directionStudy: null, narrativeRules: null },
};
const ideaOf = (ideaData: object) => ({ theme: "O Dia em que a Vó Precisou de Mim", chosenTitle: "O Dia em que a Vó Precisou de Mim", ideaData: JSON.stringify(ideaData), status: "IDEA", scriptData: null, returnNotes: null });

test("parseStory lê o episódio da vó: título, Preservar, fala marcada e falas de referência", async () => {
  const { parseStory } = await S();
  const s = parseStory(AVO, true);
  assert.equal(s.title, "O Dia em que a Vó Precisou de Mim");
  assert.deepEqual(s.preservar.slice(0, 6), [
    "pote de sorvete com feijão",
    "sorvete escondido na panela de pressão",
    "pote de manteiga com rolamentos",
    "drift da avó",
    "cadeira vazia",
    "sopa confundida com açúcar",
  ]);
  assert.match(s.preservar[6], /Você ficou aqui comigo\. Isso já é cuidar/);
  assert.deepEqual(s.falasMarcadas, [MARCADA]);
  assert.ok(s.falas.length >= 30, `falas: ${s.falas.length}`);
  assert.deepEqual(s.falas[0], { who: "Menino (narração)", text: "Minha vó sempre resolveu todos os meus problemas. Mas naquele domingo... aconteceu uma coisa que eu não sabia resolver." });
  assert.ok(!s.falas.some((f) => /^(Tipo|Status|Proposta)$/.test(f.who)), "metadado não é fala");
  assert.ok(s.manterFalas);
});

test("(a) prompt do roteiro leva a história, o Preservar, a fala marcada, o modo e as regras gerais", async () => {
  const { parseStory, GENERAL_RULES, STORY_TASK } = await S();
  const { buildScriptRequest } = await G();
  const historia = parseStory(AVO, true);
  const req = buildScriptRequest(fakeCtx as never, ideaOf({ tema: historia.title, premissa: "p", historia }), historia.title, "", "nova");
  for (const p of historia.preservar) assert.ok(req.user.includes(`- ${p}`), `falta Preservar: ${p}`);
  assert.ok(req.user.includes(`- “${MARCADA}”`));
  assert.ok(req.user.includes("# HISTÓRIA DO GUBS"));
  assert.ok(req.user.includes("Thor, missão importante! Hoje a gente vai cuidar da vó!"), "história inteira no prompt");
  assert.match(req.user, /MODO MANTER AS FALAS/);
  for (const r of GENERAL_RULES) assert.ok(req.user.includes(`- ${r}`), `falta regra geral: ${r}`);
  assert.ok(req.system.includes(STORY_TASK));
  const rewrite = buildScriptRequest(fakeCtx as never, ideaOf({ tema: "t", premissa: "p", historia: parseStory(AVO, false) }), "t", "", "nova");
  assert.match(rewrite.user, /MODO PODE REESCREVER/);
  if (process.env.OWN_STORY_DUMP) writeFileSync(process.env.OWN_STORY_DUMP, `===== SYSTEM =====\n${req.system}\n\n===== USER =====\n${req.user}\n`);
});

test("(b) ideia do Gubs: premissa literal + regras gerais; ideia comum não muda", async () => {
  const { GENERAL_RULES, STORY_TASK } = await S();
  const { buildScriptRequest } = await G();
  const own = buildScriptRequest(fakeCtx as never, ideaOf({ tema: "Lua", premissa: "Por que a Lua me segue? O menino tenta despistá-la.", doGubs: true }), "Lua", "", "nova");
  assert.match(own.user, /Por que a Lua me segue\? O menino tenta despistá-la\./);
  assert.match(own.user, /# IDEIA DO GUBS/);
  for (const r of GENERAL_RULES) assert.ok(own.user.includes(r));
  assert.ok(!own.system.includes(STORY_TASK));
  const plain = buildScriptRequest(fakeCtx as never, ideaOf({ tema: "Lua", premissa: "Por que a Lua me segue?" }), "Lua", "", "nova");
  assert.doesNotMatch(plain.user, /IDEIA DO GUBS|HISTÓRIA DO GUBS|REGRAS GERAIS DO CANAL/);
  assert.ok(!plain.system.includes(STORY_TASK));
});

test("parseOwnIdeas: banco com seções vira 7 ideias; linhas soltas viram uma ideia cada", async () => {
  const { parseOwnIdeas } = await S();
  const bank = parseOwnIdeas(BANCO);
  assert.equal(bank.length, 7);
  assert.equal(bank[0].tema, "O Ar-Condicionado Caseiro — Estreia do pai");
  assert.match(bank[0].premissa, /UHUUU! PAPAI CHEGOU!/);
  assert.match(bank[0].premissa, /Cuidados:/);
  assert.equal(bank[6].tema, "Dois Gênios, Nenhuma Solução");
  assert.doesNotMatch(bank[6].premissa, /Quadros recorrentes|Princípios/);
  const lines = parseOwnIdeas("- Por que a Lua me segue?\n\n2. Dinheiro nasce em árvore?\nx\n" + "a".repeat(120));
  assert.deepEqual(lines.map((l) => l.tema.length <= 90), [true, true, true]);
  assert.equal(lines[0].premissa, "Por que a Lua me segue?");
  assert.equal(lines.length, 3);
});

test("compareStory confere sem IA as falas marcadas e quantas ficaram iguais", async () => {
  const { parseStory, compareStory } = await S();
  const s = parseStory(AVO, true);
  const ok = compareStory(s, [{ fala: "Vó? Cadê você?" }, { fala: "Ô, meu filho... você ficou aqui comigo. Isso já é cuidar." }]);
  assert.deepEqual(ok.marcadas, [{ fala: MARCADA, ok: true }]);
  assert.ok(ok.iguais >= 2 && ok.iguais < ok.total);
  const miss = compareStory(s, [{ fala: "Você cuidou de mim." }]);
  assert.equal(miss.marcadas[0].ok, false);
});

test("banco: história, ideias e formato à mão entram sem IA", async () => {
  const { prisma } = await import("../src/lib/db");
  const { createStoryIdea, createOwnIdeas, createManualFormat } = await C();
  const { scriptMissingRecipe } = await G();
  const niche = await prisma.niche.create({ data: { name: "PQEA" } });
  const channel = await prisma.myChannel.create({ data: { name: "Por Que É Assim?", nicheId: niche.id } });
  const vf = await prisma.videoFormat.create({ data: { name: "Desmontando o Mundo", nicheId: niche.id } });

  const story = await createStoryIdea({ myChannelId: channel.id, formatId: vf.id, markdown: AVO, manterFalas: false });
  assert.equal(story.chosenTitle, "O Dia em que a Vó Precisou de Mim");
  assert.equal(story.ideaCostUsd, 0);
  const data = JSON.parse(story.ideaData!);
  assert.equal(data.historia.manterFalas, false);
  assert.match(data.premissa, /tenta cuidar dela/);
  assert.equal(await scriptMissingRecipe(story.id), false, "história não pede receita");
  await assert.rejects(createStoryIdea({ myChannelId: channel.id, formatId: vf.id, markdown: "curto", manterFalas: true }), /história inteira/);

  const ideas = await createOwnIdeas({ myChannelId: channel.id, formatId: vf.id, text: BANCO });
  assert.equal(ideas.length, 7);
  assert.ok(ideas.every((i) => JSON.parse(i.ideaData!).doGubs === true && i.ideaCostUsd === 0));

  const other = await prisma.niche.create({ data: { name: "Outro" } });
  const alien = await prisma.videoFormat.create({ data: { name: "X", nicheId: other.id } });
  await assert.rejects(createOwnIdeas({ myChannelId: channel.id, formatId: alien.id, text: "uma ideia" }), /outro nicho/);

  const rules = "Gancho: abre no meio da confusão.\nEstrutura: tenta, piora, a família reage.\nDuração: 1 a 3 min.";
  const manual = await createManualFormat({ myChannelId: channel.id, name: "Família (autoral)", length: "short", rules, example: "Menino: Vó?" });
  assert.equal(manual.narrativeRules, rules);
  assert.equal(manual.description, "Gancho: abre no meio da confusão.");
  assert.equal(await prisma.myChannelScript.count({ where: { formatId: manual.id } }), 1);
  await assert.rejects(createManualFormat({ myChannelId: channel.id, name: "Y", length: "short", rules: "curto" }), /3 a 6 linhas/);
  await prisma.$disconnect();
});
