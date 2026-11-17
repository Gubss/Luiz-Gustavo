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
let correctionReply: {falado:{personagem:string;fala:string}[];pendencias:string[]}|undefined;
const isScriptBody = (b: Body) => String(b.system).includes("TAREFA: escrever o roteiro");
/** Último pedido de roteiro (a leitura de espectador vem depois dele). */
const lastScript = () => bodies.filter(isScriptBody).at(-1)!;
const textOf = (b: Body) => b.messages[0].content.map((c) => c.text ?? "").join("");

/** Leitura de espectador simulada: 3 risadas com reação, nada a corrigir. */

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
  historinha: "Theo quer provar que o T-Rex rugia, e o pai estraga a imitação.",
  formatoCombina: { combina: true, motivo: "Mito e verdade cabe no tema.", sugestao: "" },
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
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const reply = body.system.includes("Corrija somente") ? correctionReply ?? (textOf(body).includes("Trecho selecionado: falas 1 a 2")?{falado:[{personagem:"Menino",fala:"Eu contei esse trecho de outro jeito."}],pendencias:[]}:{falado:[{personagem:"Theo",fala:"Pai, eu achei que ele rugia!"}],pendencias:[]}) : body.system.includes("Crítica solicitada") ? {observacoes:["Premissa preservada"],hipoteses:[],pendencias:[]} : isScriptBody(body) ? {titulo:SCRIPT.titulo,duracaoSeg:SCRIPT.duracaoSeg,falado:SCRIPT.cenas.filter(c=>c.fala).map(c=>({personagem:c.personagem,fala:c.fala})),pendencias:SCRIPT.conferirFatos,...(textOf(body).includes("# Estudo de direção")?{planoCenas:Array.from({length:5},(_,i)=>({falaInicial:i+1,falaFinal:i+1,tela:"Roda cai",plano:"close",camera:"Aproxima na roda",acao:"Roda cai",efeito:"Impacto",trilha:"entra",etiqueta:"RODA"}))}:{})} : {ideias:IDEAS.ideias.map(i=>({titulo:i.titulos[0].titulo,premissa:i.premissa,gancho:i.gancho,formato:i.formatoDeHistoria,interesse:i.porQueVaiFuncionar}))};
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
    data: { myChannelId: ch.id, formatId: fMito.id, integrity: "complete", title: "Theo e o arco-íris", script: "THEO: Pai, o arco-íris tem fim!\nPAI: Na verdade ele é um círculo.", views: 12000 },
  });
  await prisma.myChannelScript.create({
    data: { myChannelId: ch.id, formatId: fObra.id, integrity: "complete", title: "O vulcão", script: "Você faz o óbvio.\nMas a espuma escorre pro tapete.\nChinelada.", views: 1000 },
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
  assert.match(ctx.block, /1 exemplo, não é regra/);
  assert.doesNotMatch(ctx.block, /Cada solução cria o próximo problema/, "nunca duas receitas juntas");
  assert.doesNotMatch(ctx.block, /Pergunta falada de duas opções/);
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
  assert.match(sys, /formato escolhido/);
  assert.match(sys, /fala deve soar natural/);
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
  assert.equal(sEst.usd,sEst.script.usd);
  assert.equal(sEst.usdMax,sEst.script.usdMax);
  assert.equal(sEst.rewriteMaxUsd,0);
  const s=await generateScript(saved[0].id,{extra:"mais curto"});
  assert.equal(bodies.length,2,"somente ideias e roteiro");
  assert.match(bodies[1].system,/TAREFA: escrever o roteiro FALADO/);
  assert.doesNotMatch(bodies[1].system,/Pelo menos 3|A REGRA DE TODO ROTEIRO|sem conta, sem número/);
  assert.match(textOf(bodies[1]),/Premissa invariável: Theo/);
  assert.match(textOf(bodies[1]),/Duração estimada desejada: 35s/);
  assert.match(textOf(bodies[1]),/Texto na tela em cima do rosto do pai/);
  assert.equal(s.idea.status,"SCRIPT");
  assert.equal(s.version.number,1);
  assert.match(s.idea.script!,/Referência do canal/);
  assert.match(s.idea.script!,/Roteiro falado/);
  assert.match(s.idea.script!,/Som de boca fechada/);
  assert.doesNotMatch(s.idea.script!,/\[x\]|Pendências:\*\* nenhuma/);
  assert.deepEqual(JSON.parse(s.idea.scriptData!).checklist,[]);
  assert.equal(await prisma.scriptVersion.count({where:{ideaId:s.idea.id}}),1);
  assert.deepEqual((await prisma.generation.findMany({orderBy:{createdAt:"asc"}})).map(g=>g.kind),["ideas","script"]);

  // Estimativa pela média dos roteiros reais (a resposta cortada no limite não entra na média).
  await prisma.generation.create({
    data: { kind: "script", model: "claude-opus-5-5", input: "{}", output: JSON.stringify({ stop_reason: "max_tokens", text: "{" }), inputTokens: 20000, outputTokens: 32000, costUsd: 0.72 },
  });
  const sEst2 = await estimateScript(saved[0].id);
  assert.equal(sEst2.basedOn, 1);
  assert.equal(sEst2.outputTokens, 3000, "média dos roteiros que terminaram inteiros");

  const original=s.version.content;
  await generateScript(saved[0].id,{mode:"nova"});
  assert.equal(await prisma.scriptVersion.count({where:{ideaId:s.idea.id}}),2);
  assert.equal((await prisma.scriptVersion.findUniqueOrThrow({where:{id:s.version.id}})).content,original);
  await assert.rejects(()=>generateScript(saved[0].id,{mode:"corrigir",extra:"troca o fecho"}),/Selecione a fala/);

  const {correctScript,requestCritique}=await G();
  const before=await prisma.idea.findUniqueOrThrow({where:{id:s.idea.id}});
  const previous=JSON.parse(before.scriptData!);
  previous.cenas=[{inicio:0,fim:4,parte:"gancho",acao:"Direção legada preservada",falas:[1]}];
  await prisma.scriptVersion.update({where:{id:before.currentVersionId!},data:{content:JSON.stringify(previous)}});
  const corrected=await correctScript(s.idea.id,before.currentVersionId!,1,"Deixe essa fala mais natural","voz");
  const after=JSON.parse(corrected.content);
  assert.equal(after.falado[0].fala,"Pai, eu achei que ele rugia!");
  assert.deepEqual(after.falado.slice(1),previous.falado.slice(1));
  assert.equal(corrected.category,"voz");
  assert.deepEqual(after.cenas,previous.cenas,"correção de fala preserva direção existente");
  const countBefore=await prisma.scriptVersion.count({where:{ideaId:s.idea.id}});
  const critique=await requestCritique(s.idea.id,corrected.id);
  assert.equal(await prisma.scriptVersion.count({where:{ideaId:s.idea.id}}),countBefore);
  assert.equal((await prisma.generation.findUniqueOrThrow({where:{id:critique.generationId}})).scriptVersionId,corrected.id);
  assert.match(textOf(bodies.at(-1)!),/Premissa invariável/);
  await assert.rejects(()=>correctScript(s.idea.id,before.currentVersionId!,1,"stale","voz"),/mudou/);
  const {ideaExport}=await import("../src/lib/script-export");
  assert.match((await ideaExport(s.idea.id))!,/Crítica solicitada/);
  assert.equal(await ideaExport(s.idea.id),(await prisma.idea.findUniqueOrThrow({where:{id:s.idea.id}})).script);

  const ranged=await correctScript(s.idea.id,corrected.id,1,"Reorganize só as duas primeiras falas","história",2);
  const rangedData=JSON.parse(ranged.content);
  assert.deepEqual(rangedData.falado.slice(1),after.falado.slice(2),"fora do intervalo nada muda");
  assert.deepEqual(rangedData.cenas,after.cenas);
  assert.match(rangedData.pendencias.join(" "),/quantidade de falas/);
  await assert.rejects(()=>correctScript(s.idea.id,ranged.id,2,"inválido","voz",1),/intervalo/);
  // Mesmo uma seleção única pode inserir falas: retorno imperfeito e estruturado.
  let current=ranged;
  for(const replacement of [
   [{personagem:"Menino",fala:"Mas parece.\nKachau!"}],
   [{personagem:"Menino",fala:"**Menino:** Menino: Botei o pé.\nAvó: Taca-lhe pau!"}],
   [{personagem:"Menino",fala:"Botei o pé."},{personagem:"Avó",fala:"Taca-lhe pau!"}],
  ]) {
   const old=JSON.parse(current.content);
   correctionReply={falado:replacement,pendencias:[]};
   const next=await correctScript(s.idea.id,current.id,2,"Acrescente a fala pedida","voz");
   const result=JSON.parse(next.content);
   assert.deepEqual(result.falado.slice(0,1),old.falado.slice(0,1));
   assert.deepEqual(result.falado.slice(3),old.falado.slice(2));
   assert.equal(result.falado[1].personagem,"Menino");
   assert.equal(result.falado[2].personagem,replacement[0].fala.includes("Kachau")?"Menino":"Avó");
   assert.doesNotMatch(result.falado[1].fala,/Menino:/);
   assert.equal((await prisma.scriptVersion.findUniqueOrThrow({where:{id:current.id}})).content,current.content);
   assert.match(bodies.at(-1)!.system,/cada fala em um objeto separado/);
   current=next;
  }
  correctionReply=undefined;
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
  assert.doesNotMatch(textOf(lastScript()), /desmanchei quarenta anos de tricô/, "exemplo sem formato não entra");

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

test("sem ChannelFormat: limite de voz e narrador do perfil chegam ao prompt e à exportação",async()=>{
 const {prisma}=await import("../src/lib/db");
 const {loadContext,generateScript}=await G();
 const {ideaExport}=await import("../src/lib/script-export");
 const niche=await prisma.niche.create({data:{name:"Regressão voz do kit"}});
 const characters='Quem narra: depende do formato, e é um só por roteiro. No formato de desastre, o menino narra em primeira pessoa. No formato de construir, um narrador fala "você" e o menino não fala. Narrador e menino usam a mesma voz, então os dois nunca falam no mesmo roteiro. Mãe, avó e professora têm voz própria.';
 const channel=await prisma.myChannel.create({data:{name:"Por Que É Assim?",nicheId:niche.id,format:"short",characters,tone:"Nas histórias, narra em primeira pessoa. Leve e engraçado."}});
 for(const [name,expected,excluded] of [["Desastre em cadeia","o menino narra em primeira pessoa","No formato de construir"],["Construir resolvendo problemas",'um narrador fala "você" e o menino não fala',"No formato de desastre"],["Historinha com regra absurda","Nas histórias, narra em primeira pessoa","No formato de construir"]]){
  const format=await prisma.videoFormat.create({data:{nicheId:niche.id,name}});
  assert.equal(await prisma.channelFormat.count({where:{myChannelId:channel.id,formatId:format.id}}),0);
  const ctx=await loadContext({myChannelId:channel.id,formatId:format.id});
  assert.equal(ctx.channelHow,false);
  assert.ok(ctx.block.includes(expected));assert.ok(!ctx.block.includes(excluded));
  assert.match(ctx.block,/Narrador e menino usam a mesma voz, então os dois nunca falam no mesmo roteiro/);
  const idea=await prisma.idea.create({data:{myChannelId:channel.id,nicheId:niche.id,formatId:format.id,format:"short",theme:"Teste de narração",titles:"[]"}});
  await generateScript(idea.id,{noRecipeOk:true});
  assert.ok(textOf(lastScript()).includes(expected));
  const exported=(await ideaExport(idea.id))!;assert.ok(exported.includes(expected));assert.ok(!exported.includes(excluded));
  assert.match(exported,/Narrador e menino usam a mesma voz/);
  const legacy=await prisma.idea.create({data:{myChannelId:channel.id,nicheId:niche.id,formatId:format.id,format:"short",theme:"Legado",titles:"[]",script:"legado",scriptData:JSON.stringify(SCRIPT)}});
  const legacyExport=(await ideaExport(legacy.id))!;assert.ok(legacyExport.includes(expected));assert.ok(!legacyExport.includes(excluded));
  assert.match(legacyExport,/Narrador e menino usam a mesma voz/);
 }
});

test("estudo acrescenta plano por cena, preserva falas e referência do canal", async () => {
  const { prisma } = await import("../src/lib/db");
  const { generateScript, loadContext } = await G();
  const { ideaExport } = await import("../src/lib/script-export");
  const niche = await prisma.niche.create({ data: { name: "Direção" } });
  const channel = await prisma.myChannel.create({ data: { name: "Por Que É Assim?", nicheId: niche.id, tone: "leve", characters: "Theo e Pai" } });
  const format = await prisma.videoFormat.create({ data: { name: "DM teste", nicheId: niche.id } });
  const idea = await prisma.idea.create({ data: { myChannelId: channel.id, nicheId: niche.id, formatId: format.id, format: "short", theme: "Roda", titles: "[]" } });
  const before = await generateScript(idea.id, { noRecipeOk: true });
  const beforeExport = (await ideaExport(idea.id))!;
  assert.equal(before.data.planoCenas, undefined);
  assert.doesNotMatch(textOf(lastScript()), /# Estudo de direção/);
  await prisma.videoFormat.update({ where: { id: format.id }, data: { directionStudy: "1. Peça entra com física; câmera vai até ela." } });
  assert.match((await loadContext({ myChannelId: channel.id, formatId: format.id })).videoFormat.directionStudy!, /Peça entra/);
  const after = await generateScript(idea.id, { noRecipeOk: true });
  const afterExport = (await ideaExport(idea.id))!;
  assert.deepEqual(after.data.falado, before.data.falado);
  assert.equal(after.data.duracaoSeg, before.data.duracaoSeg);
  assert.equal(after.data.planoCenas?.length, 5);
  assert.equal(afterExport.split("# Referência do canal:")[1], beforeExport.split("# Referência do canal:")[1]);
  assert.match(afterExport, /Cena 1.*Tela:.*Câmera:.*Efeito:.*Etiqueta:/);
  assert.doesNotMatch(afterExport, /Direção de animação ainda não preparada/);
  assert.match(textOf(lastScript()), /# Estudo de direção/);
  assert.doesNotMatch(lastScript().system, /Não produza direção/);
});

 test("seção A substitui duração antiga no prompt sem mudar perfil", async()=>{
 const {prisma}=await import("../src/lib/db"); const {generateScript}=await G();
 const niche=await prisma.niche.create({data:{name:"PQEA duração"}});
 const channel=await prisma.myChannel.create({data:{name:"Por Que É Assim?",nicheId:niche.id,durationSec:120}});
 const format=await prisma.videoFormat.create({data:{name:"Telefone",nicheId:niche.id,directionStudy:"## A. História\n1. Gancho e loop. Até 90s.\n## B. Direção\n1. Plano por fala.\n## C. Canal\n- Família 3D."}});
 const idea=await prisma.idea.create({data:{myChannelId:channel.id,nicheId:niche.id,formatId:format.id,format:"short",theme:"Fio",titles:"[]"}});
 await generateScript(idea.id,{noRecipeOk:true});
 const prompt=textOf(lastScript()); assert.match(prompt,/Duração estimada desejada: 90s/); assert.doesNotMatch(prompt,/Duração (alvo|estimada desejada): 120s/); assert.match(prompt,/A seção A rege as FALAS/);
 assert.equal((await prisma.myChannel.findUniqueOrThrow({where:{id:channel.id}})).durationSec,120);
 });
