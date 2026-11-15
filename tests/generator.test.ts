/**
 * Etapa 6 — gerador de temas, títulos e roteiros. Anthropic simulada (sem chave real, sem custo).
 * Usa o banco descartável prisma/test-generator.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { withSse } from "./anthropic-sse";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-generator.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-generator.db", "prisma/test-generator.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const G = () => import("../src/lib/generator");

type Body = { system: string; model?: string; messages: { content: { text?: string }[] }[] };
const bodies: Body[] = [];
const isScriptBody = (b: Body) => String(b.system).includes("TAREFA: escrever o roteiro");
const isCriticBody = (b: Body) => String(b.system).includes("espectador exigente");
/** Último pedido de roteiro (a leitura de espectador vem depois dele). */
const lastScript = () => bodies.filter(isScriptBody).at(-1)!;
const textOf = (b: Body) => b.messages[0].content.map((c) => c.text ?? "").join("");

/** Leitura de espectador simulada: 3 risadas com reação, nada a corrigir. */
const CRITIC_OK = {
  narrativa: [],
  risadas: [
    { cena: 1, esperado: "rugido de leão", aconteceu: "o pai diz que nem abria a boca", reacao: "Theo cai do sofá" },
    { cena: 3, esperado: "som assustador", aconteceu: "som de pombo", reacao: "Theo ri" },
    { cena: 4, esperado: "o T-Rex é feroz", aconteceu: "era um pombo", reacao: "o pai engasga" },
  ],
  passosSemMotivo: [],
  frasesAula: [],
  bordoes: [],
  fechoExplicaPiada: false,
  historinha: "Theo quer rugir igual T-Rex e descobre que o T-Rex arrulhava.",
  temaDeDesenho: false,
  contas: [],
  viradaPlantada: true,
  fechoCerto: true,
  veredito: "Assistiria até o fim.",
};
let criticReply: unknown = CRITIC_OK;

const IDEAS = {
  leitura: "Uso o gancho mito vs. verdade, dito pelo Theo e corrigido pelo pai.",
  ideias: [
    {
      tema: "Mitos do T-Rex",
      premissa: "Theo jura que o T-Rex rugia igual leão. O pai mostra que ele provavelmente fazia um som grave de boca fechada.",
      viabilidade: { situacao: "Theo imita o T-Rex", regra: "", motivacao: "Theo quer assustar o pai", conflito: "o pai sabe o som real", consequencias: ["o pai imita", "Theo ri"], virada: "o pombo da janela", sustenta: true, motivo: "cadeia inteira" },
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
      viabilidade: { situacao: "Theo imita o T-Rex", regra: "", motivacao: "Theo quer assustar o pai", conflito: "o pai sabe o som real", consequencias: ["o pai imita", "Theo ri"], virada: "o pombo da janela", sustenta: true, motivo: "cadeia inteira" },
      formatoDeHistoria: "Pergunta no jantar",
      gancho: "THEO: Os dinossauros morreram tudo num dia só!",
      ganchoPadrao: "Afirmação errada",
      titulos: [{ titulo: "Os dinossauros ainda estão vivos?", formula: "pergunta" }],
      adaptacao: { daCartilha: "Pergunta no título", doCanal: "Jantar da família" },
      porQueVaiFuncionar: "Pergunta no título.",
      risco: "",
    },
    {
      tema: "Ovo de dinossauro",
      premissa: "x",
      viabilidade: { situacao: "x", regra: "", motivacao: "x", conflito: "x", consequencias: [], virada: "x", sustenta: false, motivo: "só funciona no título" },
      formatoDeHistoria: "x",
      gancho: "x",
      ganchoPadrao: "x",
      titulos: [{ titulo: "x", formula: "x" }],
      adaptacao: { daCartilha: "x", doCanal: "x" },
      porQueVaiFuncionar: "x",
      risco: "",
    },
  ],
};

