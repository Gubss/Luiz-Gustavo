/** Comparação história × roteiro linha a linha (v3). Puro, sem banco e sem IA. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffCounts, diffLines, lineSimilarity, storyLines } from "../src/lib/line-diff";
import { parseStory } from "../src/lib/own-story";

test("semelhança: igual ignora pontuação, maiúscula e acento; frase diferente fica baixa", () => {
  assert.equal(lineSimilarity("Vó, cadê o sorvete?", "vo cade o sorvete"), 1);
  assert.ok(lineSimilarity("O pote de sorvete tem feijão", "O pote de sorvete tinha feijão dentro") > 0.45);
  assert.ok(lineSimilarity("O pote de sorvete tem feijão", "A cadeira ficou vazia") < 0.2);
});

test("diff: igual, alterada (com a original), nova e saiu, na ordem do roteiro", () => {
  const orig = [
    { who: "Menino", text: "Vó, cadê o sorvete?" },
    { who: "Avó", text: "Tá na panela de pressão, meu filho." },
    { who: "Menino", text: "Isso não faz sentido nenhum." },
    { who: "Avó", text: "Faz sim, você vai ver." },
  ];
  const gen = [
    { who: "Menino", text: "Por que toda vó esconde sorvete?" },
    { who: "Menino", text: "Vó, cadê o sorvete?" },
    { who: "Avó", text: "Tá na panela de pressão, meu querido." },
    { who: "Avó", text: "Faz sim, você vai ver." },
  ];
  const rows = diffLines(orig, gen);
  assert.deepEqual(rows.map((r) => r.kind), ["nova", "igual", "alterada", "saiu", "igual"]);
  assert.equal(rows[2].original, "Tá na panela de pressão, meu filho.");
  assert.equal(rows[3].text, "Isso não faz sentido nenhum.");
  assert.deepEqual(diffCounts(rows), { igual: 2, alterada: 1, nova: 1, saiu: 1, movida: 0 });
  // Toda linha do roteiro aparece uma vez, na ordem; toda linha do original aparece uma vez (igual, alterada ou saiu).
  assert.deepEqual(rows.filter((r) => r.kind !== "saiu").map((r) => r.text), gen.map((g) => g.text));
  assert.equal(rows.filter((r) => r.kind !== "nova").length, orig.length);
});

test("diff: sem roteiro tudo saiu; sem história tudo é novo", () => {
  assert.deepEqual(diffLines([{ text: "a b c" }], []).map((r) => r.kind), ["saiu"]);
  assert.deepEqual(diffLines([], [{ text: "x" }, { text: "y" }]).map((r) => r.kind), ["nova", "nova"]);
});

test("história da vó contra ela mesma reordenada: as falas casam e só a trocada vira saiu+nova", () => {
  const story = parseStory(readFileSync("tests/fixtures/historia-01-avo.md", "utf8"), true);
  const lines = storyLines(story);
  assert.ok(lines.length >= 5, "lê as falas do .md");
  const gen = lines.map((l) => ({ ...l }));
  gen[1] = { who: "Narrador", text: "Uma frase inteiramente diferente que não existia na história." };
  const rows = diffLines(lines, gen);
  const c = diffCounts(rows);
  assert.equal(c.nova, 1);
  assert.equal(c.saiu, 1);
  assert.equal(c.igual, lines.length - 1);
});

test("igual só quando o texto é o mesmo: uma palavra a menos numa fala longa já é alterada", () => {
  const o = "Minha vó sempre sabia o que fazer quando alguma coisa dava errado. Só que dessa vez... eu não sabia como ajudar.";
  const rows = diffLines([{ text: o }], [{ text: "Minha vó sempre sabia o que fazer quando alguma coisa dava errado. Só que dessa vez, eu não sabia como." }]);
  assert.deepEqual(rows.map((r) => r.kind), ["alterada"]);
  assert.deepEqual(diffLines([{ text: "Vó, cadê você?" }], [{ text: "vo cade voce" }]).map((r) => r.kind), ["igual"]);
});

test("linha movida: igual em outra posição é verde com 'mudou de lugar', nunca saiu + nova", () => {
  const orig = [
    { who: "Menino (narração)", text: "Minha vó sempre resolveu todos os meus problemas. Mas naquele domingo... aconteceu uma coisa que eu não sabia resolver." },
    { who: "Menino", text: "Vó? Cadê você?" },
    { who: "Menino", text: "É... algumas coisas nunca mudam." },
    { who: "Avó", text: "Tô sim, meu filho. Hoje eu só tô meio dodói." },
  ];
  // Igual ao print 03b: a pergunta subiu para a abertura e a narração desceu.
  const gen = [orig[1], orig[0], orig[2], orig[3]];
  const rows = diffLines(orig, gen);
  assert.deepEqual(rows.map((r) => r.kind), ["igual", "igual", "igual", "igual"]);
  assert.equal(rows.filter((r) => r.moved).length, 1, "só uma das duas trocadas precisa ser marcada");
  const moved = rows.find((r) => r.moved)!;
  assert.ok(moved.originalIndex === 0 || moved.originalIndex === 1);
  assert.deepEqual(diffCounts(rows), { igual: 4, alterada: 0, nova: 0, saiu: 0, movida: 1 });
});

test("linha movida e parecida: amarelo com 'mudou de lugar' e a original; o que sobra vira saiu/nova", () => {
  const orig = [
    { who: "Avó", text: "Ah, meu filho... até vó precisa descansar de vez em quando." },
    { who: "Menino", text: "Já sei! Hoje eu vou fazer o almoço!" },
    { who: "Menino", text: "Thor, missão importante! Hoje a gente vai cuidar da vó!" },
    { who: "Avó", text: "Uma fala que o roteiro cortou de vez." },
  ];
  const gen = [
    { who: "Menino", text: "Thor, missão importante! Hoje a gente vai cuidar da vovó!" }, // parecida, veio do fim
    { who: "Avó", text: "Ah, meu filho... até vó precisa descansar de vez em quando." },
    { who: "Menino", text: "Já sei! Hoje eu vou fazer o almoço!" },
    { who: "Narrador", text: "Uma frase que não existia na história." },
  ];
  const rows = diffLines(orig, gen);
  const kinds = rows.map((r) => r.kind + (r.moved ? "+movida" : ""));
  assert.deepEqual(kinds, ["alterada+movida", "igual", "igual", "nova", "saiu"]);
  assert.equal(rows[0].original, orig[2].text);
  assert.equal(rows[0].originalIndex, 2);
  // Nenhuma fala presente nos dois lados aparece como saiu ou nova.
  for (const r of rows.filter((x) => x.kind === "saiu" || x.kind === "nova")) assert.ok(r.text.startsWith("Uma f"), r.text);
});

test("história da vó com a abertura trocada de lugar: nada vira saiu+nova", () => {
  const story = parseStory(readFileSync("tests/fixtures/historia-01-avo.md", "utf8"), true);
  const lines = storyLines(story);
  const gen = [lines[1], lines[0], ...lines.slice(2)];
  const c = diffCounts(diffLines(lines, gen));
  assert.equal(c.saiu, 0);
  assert.equal(c.nova, 0);
  assert.equal(c.igual, lines.length);
  assert.equal(c.movida, 1);
});

test("storyLines sem falas marcadas usa os parágrafos do texto", () => {
  assert.deepEqual(storyLines({ falas: [], text: "# Título\n\nPrimeira linha.\n> Segunda linha." }).map((l) => l.text), ["Título", "Primeira linha.", "Segunda linha."]);
});
