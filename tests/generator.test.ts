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
    { item: "Gancho em até 3s", origem: "formato", ok: true, comentario: "" },
    { item: "Fecho com pergunta", origem: "regra geral", ok: true, comentario: "" },
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

test("gerador: formato obrigatório; receita + regra geral + perfil viram ideias e roteiro", async () => {
  const { prisma } = await import("../src/lib/db");
  const { estimateIdeas, generateIdeas, estimateScript, generateScript, profileGaps, loadContext, GeneratorError } = await G();

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
      visualStyle: "3D estilo filme infantil. Efeitos: chinelo voando, rebobinar 1s.",
      tone: "leve",
      durationSec: 35,
    },
  });
  assert.deepEqual(profileGaps(ch, 0), ["pelo menos 1 roteiro que você já publicou"]);

  // Dois formatos no nicho; o vídeo de referência fica no formato "Mito vs. verdade".
  const fMito = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Mito vs. verdade", description: "alguém afirma um mito e é desmentido" } });
  const fObra = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Construir resolvendo problemas" } });
  await prisma.myChannelScript.create({
    data: { myChannelId: ch.id, formatId: fMito.id, title: "Theo e o arco-íris", script: "THEO: Pai, o arco-íris tem fim!\nPAI: Na verdade ele é um círculo.", views: 12000 },
  });
  await prisma.myChannelScript.create({
    data: { myChannelId: ch.id, formatId: fObra.id, title: "O vulcão", script: "Você faz o óbvio.\nMas a espuma escorre pro tapete.\nChinelada.", views: 1000 },
  });

  const other = await prisma.channel.create({ data: { externalId: "UCnarr000000000000000001", title: "Canal Narrador" } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: other.id } });
  const ref = await prisma.video.create({
    data: { externalId: "dino0000001", channelId: other.id, title: "Mentiras sobre dinossauros", publishedAt: new Date(), isShort: true, viewCount: 2_000_000, durationSec: 40 },
  });
  await prisma.diagnosis.create({ data: { videoId: ref.id, markdown: "Narrador desmente 3 mitos de dinossauro. Gancho: 'Tudo o que te ensinaram está errado'." } });
  await prisma.transcript.create({
    data: { videoId: ref.id, language: "pt", source: "manual", text: "Tudo o que te ensinaram sobre o T-Rex está errado. Ele não rugia. Ele fazia hummm." },
  });
  await prisma.formatVideo.create({ data: { formatId: fMito.id, videoId: ref.id, nicheId: niche.id } });

  const { computePlaybookStats } = await import("../src/lib/playbook");
  const stats = {
    ...computePlaybookStats("short", []),
    durationSec: { value: 32, min: 30, max: 40, n: 2 },
    wordsPerSec: { value: 2.4, min: 2, max: 3, n: 2 },
    beatInterval: { value: 4, min: 3, max: 5, n: 2 },
    maxGap: { value: 9, min: 8, max: 10, n: 2 },
    speech: { sentence: { sentences: 3, wordsPerSentence: 4, shortPct: 30, longPct: 0 }, perVideo: [], shared: [] },
  };
  const recipe = await prisma.formatRecipe.create({
    data: {
      formatId: fMito.id,
      version: 1,
      model: "claude-opus-5-5",
      stats: JSON.stringify(stats),
      content: "{}",
      markdown: "# Receita do formato — Mito vs. verdade\n## Como abre\nMito dito com certeza nos 3s",
      voice: JSON.stringify([{ videoId: ref.id, title: "Mentiras sobre dinossauros", text: "Tudo o que te ensinaram sobre o T-Rex está errado." }]),
      videoIds: JSON.stringify([ref.id]),
    },
  });
  await prisma.formatRecipe.create({
    data: { formatId: fObra.id, version: 1, model: "x", stats: "{}", content: "{}", markdown: "# Receita do formato — Construir\nCada solução cria o próximo problema" },
  });
  const rule = await prisma.nicheRule.create({
    data: {
      nicheId: niche.id,
      version: 1,
      model: "x",
      recipeIds: "[]",
      formatNames: "[]",
      content: JSON.stringify({ resumo: "Comum aos dois.", comum: [{ tema: "fecho", regra: "Pergunta falada de duas opções", porque: "", emCadaFormato: [] }], especificos: [{ formato: "Construir", oQueEDele: ["narrador fala você"] }], conflitos: [], checklist: ["Fecho com pergunta de duas opções"] }),
    },
  });

  // Sem formato: erro claro.
  await assert.rejects(() => loadContext({ myChannelId: ch.id, formatId: null }), GeneratorError);

  // Contexto: perfil, roteiro aprovado DO FORMATO, receita só deste formato, regra geral (só o comum) e a referência do formato.
  const ctx = await loadContext({ myChannelId: ch.id, formatId: fMito.id, referenceId: ref.id });
  assert.equal(ctx.recipe?.id, recipe.id);
  assert.equal(ctx.rule?.id, rule.id);
  assert.equal(ctx.reference?.id, ref.id);
  assert.match(ctx.block, /Theo \(7 anos\)/);
  assert.match(ctx.block, /Theo e o arco-íris/);
  assert.doesNotMatch(ctx.block, /O vulcão/, "roteiro de outro formato não entra");
  assert.match(ctx.block, /Receita do formato — Mito vs\. verdade/);
  assert.doesNotMatch(ctx.block, /Cada solução cria o próximo problema/, "nunca duas receitas juntas");
  assert.match(ctx.block, /Pergunta falada de duas opções/);
  assert.doesNotMatch(ctx.block, /narrador fala você/, "o que é específico de outro formato não vira regra");
  assert.match(ctx.block, /AMOSTRAS DE VOZ/);
  assert.match(ctx.block, /Mentiras sobre dinossauros/);
  assert.doesNotMatch(ctx.block, /CARTILHA/);

  // A referência de outro formato é ignorada.
  const ctxObra = await loadContext({ myChannelId: ch.id, formatId: fObra.id, referenceId: ref.id });
  assert.equal(ctxObra.reference, null);
  assert.match(ctxObra.block, /O vulcão/);

  const est = await estimateIdeas({ myChannelId: ch.id, formatId: fMito.id, referenceId: ref.id, count: 2 });
  assert.ok(est.usd > 0 && est.usdMax > est.usd, "estimativa antes de chamar");
  assert.equal(bodies.length, 0, "estimar não chama a API");

  await prisma.myChannelVideo.create({
    data: { myChannelId: ch.id, externalId: "old00000001", title: "O T-Rex rugia mesmo? Mitos do T-Rex (animação 2D)", publishedAt: new Date("2024-01-01") },
  });
  const r = await generateIdeas({ myChannelId: ch.id, formatId: fMito.id, referenceId: ref.id, count: 2, ponto: "mitos de dinossauro" });
  assert.equal(r.ideas.length, 2);
  assert.equal(bodies.length, 1);
  const sys = bodies[0].system;
  assert.match(sys, /UM FORMATO SÓ/);
  assert.match(sys, /SOA FALADO, NÃO ESCRITO/);
  const user = bodies[0].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(user, /mitos de dinossauro/);
  assert.match(user, /Theo e o arco-íris \[roteiro cadastrado\]/, "temas já feitos entram para não repetir");
  assert.match(user, /Mitos do T-Rex \(animação 2D\) \[vídeo publicado\]/);

  const saved = await prisma.idea.findMany({ where: { myChannelId: ch.id }, orderBy: { createdAt: "asc" } });
  assert.equal(saved.length, 2);
  assert.equal(saved[0].status, "IDEA");
  assert.equal(saved[0].formatId, fMito.id);
  assert.equal(saved[0].recipeId, recipe.id);
  assert.equal(saved[0].ruleId, rule.id);
  assert.equal(saved[0].chosenTitle, "O T-Rex NÃO rugia?!");
  const d0 = JSON.parse(saved[0].ideaData!);
  assert.equal(d0.jaFeito[0]?.source, "vídeo publicado", "marca o tema já feito pelo canal");
  assert.deepEqual(JSON.parse(saved[0].referenceIds!), [ref.id]);
  assert.ok(Math.abs(saved[0].ideaCostUsd! * 2 - r.costUsd) < 1e-9, "custo dividido entre as ideias");

  // Devolução do Estúdio: vira aprendizado e entra no próximo pedido com peso maior.
  await prisma.channelLesson.create({ data: { myChannelId: ch.id, ideaId: saved[1].id, formatId: fMito.id, text: "Texto na tela em cima do rosto do pai" } });

  const sEst = await estimateScript(saved[0].id);
  assert.ok(sEst.usd > 0);
  const s = await generateScript(saved[0].id, { extra: "mais curto" });
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].system, /TAREFA: escrever o roteiro/);
  assert.match(bodies[1].system, /Nenhum texto em cima de rosto/);
  const sUser = bodies[1].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(sUser, /Premissa: Theo jura/);
  assert.match(sUser, /duração alvo ≈ 35s/, "duração do perfil vence a da receita");
  assert.match(sUser, /Pedido extra: mais curto/);
  assert.match(sUser, /DEVOLUÇÕES DO ESTÚDIO[\s\S]*Texto na tela em cima do rosto do pai/);

  assert.equal(s.idea.status, "SCRIPT");
  const md = s.idea.script!;
  assert.match(md.split("\n")[1], /^\*\*Formato:\*\* Mito vs\. verdade · receita v1 \(1 vídeo\) · rascunho · \*\*Nicho:\*\* 3D animado · Regra geral v1$/);
  assert.equal(md.split("\n")[2], "**Pendências:** 1 fato para conferir");
  assert.match(md, /\*\*Theo:\*\* Pai, o T-Rex rugia igual leão!/);
  assert.match(md, /- \[x\] Gancho em até 3s/);
  const data = JSON.parse(s.idea.scriptData!);
  assert.equal(data.metrics.scenes, 5);
  assert.equal(data.meta.formatName, "Mito vs. verdade");
  assert.ok(data.voice, "conferência da voz salva");

  const gens = await prisma.generation.findMany({ orderBy: { createdAt: "asc" } });
  assert.deepEqual(gens.map((g) => g.kind), ["ideas", "script"]);

  // Ideia antiga sem formato: o roteiro pede o formato antes.
  const old = await prisma.idea.create({ data: { myChannelId: ch.id, format: "short", theme: "antiga", titles: "[]" } });
  await assert.rejects(() => generateScript(old.id), /ainda não tem formato/);
});

test("já fez esse tema? tampa de caneta × vídeo antigo; uma palavra em comum não basta", async () => {
  const { findOwnRepeats } = await import("../src/lib/my-catalog");
  const items = [
    { title: "Por que a tampa da caneta BIC tem um furinho?", source: "vídeo publicado" as const },
    { title: "Como fazer um vulcão na escola em uma noite", source: "vídeo publicado" as const },
    { title: "Culpa de quem? Puxei um fiozinho", source: "vídeo publicado" as const },
  ];
  const m = findOwnRepeats("O furo da tampa da caneta: não é pela tinta!", items);
  assert.equal(m.length, 1);
  assert.match(m[0].title, /tampa da caneta/);
  assert.deepEqual(findOwnRepeats("Por que o céu é azul?", items), []);
  assert.deepEqual(findOwnRepeats("Vulcão de verdade", items), [], "só 'vulcão' em comum não é o mesmo tema");
});
