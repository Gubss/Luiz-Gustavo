/** v3: ideias em pares Título + Resumo (resumo longo) e abertura original da história (adendo B). Puro, sem IA. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IDEAS_MAX, ideasFromPairs, openingCheck, parseStory, storyBlock, storyOpening, withOriginalOpening } from "../src/lib/own-story";

const AVO = readFileSync("tests/fixtures/historia-01-avo.md", "utf8");
const GANCHO = "Minha vó sempre resolveu todos os meus problemas. Mas naquele domingo... aconteceu uma coisa que eu não sabia resolver.";

test("pares: título vira tema, resumo (vários parágrafos) vai literal como premissa; par vazio some", () => {
  const resumo =
    "A avó reclama do calor, e o menino decide construir um ar-condicionado improvisado.\n\n**O que entrega:** humor de invenção + apresentação do pai.\n**Cuidados:** não fazer o pai parecer um herói.";
  const xs = ideasFromPairs(["O Ar-Condicionado Caseiro — Estreia do pai", "", "Só título"], [resumo, "", ""]);
  assert.equal(xs.length, 2);
  assert.equal(xs[0].tema, "O Ar-Condicionado Caseiro — Estreia do pai");
  assert.equal(xs[0].premissa, resumo, "resumo longo, com parágrafos e negrito, literal");
  assert.deepEqual(xs[1], { tema: "Só título", premissa: "Só título" });
  const semTitulo = ideasFromPairs([""], ["Um resumo sem título que é bem comprido e passa de noventa caracteres para testar o corte do tema da ideia."]);
  assert.ok(semTitulo[0].tema.endsWith("…") && semTitulo[0].tema.length <= 90);
  assert.equal(ideasFromPairs(Array(40).fill("x y z"), []).length, IDEAS_MAX);
});

test("abertura: a da vó é o gancho do narrador; ligada, o pedido obriga a abrir com ela", () => {
  const off = parseStory(AVO, true);
  assert.deepEqual(storyOpening(off).map((l) => l.text), [GANCHO]);
  assert.doesNotMatch(storyBlock(off), /ABERTURA ORIGINAL/);
  const on = parseStory(AVO, true, true);
  assert.equal(on.manterAbertura, true);
  const block = storyBlock(on);
  assert.match(block, /# ABERTURA ORIGINAL/);
  assert.ok(block.includes(`“${GANCHO}”`));
});

test("abertura: confere sem IA e “usar a original” troca só o começo, sem repetir o gancho", () => {
  const s = parseStory(AVO, true);
  const gerado = [
    { personagem: "Menino", fala: "Vó? Cadê você?" },
    { personagem: "Menino (narração)", fala: GANCHO },
    { personagem: "Menino", fala: "É... algumas coisas nunca mudam." },
  ];
  const chk = openingCheck(s, gerado)!;
  assert.equal(chk.mantida, false);
  assert.equal(chk.sugerida[0].text, "Vó? Cadê você?");
  const { falado, countChanged } = withOriginalOpening(s, gerado);
  assert.deepEqual(falado.map((f) => f.fala), [GANCHO, "É... algumas coisas nunca mudam."]);
  assert.equal(falado[0].personagem, "Menino (narração)");
  assert.equal(countChanged, true);
  assert.equal(openingCheck(s, falado)!.mantida, true);
  assert.throws(() => withOriginalOpening({ falas: [] }, gerado), /abertura original/);
});
