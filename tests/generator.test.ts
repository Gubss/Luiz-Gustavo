/**
 * Etapa 6 — gerador de temas, títulos e roteiros. Anthropic simulada (sem chave real, sem custo).
 * Usa o banco descartável prisma/test-generator.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-generator.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-generator.db", "prisma/test-generator.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const G = () => import("../src/lib/generator");

const bodies: { system: string; messages: { content: { text?: string }[] }[] }[] = [];

const IDEAS = {
  leitura: "Uso o gancho mito vs. verdade, dito pelo Theo e corrigido pelo pai.",
  ideias: [
    {
      tema: "Mitos do T-Rex",
      premissa: "Theo jura que o T-Rex rugia igual leão. O pai mostra que ele provavelmente fazia um som grave de boca fechada.",
      formatoDeHistoria: "Theo afirma algo errado e o pai corrige",
      gancho: "THEO: Pai, o T-Rex rugia igual leão, né?",
      ganchoPadrao: "Mito vs. verdade",
      titulos: [
        { titulo: "O T-Rex NÃO rugia?!", formula: "[mito] NÃO [verdade]?!" },
        { titulo: "Meu pai destruiu o que eu sabia do T-Rex", formula: "própria" },
      ],
      adaptacao: { daCartilha: "Gancho de mito nos 3s, revelação no meio, pergunta no fim", doCanal: "Theo e o pai na sala, tom engraçado" },
      porQueVaiFuncionar: "Mitos com virada funcionaram em 2 estudos.",
      risco: "Fato científico: conferir a fonte.",
    },
    {
      tema: "Meteoro",
      premissa: "Theo acha que todos os dinossauros morreram no mesmo dia. A mãe conta das aves.",
      formatoDeHistoria: "Pergunta no jantar",
      gancho: "THEO: Os dinossauros morreram tudo num dia só!",
      ganchoPadrao: "Afirmação errada",
      titulos: [{ titulo: "Os dinossauros ainda estão vivos?", formula: "pergunta" }],
      adaptacao: { daCartilha: "Pergunta no título", doCanal: "Jantar da família" },
      porQueVaiFuncionar: "Pergunta no título.",
      risco: "",
    },
  ],
};

const SCRIPT = {
  titulo: "O T-Rex NÃO rugia?!",
  titulosAlternativos: ["O som real do T-Rex"],
  duracaoSeg: 30,
  resumo: "Theo imita o rugido, o pai corrige.",
  cenas: [
    { inicio: 0, fim: 3, parte: "gancho", personagem: "Theo", fala: "Pai, o T-Rex rugia igual leão!", acao: "Theo pula do sofá com um dinossauro de brinquedo", textoNaTela: "MITO?", novidade: "afirmação errada" },
    { inicio: 3, fim: 8, parte: "virada", personagem: "Pai", fala: "Na verdade, filho, ele provavelmente nem abria a boca.", acao: "Pai baixa o jornal", textoNaTela: "", novidade: "correção" },
    { inicio: 8, fim: 22, parte: "desenvolvimento", personagem: "Pai", fala: "Ele fazia um som grave, tipo um pombo gigante: hummm.", acao: "Pai imita, Theo ri", textoNaTela: "hummm", novidade: "som de pombo" },
    { inicio: 22, fim: 27, parte: "clímax", personagem: "Theo", fala: "Então o T-Rex era um pombo?!", acao: "Zoom no rosto do Theo", textoNaTela: "", novidade: "piada" },
    { inicio: 27, fim: 30, parte: "fecho", personagem: "Pai", fala: "Quer saber qual dinossauro era mais rápido?", acao: "Pai sorri", textoNaTela: "parte 2?", novidade: "gancho de continuação" },
  ],
  capa: "Theo assustado com um T-Rex de boca fechada",
  descricao: "O T-Rex rugia mesmo?",
  hashtags: ["dinossauros", "#shorts"],
  checklist: [
    { item: "Gancho em até 3s", ok: true, comentario: "" },
    { item: "Fecho com pergunta", ok: true, comentario: "" },
  ],
  adaptacao: "O mito vs. verdade virou a briga do Theo com o pai.",
  conferirFatos: ["Som de boca fechada é hipótese de pesquisa (2016)"],
  dicasDeProducao: ["Pausa antes do 'na verdade'"],
};

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const isScript = String(body.system).includes("TAREFA: escrever o roteiro");
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(isScript ? SCRIPT : IDEAS) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 12_000, output_tokens: 3_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

test("medidas do roteiro em código", async () => {
  const { computeScriptMetrics } = await G();
  const m = computeScriptMetrics(SCRIPT as never);
  assert.equal(m.durationSec, 30);
  assert.equal(m.scenes, 5);
  assert.equal(m.hookEndsAt, 3);
  assert.equal(m.hookWords, 6);
  assert.equal(m.maxSceneSec, 14);
  assert.equal(m.avgSceneSec, 6);
  assert.equal(m.speakers[0].name, "Pai");
  assert.ok(m.wordsPerSec! > 1 && m.wordsPerSec! < 2);
});

test("gerador: perfil + cartilha viram ideias e roteiro no formato do canal", async () => {
  const { prisma } = await import("../src/lib/db");
  const { estimateIdeas, generateIdeas, estimateScript, generateScript, profileGaps, loadContext } = await G();

  const niche = await prisma.niche.create({ data: { name: "3D animado" } });
  const ch = await prisma.myChannel.create({
    data: {
      nicheId: niche.id,
      name: "Família do Theo",
      format: "short",
      platforms: "YouTube, TikTok",
      concept: "Família 3D; o Theo (7) é curioso.",
      characters: "Theo (7 anos): tem certeza de tudo\nPai: calmo e engraçado",
      storyFormats: "Theo afirma algo errado e o pai corrige",
      tone: "leve",
      durationSec: 35,
    },
  });
  assert.deepEqual(profileGaps(ch, 0), ["pelo menos 1 roteiro que você já publicou"]);
  await prisma.myChannelScript.create({
    data: { myChannelId: ch.id, title: "Theo e o arco-íris", script: "THEO: Pai, o arco-íris tem fim!\nPAI: Na verdade ele é um círculo.", views: 12000 },
  });

  // Uma cartilha pronta (etapa 5) e um estudo de referência de OUTRO formato (narrador).
  const other = await prisma.channel.create({ data: { externalId: "UCnarr000000000000000001", title: "Canal Narrador" } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: other.id } });
  const ref = await prisma.video.create({
    data: { externalId: "dino0000001", channelId: other.id, title: "Mentiras sobre dinossauros", publishedAt: new Date(), isShort: true, viewCount: 2_000_000, durationSec: 40 },
  });
  await prisma.diagnosis.create({
    data: {
      videoId: ref.id,
      markdown: "Narrador desmente 3 mitos de dinossauro. Gancho: 'Tudo o que te ensinaram está errado'.",
    },
  });
  const { computePlaybookStats } = await import("../src/lib/playbook");
  const stats = {
    ...computePlaybookStats("short", []),
    durationSec: { value: 32, min: 30, max: 40, n: 2 },
    wordsPerSec: { value: 2.4, min: 2, max: 3, n: 2 },
    beatInterval: { value: 4, min: 3, max: 5, n: 2 },
    maxGap: { value: 9, min: 8, max: 10, n: 2 },
  };
  const pb = await prisma.nichePlaybook.create({
    data: {
      nicheId: niche.id,
      format: "short",
      model: "claude-opus-5-5",
      stats: JSON.stringify(stats),
      content: "{}",
      markdown: "# Cartilha — 3D animado (Shorts)\n## Ganchos\n- **Mito vs. verdade**",
      diagnosisCount: 2,
    },
  });

  // Contexto: entra perfil, roteiro publicado, cartilha e a referência.
  const ctx = await loadContext({ myChannelId: ch.id, referenceId: ref.id });
  assert.equal(ctx.playbook?.id, pb.id);
  assert.equal(ctx.reference?.id, ref.id);
  assert.match(ctx.block, /Theo \(7 anos\)/);
  assert.match(ctx.block, /Theo e o arco-íris/);
  assert.match(ctx.block, /Mito vs\. verdade/);
  assert.match(ctx.block, /Mentiras sobre dinossauros/);

  const est = await estimateIdeas({ myChannelId: ch.id, referenceId: ref.id, count: 2 });
  assert.ok(est.usd > 0 && est.usdMax > est.usd, "estimativa antes de chamar");
  assert.equal(bodies.length, 0, "estimar não chama a API");

  const r = await generateIdeas({ myChannelId: ch.id, referenceId: ref.id, count: 2, ponto: "mitos de dinossauro" });
  assert.equal(r.ideas.length, 2);
  assert.equal(bodies.length, 1);
  const sys = bodies[0].system;
  assert.match(sys, /separar o COMO do O QUÊ/);
  const user = bodies[0].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(user, /mitos de dinossauro/);
  assert.match(user, /Theo e o arco-íris/, "temas já feitos entram para não repetir");

  const saved = await prisma.idea.findMany({ where: { myChannelId: ch.id }, orderBy: { createdAt: "asc" } });
  assert.equal(saved.length, 2);
  assert.equal(saved[0].status, "IDEA");
  assert.equal(saved[0].playbookId, pb.id);
  assert.equal(saved[0].chosenTitle, "O T-Rex NÃO rugia?!");
  assert.deepEqual(JSON.parse(saved[0].referenceIds!), [ref.id]);
  assert.ok(Math.abs(saved[0].ideaCostUsd! * 2 - r.costUsd) < 1e-9, "custo dividido entre as ideias");

  const sEst = await estimateScript(saved[0].id);
  assert.ok(sEst.usd > 0);
  const s = await generateScript(saved[0].id, { extra: "mais curto" });
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].system, /TAREFA: escrever o roteiro/);
  const sUser = bodies[1].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(sUser, /Premissa: Theo jura/);
  assert.match(sUser, /duração alvo ≈ 35s/, "duração do perfil vence a da cartilha");
  assert.match(sUser, /Pedido extra: mais curto/);

  assert.equal(s.idea.status, "SCRIPT");
  assert.match(s.idea.script!, /\*\*Theo:\*\* Pai, o T-Rex rugia igual leão!/);
  assert.match(s.idea.script!, /- \[x\] Gancho em até 3s/);
  const data = JSON.parse(s.idea.scriptData!);
  assert.equal(data.metrics.scenes, 5);
  assert.equal(data.playbookId, pb.id);

  const gens = await prisma.generation.findMany({ orderBy: { createdAt: "asc" } });
  assert.deepEqual(gens.map((g) => g.kind), ["ideas", "script"]);

  // Sem nicho nem cartilha: ainda funciona, só com o perfil.
  const solo = await loadContext({ myChannelId: ch.id, nicheId: null });
  assert.equal(solo.playbook, null);
  assert.doesNotMatch(solo.block, /CARTILHA/);
});
