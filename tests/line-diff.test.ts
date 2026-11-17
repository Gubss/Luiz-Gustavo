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
  assert.deepEqual(diffCounts(rows), { igual: 2, alterada: 1, nova: 1, saiu: 1 });
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

test("storyLines sem falas marcadas usa os parágrafos do texto", () => {
  assert.deepEqual(storyLines({ falas: [], text: "# Título\n\nPrimeira linha.\n> Segunda linha." }).map((l) => l.text), ["Título", "Primeira linha.", "Segunda linha."]);
});
