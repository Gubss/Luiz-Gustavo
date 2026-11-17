/**
 * v3: diagnóstico do canal (pedido com retenção, onde saem e engajamento), edição à mão (adendo A) e o pedido do
 * "formato a partir do diagnóstico". Sem IA: só monta os pedidos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const DB = `prisma/test-v3-diag-${process.pid}.db`;
process.env.DATABASE_URL = "file:./" + DB.replace("prisma/", "");
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
rmSync(DB, { force: true });
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "ignore", windowsHide: true });

const curve = (drop: number) =>
  JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ r: i / 20, watch: i < 10 ? 1 - i * 0.01 : 1 - i * 0.01 - drop, rel: 0.5 })));

const GENERATED = {
  resumo: "O canal segura bem quem passa dos 3 segundos.",
  ondeSaem: "A maior queda é na metade.",
  padroesQueFuncionam: [{ padrao: "Gancho com pergunta", evidencia: "Vídeo A, 2x o normal" }],
  padroesQueNaoFuncionam: [],
  cartilhaNoMeuCanal: [],
  temasQueFuncionaram: ["família"],
  licoesParaRoteiros: ["Abrir com a pergunta da criança."],
  proximosTestes: ["Testar final em loop."],
};

async function seed() {
  const { prisma } = await import("../src/lib/db");
  const c = await prisma.myChannel.create({ data: { name: "Por que é assim?", format: "short" } });
  await prisma.myVideo.create({
    data: { myChannelId: c.id, externalId: "a", url: "https://youtu.be/a", title: "Vídeo A", isShort: true, durationSec: 60, viewCount: 20000, likeCount: 900, commentCount: 40, avgViewPercent: 88, publishedAt: new Date("2026-11-01"), retention: curve(0.3) },
  });
  await prisma.myVideo.create({ data: { myChannelId: c.id, externalId: "b", url: "https://youtu.be/b", title: "Vídeo B", isShort: true, durationSec: 45, viewCount: 800, publishedAt: new Date("2026-11-05") } });
  return c;
}

test("diagnóstico: o pedido traz retenção 3s/25/50/75/fim, maior queda e engajamento por mil views", async () => {
  const c = await seed();
  const { channelReportPrompt } = await import("../src/lib/my-diagnosis");
  const p = await channelReportPrompt(c.id);
  assert.equal(p.videoCount, 2);
  const a = p.prompt.split("\n").find((l) => l.includes("Vídeo A"))!;
  assert.match(a, /retenção 3s \d+%, 25% \d+%, 50% \d+%, 75% \d+%, fim \d+%/);
  assert.match(a, /maior queda: \d+% → \d+% entre [\d,]+s e [\d,]+s/);
  assert.match(a, /engajamento: 45 curtidas e 2 comentários por mil views/);
  const b = p.prompt.split("\n").find((l) => l.includes("Vídeo B"))!;
  assert.doesNotMatch(b, /retenção|engajamento/, "sem números, nada inventado");
});

test("diagnóstico editado: vira versão nova no histórico, o original fica, e o gerador lê o texto do Gubs", async () => {
  const { prisma } = await import("../src/lib/db");
  const D = await import("../src/lib/my-diagnosis");
  const c = await prisma.myChannel.findFirstOrThrow();
  const base = await prisma.myChannelReport.create({
    data: { myChannelId: c.id, trigger: "manual", model: "claude-opus-5-5", inputs: "{}", content: JSON.stringify(GENERATED), markdown: D.channelReportMarkdown(GENERATED), videoCount: 2, costUsd: 0.12 },
  });
  const text = D.reportText(base);
  assert.match(text, /## Onde a audiência sai\nA maior queda é na metade\./);
  // Diagnóstico antigo (sem markdown e sem ondeSaem) também vira texto.
  const { ondeSaem: _skip, ...old } = GENERATED;
  void _skip;
  assert.doesNotMatch(D.reportText({ markdown: null, content: JSON.stringify(old) }), /Onde a audiência sai/);

  await assert.rejects(D.saveEditedReport(base.id, text), /Nada mudou/);
  const mine = text.replace("Abrir com a pergunta da criança.", "Abrir com a avó falando, nunca com pergunta.");
  const ed = await D.saveEditedReport(base.id, mine);
  assert.equal(ed.trigger, "editado");
  assert.equal(ed.costUsd, 0);
  assert.equal(JSON.parse(ed.inputs).editadoDe, base.id);
  const hist = await D.channelReports(c.id);
  assert.deepEqual(hist.map((r) => r.trigger), ["editado", "manual"]);
  const L = await D.learningsBlock(c.id);
  assert.match(L.block, /editado pelo Gubs/);
  assert.match(L.block, /Abrir com a avó falando, nunca com pergunta\./);
  assert.doesNotMatch(L.block, /Abrir com a pergunta da criança/);
});

test("formato a partir do diagnóstico: o pedido usa a versão salva (editada), com data; o rascunho vira regras", async () => {
  const { prisma } = await import("../src/lib/db");
  const { reportText } = await import("../src/lib/my-diagnosis");
  const F = await import("../src/lib/format-from-diagnosis");
  const ed = await prisma.myChannelReport.findFirstOrThrow({ where: { trigger: "editado" }, include: { myChannel: true } });
  const prompt = F.formatDraftPrompt({ channelName: ed.myChannel.name, reportDate: ed.createdAt, edited: true, diagnosis: reportText(ed), hint: "formato autoral", length: "short" });
  assert.ok(prompt.includes(`# DIAGNÓSTICO DO CANAL (${ed.createdAt.toISOString().slice(0, 10)}, editado pelo dono do canal)`));
  assert.ok(prompt.includes("Abrir com a avó falando, nunca com pergunta."));
  assert.match(prompt, /# ORIENTAÇÃO DO DONO DO CANAL \(manda\)\nformato autoral/);
  assert.match(prompt, /Tipo do formato: Short/);
  const rules = F.draftToRules({ nome: "Família (autoral)", gancho: "A avó fala.", estrutura: "Problema, tentativa, virada.", ritmo: "40-60 s.", final: "Loop.", quemFala: "Menino narra.", porQue: ["Vídeo A: 2x"] });
  assert.match(rules, /^Gancho: A avó fala\.\nEstrutura: .+\nRitmo: .+\nFinal: Loop\.\nQuem fala: .+\n\nPor quê \(do diagnóstico\):\n- Vídeo A: 2x$/);
  // Salvar guarda o reportId no formato.
  const niche = await prisma.niche.create({ data: { name: "Curiosidades" } });
  await prisma.myChannel.update({ where: { id: ed.myChannelId }, data: { nicheId: niche.id } });
  const { createManualFormat } = await import("../src/lib/own-create");
  const vf = await createManualFormat({ myChannelId: ed.myChannelId, name: "Família (autoral)", length: "short", rules, reportId: ed.id });
  assert.equal(vf.reportId, ed.id);
});

test.after(async () => {
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
  rmSync(DB, { force: true });
});