const SCRIPT = {
  historinha: "Theo quer provar que o T-Rex rugia, e o pai estraga a imitação.",
  formatoCombina: { combina: true, motivo: "Mito e verdade cabe no tema.", sugestao: "" },
  titulo: "O T-Rex NÃO rugia?!",
  titulosAlternativos: ["O som real do T-Rex"],
  duracaoSeg: 30,
  resumo: "Theo imita o rugido, o pai corrige.",
  espinha: ["Porque Theo jura que o T-Rex rugia → o pai corrige → então imita o som de pombo → Theo descobre que o T-Rex era um pombo"],
  regrasPlantadas: [{ oQue: "o som grave de boca fechada", ondeAparece: "fala 2", comoPaga: "vira a piada do pombo na fala 4" }],
  falado: [
    { personagem: "Theo", fala: "Pai, o T-Rex rugia igual leão!" },
    { personagem: "Pai", fala: "Na verdade, filho, ele provavelmente nem abria a boca." },
    { personagem: "Pai", fala: "Ele fazia um som grave, tipo um pombo gigante: hummm." },
    { personagem: "Theo", fala: "Então o T-Rex era um pombo?!" },
    { personagem: "Pai", fala: "Quer saber qual dinossauro era mais rápido?" },
  ],
  cenas: [
    { inicio: 0, fim: 3, parte: "gancho", falas: [1], acao: "Theo pula do sofá com um dinossauro de brinquedo", expressoes: "Theo confiante", direcao: "", textoNaTela: "MITO?", novidade: "afirmação errada" },
    { inicio: 3, fim: 8, parte: "virada", falas: [2], acao: "Pai baixa o jornal", expressoes: "", direcao: "", textoNaTela: "", novidade: "correção" },
    { inicio: 8, fim: 22, parte: "desenvolvimento", falas: [3], acao: "Pai imita, Theo ri", expressoes: "", direcao: "", textoNaTela: "hummm", novidade: "som de pombo" },
    { inicio: 22, fim: 27, parte: "clímax", falas: [4], acao: "Zoom no rosto do Theo", expressoes: "", direcao: "zoom", textoNaTela: "", novidade: "piada" },
    { inicio: 27, fim: 30, parte: "fecho", falas: [5], acao: "Pai sorri", expressoes: "", direcao: "", textoNaTela: "parte 2?", novidade: "gancho de continuação" },
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
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const reply = isCriticBody(body) ? (Array.isArray(criticReply) ? criticReply.shift() : criticReply) : isScriptBody(body) ? SCRIPT : IDEAS;
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(reply) }],
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
  assert.equal(r.ideas.length, 2, "a ideia que não sustenta a história fica de fora");
  assert.deepEqual(r.discarded, [{ tema: "Ovo de dinossauro", motivo: "só funciona no título" }]);
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
  assert.equal(sEst.basedOn, 0, "sem roteiro real ainda: usa a saída típica");
  assert.equal(sEst.outputTokens, 26000, "raciocínio adaptativo conta como saída");
  assert.ok(Math.abs(sEst.script.usdMax - (sEst.inputTokens * 4 + 32000 * 20) / 1e6) < 1e-9, "teto do roteiro = limite de 32 mil tokens");
  assert.ok(sEst.critic.usd > 0 && sEst.critic.usd < sEst.script.usd / 5, "leitura de espectador é barata");
  assert.ok(Math.abs(sEst.usd - (sEst.script.usd + sEst.critic.usd)) < 1e-9, "estimativa mostrada inclui a leitura");
  assert.ok(Math.abs(sEst.usdMax - (sEst.script.usdMax + sEst.critic.usdMax + sEst.rewriteMaxUsd)) < 1e-9, "teto inclui uma reescrita");
  assert.equal(sEst.noRecipe, false);
  const s = await generateScript(saved[0].id, { extra: "mais curto" });
  assert.equal(bodies.length, 3, "ideias, roteiro e leitura de espectador");
  assert.match(bodies[1].system, /TAREFA: escrever o roteiro/);
  assert.match(bodies[1].system, /CADA PASSO TEM MOTIVO E CONSEQUÊNCIA/);
  assert.match(bodies[1].system, /SEM AULA DISFARÇADA/);
  assert.match(bodies[1].system, /Pelo menos 3 viradas cômicas/);
  // Regra fixa do Gubs (15/11): vale com formato ou sem, no topo do pedido.
  assert.match(bodies[1].system, /A REGRA DE TODO ROTEIRO \(vale com formato ou sem[\s\S]*É UM DESENHO CONTANDO UMA HISTORINHA[\s\S]*sem conta, sem número exato[\s\S]*O título é a desculpa, não a aula/);
  assert.ok(bodies[1].system.indexOf("A REGRA DE TODO ROTEIRO") < bodies[1].system.indexOf("COMO SEGUIR O FORMATO"));
  assert.match(textOf(bodies[2]), /Formato: Mito vs\. verdade/);
  assert.match(String(bodies[2].system), /historinha em 1 frase[\s\S]*conta, medida ou número exato[\s\S]*virada final foi plantada/);
  assert.ok(isCriticBody(bodies[2]));
  assert.equal(bodies[2].model, "claude-sonnet-5-5", "leitura de espectador no modelo barato");
  assert.match(textOf(bodies[2]), /Fala 3 \(desenvolvimento\) — Pai: Ele fazia um som grave/);
  assert.doesNotMatch(textOf(bodies[2]), /Pai imita, Theo ri/, "leitura de olhos fechados: sem a animação");
  assert.match(String(bodies[2].system), /12\. /, "as 12 perguntas da revisão narrativa");
  assert.match(bodies[1].system, /CAMADA NARRATIVA COMUM/);
  assert.match(bodies[1].system, /desastre em cadeia/i);
  assert.match(bodies[1].system, /Nenhum texto em cima de rosto/);
  assert.equal((bodies[1] as unknown as { max_tokens: number }).max_tokens, 32000, "roteiro tem limite de 32 mil tokens");
  assert.equal((bodies[1] as unknown as { stream: boolean }).stream, true, "roteiro vem por streaming");
  const sUser = bodies[1].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(sUser, /Premissa: Theo jura/);
  assert.match(sUser, /duração alvo ≈ 35s/, "duração do perfil vence a da receita");
  assert.match(sUser, /Pedido extra: mais curto/);
  assert.match(sUser, /DEVOLUÇÕES DO ESTÚDIO[\s\S]*Texto na tela em cima do rosto do pai/);

  assert.equal(s.idea.status, "SCRIPT");
  const md = s.idea.script!;
  assert.match(md.split("\n")[1], /^\*\*Formato:\*\* Mito vs\. verdade · receita v1 \(1 vídeo\) · rascunho · \*\*Nicho:\*\* 3D animado · Regra geral v1$/);
  assert.equal(md.split("\n")[2], "**Pendências:** 1 fato para conferir");
  assert.match(md, /## Roteiro falado[^\n]*\n+\*\*Theo:\*\* Pai, o T-Rex rugia igual leão!\n+\*\*Pai:\*\* Na verdade/);
  const falado = md.split("## Animação e direção")[0];
  assert.doesNotMatch(falado, /Pai baixa o jornal/, "o roteiro falado não tem direção de cena");
  assert.match(md, /## Animação e direção[\s\S]*Pai baixa o jornal/, "o export leva a animação também");
  assert.match(md, /## Espinha da história/);
  assert.match(md, /- \[x\] Gancho em até 3s/);
  const data = JSON.parse(s.idea.scriptData!);
  assert.equal(data.metrics.scenes, 5);
  assert.equal(data.meta.formatName, "Mito vs. verdade");
  assert.ok(data.voice, "conferência da voz salva");
  assert.equal(data.review.laughs, 3);
  assert.equal(data.review.rewritten, false, "passou: não reescreve");
  assert.deepEqual(data.review.points, []);
  assert.ok(data.checklist.some((c: { origem: string; ok: boolean }) => c.origem === "lógica e graça" && c.ok), "caixas de lógica e graça marcadas pelo app");
  assert.match(md, /## Checklist de lógica e graça/);
  assert.match(md, /\*\*A historinha:\*\* Theo quer provar/);
  assert.doesNotMatch(md, /formato pode não combinar/);
  const genCost = (await prisma.generation.findMany()).filter((g) => g.kind !== "ideas").reduce((a, g) => a + (g.costUsd ?? 0), 0);
  assert.ok(Math.abs(s.idea.scriptCostUsd! - genCost) < 1e-9, "custo gravado inclui a leitura de espectador");

  const gens = await prisma.generation.findMany({ orderBy: { createdAt: "asc" } });
  assert.deepEqual(gens.map((g) => g.kind), ["ideas", "script", "script-critic"]);

  // Estimativa pela média dos roteiros reais (a resposta cortada no limite não entra na média).
  await prisma.generation.create({
    data: { kind: "script", model: "claude-opus-5-5", input: "{}", output: JSON.stringify({ stop_reason: "max_tokens", text: "{" }), inputTokens: 20000, outputTokens: 32000, costUsd: 0.72 },
  });
  const sEst2 = await estimateScript(saved[0].id);
  assert.equal(sEst2.basedOn, 1);
  assert.equal(sEst2.outputTokens, 3000, "média dos roteiros que terminaram inteiros");

  // Devolução "corrija só estes pontos": manda o roteiro anterior e a última devolução, pede para manter o resto.
  await prisma.idea.update({
    where: { id: saved[0].id },
    data: {
      status: "RETURNED",
      returnNotes:
        "Devolução de 13/11/2026:\nRefaça do zero, não reenvie o mesmo texto.\n\nDevolução de 14/11/2026:\nEstá quase pronto, corrija só estes pontos e mantenha o resto.\nO pai fala rápido demais na cena do pombo",
    },
  });
  const { revisionDefaults, latestReturn } = await G();
  const fresh = await prisma.idea.findUniqueOrThrow({ where: { id: saved[0].id } });
  assert.equal(revisionDefaults(fresh).defaultMode, "corrigir");
  assert.match(latestReturn(fresh.returnNotes)!, /^Devolução de 14\/11\/2026:\nEstá quase pronto/);
  const fixed = await generateScript(saved[0].id);
  assert.equal(fixed.mode, "corrigir");
  const fx = lastScript();
  assert.match(fx.system, /MODO CORRIGIR/);
  assert.match(fx.system, /Mantenha igual tudo o que não foi citado/);
  const fxUser = fx.messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(fxUser, /# ROTEIRO ANTERIOR[\s\S]*Pai, o T-Rex rugia igual leão!/);
  assert.match(fxUser, /# DEVOLUÇÃO DO ESTÚDIO PARA ESTE ROTEIRO[\s\S]*O pai fala rápido demais na cena do pombo/);
  assert.doesNotMatch(fxUser, /Refaça do zero/, "só a devolução mais recente");
  assert.doesNotMatch(fxUser, /"metrics"/, "o roteiro anterior vai sem as medidas");
  assert.equal(fixed.idea.status, "SCRIPT");
  assert.equal(JSON.parse(fixed.idea.scriptData!).mode, "corrigir");

  // Já reescrito (não está mais devolvido): o padrão volta a ser história nova; corrigir pede o que mudar.
  assert.equal(revisionDefaults(fixed.idea).defaultMode, "nova");
  await assert.rejects(() => generateScript(saved[0].id, { mode: "corrigir" }), /diga no pedido extra o que mudar/);
  const tweak = await generateScript(saved[0].id, { mode: "corrigir", extra: "troca o fecho" });
  assert.equal(tweak.mode, "corrigir");
  assert.doesNotMatch(textOf(lastScript()), /DEVOLUÇÃO DO ESTÚDIO PARA ESTE ROTEIRO/);

  // "História nova": sem roteiro anterior no pedido.
  const again = await generateScript(saved[0].id, { mode: "nova" });
  assert.equal(again.mode, "nova");
  assert.doesNotMatch(lastScript().system, /MODO CORRIGIR/);
  assert.doesNotMatch(textOf(lastScript()), /ROTEIRO ANTERIOR/);

  // Leitura de espectador reprova (1 risada, passo sem motivo): reescreve UMA vez só esses trechos, no modo corrigir.
  criticReply = [{ ...CRITIC_OK, risadas: CRITIC_OK.risadas.slice(0, 1), passosSemMotivo: [{ cena: 3, problema: "o pai imita sem ninguém pedir" }] }, CRITIC_OK];
  const n0 = bodies.length;
  const costBefore = (await prisma.idea.findUniqueOrThrow({ where: { id: saved[0].id } })).scriptCostUsd!;
  const redo = await generateScript(saved[0].id, { mode: "nova" });
  criticReply = CRITIC_OK;
  assert.equal(bodies.length - n0, 4, "roteiro, leitura, uma revisão da história e a leitura final");
  const fix = bodies[bodies.length - 2];
  assert.ok(isScriptBody(fix));
  assert.match(fix.system, /MODO REVISAR A HISTÓRIA/);
  const fixUser = textOf(fix);
  assert.match(fixUser, /# ROTEIRO QUE ACABOU DE SER ESCRITO[\s\S]*Pai, o T-Rex rugia igual leão!/);
  assert.match(fixUser, /CONFERÊNCIA DE LÓGICA E GRAÇA[\s\S]*Só 1 risada com reação da família[\s\S]*Fala 3: passo sem motivo/);
  assert.ok(isCriticBody(bodies[bodies.length - 1]), "lê de novo depois de revisar");
  assert.equal(redo.review.rewritten, true);
  assert.ok(redo.review.recheck, "leitura final salva");
  assert.deepEqual(redo.review.left, [], "a leitura final passou");
  const redoGens = await prisma.generation.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
  assert.deepEqual(redoGens.map((g) => g.kind).reverse(), ["script", "script-critic", "script-fix", "script-recheck"]);
  assert.ok(Math.abs(redo.idea.scriptCostUsd! - costBefore - redoGens.reduce((a, g) => a + (g.costUsd ?? 0), 0)) < 1e-9, "as quatro chamadas entram no custo");

  // A leitura falhou (resposta fora do formato): o roteiro é salvo assim mesmo, com o aviso.
  criticReply = { nada: true };
  const noCritic = await generateScript(saved[0].id, { mode: "nova" });
  criticReply = CRITIC_OK;
  assert.ok(noCritic.review.error, "falha da leitura fica registrada");
  assert.equal(noCritic.review.rewritten, false);

  // Formato sem receita: não escreve sem a confirmação.
  const fSem = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Sem receita ainda" } });
  const ideaSem = await prisma.idea.create({ data: { myChannelId: ch.id, nicheId: niche.id, formatId: fSem.id, format: "short", theme: "balões", titles: "[]" } });
  assert.equal((await estimateScript(ideaSem.id)).noRecipe, true);
  const nSem = bodies.length;
  await assert.rejects(() => generateScript(ideaSem.id), /ainda não tem receita/);
  assert.equal(bodies.length, nSem, "sem confirmação, nada é chamado");
  const okSem = await generateScript(ideaSem.id, { noRecipeOk: true });
  assert.equal(okSem.idea.status, "SCRIPT");

  // Exemplos aprovados colados no perfil: entram no pedido como ritmo e humor, com a ordem de não copiar.
  await prisma.myChannel.update({ where: { id: ch.id }, data: { examples: "# ROTEIRO APROVADO: O fiozinho da avó\nEu puxei um fiozinho e desmanchei quarenta anos de tricô." } });
  await generateScript(saved[0].id, { mode: "nova" });
  assert.match(textOf(lastScript()), /EXEMPLOS APROVADOS PELO DONO DO CANAL[\s\S]*NUNCA copie falas[\s\S]*desmanchei quarenta anos de tricô/);

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

test("segunda passada confere o checklist do Gubs inteiro (historinha, conta em tema de desenho, virada plantada, fecho)", async () => {
  const { reviewPoints } = await import("../src/lib/generator");
  const { checkScriptText } = await import("../src/lib/script-check");
  const code = checkScriptText([{ text: "O Thor sobe com o cacho." }]);
  const base = {
    narrativa: [] as { item: number; ok: boolean; problema: string }[],
    risadas: [1, 2, 3].map((cena) => ({ cena, esperado: "a", aconteceu: "b", reacao: "a avó grita" })),
    passosSemMotivo: [],
    frasesAula: [],
    bordoes: [],
    fechoExplicaPiada: false,
    historinha: "O menino decora a festa e o Thor quer os balões.",
    temaDeDesenho: true,
    contas: [],
    viradaPlantada: true,
    fechoCerto: true,
    veredito: "ok",
  };
  assert.deepEqual(reviewPoints(code, base).points, []);
  const bad = reviewPoints(code, { ...base, historinha: "", contas: [{ cena: 4, frase: "uns dez gramas" }], viradaPlantada: false, fechoCerto: false }).points;
  assert.equal(bad.length, 4);
  assert.match(bad.join("\n"), /historinha em 1 frase[\s\S]*Tema de desenho com conta[\s\S]*não foi plantada[\s\S]*duas opções/);
});

test("revisão narrativa: item reprovado vira ponto; virada não plantada não repete", async () => {
  const { reviewPoints } = await import("../src/lib/generator");
  const { checkScriptText } = await import("../src/lib/script-check");
  const code = checkScriptText([{ text: "O Thor sobe com o cacho." }]);
  const crit = {
    narrativa: [
      { item: 3, ok: false, problema: "Fala 4: a mãe ri do frango roubado" },
      { item: 10, ok: false, problema: "o vizinho aparece só no fim" },
    ],
    risadas: [1, 2, 3].map((cena) => ({ cena, esperado: "a", aconteceu: "b", reacao: "a avó grita" })),
    passosSemMotivo: [],
    frasesAula: [],
    bordoes: [],
    fechoExplicaPiada: false,
    historinha: "O Thor rouba o frango.",
    temaDeDesenho: true,
    contas: [],
    viradaPlantada: false,
    fechoCerto: true,
    veredito: "ok",
  };
  const pts = reviewPoints(code, crit, "fala").points;
  assert.equal(pts.filter((p) => /^Revisão narrativa/.test(p)).length, 2);
  assert.match(pts.join("\n"), /Revisão narrativa 3[\s\S]*a mãe ri do frango roubado/);
  assert.equal(pts.filter((p) => /não foi plantada/.test(p)).length, 0, "o item 10 já cobre a virada");
});

test("roteiro falado × animação: lê o novo e o antigo; fala solta entra numa cena", async () => {
  const { spokenLines, sceneLines, attachLines } = await import("../src/lib/script-lines");
  const antigo = { cenas: [{ inicio: 3, fim: 6, parte: "virada", personagem: "Pai", fala: "Não." }, { inicio: 0, fim: 3, parte: "gancho", personagem: "Theo", fala: "Rugia!" }] };
  assert.deepEqual(spokenLines(antigo).map((l) => `${l.who}: ${l.text}`), ["Theo: Rugia!", "Pai: Não."]);
  assert.deepEqual(sceneLines(antigo, antigo.cenas[0]), [{ n: null, who: "Pai", text: "Não." }]);
  const novo = attachLines({
    falado: [{ personagem: "A", fala: "um" }, { personagem: "B", fala: "dois" }, { personagem: "A", fala: "três" }],
    cenas: [
      { inicio: 0, fim: 3, parte: "gancho", falas: [1, 1, 9] },
      { inicio: 3, fim: 6, parte: "fecho", falas: [3] },
    ],
  });
  assert.deepEqual(novo.cenas.map((s) => s.falas), [[1, 2], [3]], "repetida e inexistente saem; a 2 vai para a cena da 1");
  assert.deepEqual(spokenLines(novo).map((l) => l.parte), ["gancho", "gancho", "fecho"]);
});
