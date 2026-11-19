/**
 * Lições do canal (Gubs, 19/11): ponto "canal todo" vira ChannelLesson e vale em todos os formatos;
 * "só este roteiro" fica só em returnNotes. Banco descartável com as migrations reais.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "radar-lessons-"));
process.env.DATABASE_URL = "file:" + join(temp, "test.db").replaceAll("\\", "/");
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe", windowsHide: true });

test("devolução: 'canal todo' grava a lição, 'só este roteiro' não, e a lição vale em outro formato", async () => {
  const { prisma } = await import("../src/lib/db");
  const { recordReturn, recordCorrectionLesson, returnPointsFromForm, returnMessage } = await import("../src/lib/lessons");
  const { lessonsBlock } = await import("../src/lib/generator");
  try {
    const niche = await prisma.niche.create({ data: { name: "Família 3D" } });
    const ch = await prisma.myChannel.create({ data: { nicheId: niche.id, name: "Por Que É Assim?", format: "short" } });
    const fA = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Pergunta do menino" } });
    const fB = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Mito vs. verdade" } });
    const idea = await prisma.idea.create({ data: { myChannelId: ch.id, nicheId: niche.id, format: "short", formatId: fA.id, theme: "Por que o céu é azul", titles: "[]", script: "x" } });

    // Formulário como a tela envia: `ponto` em ordem + `escopo-<i>`; o 3º ponto sem marcação fica "roteiro".
    const fd = new FormData();
    fd.set("returnNotes", "- A avó nunca explica a ciência\n- Corte a piada do minuto 1\n- Troque o fim");
    for (const p of ["A avó nunca explica a ciência", "Corte a piada do minuto 1", "Troque o fim"]) fd.append("ponto", p);
    fd.set("escopo-0", "canal");
    fd.set("escopo-1", "roteiro");
    const { raw, points } = returnPointsFromForm(fd);
    assert.deepEqual(points.map((p) => p.scope), ["canal", "roteiro", "roteiro"], "padrão é só este roteiro");

    const r = await recordReturn(idea.id, raw, points);
    assert.equal(r.channel, 1);
    assert.equal(r.script, 2);
    assert.equal(returnMessage(r.channel, r.script), "Devolução registrada: 1 ponto virou regra do canal e 2 ficaram só neste roteiro.");

    const lessons = await prisma.channelLesson.findMany({ where: { myChannelId: ch.id } });
    assert.equal(lessons.length, 1, "só o ponto 'canal todo' vira lição");
    assert.equal(lessons[0].text, "A avó nunca explica a ciência", "guarda a frase como ele escreveu");
    assert.equal(lessons[0].scope, "canal");
    assert.equal(lessons[0].formatId, fA.id, "formato de origem");
    assert.equal(lessons[0].ideaId, idea.id, "ideia de origem");
    assert.equal(await prisma.channelLesson.count({ where: { text: { contains: "piada" } } }), 0, "'só este roteiro' não grava lição");

    const saved = await prisma.idea.findUniqueOrThrow({ where: { id: idea.id } });
    assert.equal(saved.status, "RETURNED");
    assert.match(saved.returnNotes ?? "", /Corte a piada do minuto 1/, "ponto do roteiro fica em returnNotes");

    // Lição antiga, só do formato A: não vaza para o formato B.
    await prisma.channelLesson.create({ data: { myChannelId: ch.id, formatId: fA.id, text: "Preferência antiga do formato A" } });

    const inB = await lessonsBlock(ch.id, fB.id);
    assert.match(inB.block, /A avó nunca explica a ciência/, "lição do canal entra num formato diferente");
    assert.match(inB.block, /vale para o canal todo/);
    assert.match(inB.block, /pelo princípio/);
    assert.doesNotMatch(inB.block, /Preferência antiga do formato A/);
    assert.equal(inB.count, 1);
    const inA = await lessonsBlock(ch.id, fA.id);
    assert.equal(inA.count, 2, "no formato de origem entram as duas");

    // Correção de fala marcada "canal todo" também vira lição.
    const c = await recordCorrectionLesson(idea.id, "Fala do pai sempre curta, no máximo uma frase");
    assert.equal(c?.source, "correcao");
    assert.equal(c?.scope, "canal");
    assert.match((await lessonsBlock(ch.id, fB.id)).block, /Fala do pai sempre curta/);
  } finally {
    await prisma.$disconnect();
  }
});
