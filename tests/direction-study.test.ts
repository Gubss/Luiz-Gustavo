import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractDmStudy, normalizeStudy, directionPrompt, writeStudyRequest, validateScenePlan, sceneLine } from "../src/lib/direction-study";

test("import literal das 14 regras e seção do canal, sem material extra", () => {
  const source = "# Fonte\n" + Array.from({ length: 14 }, (_, i) => `${i+1}. **Regra ${i+1}**: conteúdo. 4 de 4.`).join("\n") + "\n## O que varia\nNão importar\n## Para o Por Que É Assim? (proposta)\n- Família falando.\n## Próximo passo\nNão importar";
  const imported = extractDmStudy(source);
  assert.equal(imported.split("\n").filter(line => /^\d+\./.test(line)).length, 14);
  assert.match(imported, /Família falando/);
  assert.doesNotMatch(imported, /Não importar|4 de 4/);
  assert.throws(() => extractDmStudy("incompleto"));
  assert.equal(normalizeStudy("\uFEFF regra\r\n\r\n"), "regra");
  assert.throws(() => normalizeStudy(" "));
  assert.throws(() => normalizeStudy("x".repeat(12001)));
});

test("com estudo exige direção, sem estudo mantém pedido original", () => {
  assert.equal(directionPrompt(null), "");
  assert.equal(directionPrompt("  "), "");
  assert.match(directionPrompt("regra visual"), /regra visual/);
  assert.match(directionPrompt("regra visual"), /preserve tom, tamanho e falas/);
  const scene = { falaInicial: 1, falaFinal: 1, plano: "close", acao: "cai", trilha: "entra", tela: "Peça cai", camera: "Aproxima na roda", efeito: "Impacto", etiqueta: "Roda" };
  validateScenePlan([scene], 1);
  assert.throws(() => validateScenePlan([scene], 3));
  assert.throws(() => validateScenePlan([scene, scene], 2));
  assert.match(sceneLine(scene, 0), /Tela:.*Câmera:.*Efeito:.*Etiqueta:/);
});

test("pedido grava Markdown único com nome, data e até cinco links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-direction-"));
  try {
    const format = { id: "format-1", name: "Desmontando / o Mundo" };
    const links = Array.from({ length: 5 }, (_, i) => `https://www.youtube.com/watch?v=video${i}`).join("\n");
    const file = await writeStudyRequest(format, links, directory);
    const content = await readFile(join(directory, file), "utf8");
    assert.match(file, /^\d{4}-\d{2}-\d{2}-Desmontando/);
    assert.match(content, /Formato: Desmontando \/ o Mundo/);
    assert.equal(content.split("\n").filter(line => line.startsWith("- https")).length, 5);
    assert.notEqual(file, await writeStudyRequest(format, links, directory));
    for (const invalid of ["", links + "\nhttps://youtu.be/six", "file:///secret", "não é link", "https://user:password@example.com/video"]) {
      await assert.rejects(() => writeStudyRequest(format, invalid, directory));
    }
    assert.equal((await readdir(directory)).length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
