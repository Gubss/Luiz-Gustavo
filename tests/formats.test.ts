/**
 * Formatos dentro do nicho: medidas de fala, receita do formato (camada 1) e regra geral do nicho (camada 2).
 * Anthropic simulada (sem chave real, sem custo). Usa o banco descartável prisma/test-formats.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-formats.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-formats.db", "prisma/test-formats.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const S = () => import("../src/lib/speech");
const F = () => import("../src/lib/formats");

// Trechos dos roteiros aprovados do canal (texto falado no vídeo final).
const VULCAO = `Cadê o trabalho da escola?
…que trabalho?
É um vulcão.
É pra amanhã.
Você faz o óbvio: um monte de massinha, vinagre e bicarbonato por cima.
A espuma escorre pro tapete.
Chinelada.
Então você faz a mistura dentro de um pote, no meio da montanha.
Essa é a câmara.
Mas montanha de massinha leva três dias pra secar.
Então você faz ela de jornal e cola.
Esse é o cone.
Mas na primeira erupção o jornal molha, amolece e a montanha deita.
Chinelada.
Então você pinta tudo com tinta acrílica.
Mas a espuma sobe, dá uma babada e para.
Então você troca o pote por uma garrafa.
Essa é a chaminé.
Mas jorra branca.
Então você pinga corante vermelho.
Essa é a lava.
Chinelada.
Comenta aí: tirei dez ou tomei chinelada?
E se inscreve.`;

const FIOZINHO = `Eu puxei um fiozinho da blusa da minha avó e desmanchei quarenta anos de tricô.
Minha avó nunca corta a linha.
Nunca.
Aí o Thor mordeu a ponta.
E saiu correndo.
Aí eu tive a melhor ideia da minha vida: enrolar tudo de volta antes dela acordar.
A bola ficou do tamanho de um carro.
E do meu lado… tem um fiozinho solto.`;

const POTE = `Abri o pote de sorvete.
Feijão.
Na casa da minha avó, nada é o que tá escrito.
Abri o primeiro.
Feijão.
O segundo.
Feijão!
E na sua casa, o que tem no pote de sorvete?
Comenta aí.
E se inscreve.
Senão é feijão.`;

const RECIPE = {
  resumo: "Construir resolvendo problemas: cada solução cria o próximo problema.",
  abertura: { comoAbre: "Pergunta em 2ª pessoa", primeiroQuadro: "A obra pela metade", exemplos: ["Se você…"], estudos: [1, 2] },
  narrador: { quem: "Narrador de fora", pessoa: "2ª pessoa (você)", comoFala: "Frases curtas", exemplos: ["Então você…"] },
  motor: [{ passo: "Problema", oQueAcontece: "Algo dá errado", quando: "a cada ~12s" }],
  repeticoes: [{ oQue: "Mas…", aCadaSegundos: 12, exemplos: ["Mas jorra branca."], estudos: [1, 2] }],
  tensao: { comoCresce: "A bagunça cresce", regras: ["Cada erro é visto"] },
  fecho: { comoFecha: "Pedido de comentário com duas opções", exemplos: ["Comenta aí"], regras: [] },
  porQueViralizou: [{ hipotese: "Curiosidade de ver o próximo erro", evidencia: "12 problemas em 2min", estudos: [1, 2] }],
  regras: ["Pode ensinar, não pode dar aula"],
  evitar: [],
  checklist: ["Problema novo a cada ~12s"],
  lacunas: [],
};
const RULE = {
  resumo: "Comum: gancho rápido e fecho com pergunta de duas opções.",
  comum: [{ tema: "fecho", regra: "Pergunta falada de duas opções", porque: "Nos dois formatos", emCadaFormato: [{ formato: "A", como: "x" }, { formato: "B", como: "y" }] }],
  especificos: [{ formato: "B", oQueEDele: ["narrador fala você"] }],
  conflitos: ["Um ensina, o outro nunca ensina"],
  checklist: ["Fecho com pergunta de duas opções"],
};

const bodies: { system: string; messages: { content: { text?: string }[] }[] }[] = [];

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const isRule = String(body.system).includes("REGRA GERAL DO NICHO");
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(isRule ? RULE : RECIPE) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

test("medidas de fala: frases curtas e o que se repete no vulcão", async () => {
  const { sentenceStats, repeatsInVideo, longSentences } = await S();
  const st = sentenceStats([VULCAO]);
  assert.ok(st.wordsPerSentence! <= 6, "o vulcão tem frases curtas");
  assert.equal(st.longPct, 0);
  const reps = repeatsInVideo(null, VULCAO).map((r) => `${r.phrase}×${r.count}`);
  assert.ok(reps.includes("então você…×5"), reps.join(", "));
  assert.ok(reps.includes("mas…×4"), reps.join(", "));
  assert.ok(reps.includes("chinelada…×3"), reps.join(", "));
  // Com tempos: segundos de cada vez e intervalo médio
  const segs = [
    { start: 10, text: "Mas a espuma sobe." },
    { start: 22, text: "Mas jorra branca." },
    { start: 34, text: "Mas acabou o vinagre." },
  ];
  const mas = repeatsInVideo(segs, "").find((r) => r.phrase === "mas…")!;
  assert.deepEqual(mas.times, [10, 22, 34]);
  const { avgGap } = await S();
  assert.equal(avgGap(mas.times), 12);
  assert.equal(longSentences([{ text: "Tudo que ela já fez na vida, pra família e pra rua inteira, é um fio só e mais um monte de coisa." }]).length, 1);
  assert.equal(longSentences([{ text: "Nunca. Chinelada." }]).length, 0);
});

test("frase repetida: bordão de roteiro publicado é avisado; fala fixa curta do canal não", async () => {
  const { findOverlaps } = await S();
  const sources = [
    { label: "O fiozinho da avó", text: FIOZINHO },
    { label: "O pote de sorvete", text: POTE },
    { label: "O vulcão", text: VULCAO },
  ];
  const out = findOverlaps(
    ["Aí eu tive a melhor ideia da minha vida: esconder tudo.", "Senão é feijão.", "E se inscreve.", "A bola ficou do tamanho de um carro.", "Abri a geladeira."],
    sources,
  );
  const said = out.map((o) => `${o.sentence} | ${o.source} | ${o.kind}`);
  assert.ok(said.includes("Aí eu tive a melhor ideia da minha vida: esconder tudo. | O fiozinho da avó | trecho igual"), said.join("\n"));
  assert.ok(said.includes("Senão é feijão. | O pote de sorvete | frase igual"));
  assert.ok(said.includes("A bola ficou do tamanho de um carro. | O fiozinho da avó | frase igual"));
  assert.ok(!said.some((x) => x.startsWith("E se inscreve.")), "fala fixa curta em 2+ roteiros fica de fora");
  assert.ok(!said.some((x) => x.startsWith("Abri a geladeira.")));
});

test("devolução: uma linha vira um ponto, sem marcadores", async () => {
  const { returnPoints } = await S();
  assert.deepEqual(returnPoints("## Filtro de amarração\n- O fim usa o carro do pai, que não apareceu antes\n2) Texto em cima do rosto\n\n[ ] ok\n* Frase longa no gancho"), [
    "O fim usa o carro do pai, que não apareceu antes",
    "Texto em cima do rosto",
    "Frase longa no gancho",
  ]);
});

async function seed() {
  const { prisma } = await import("../src/lib/db");
  const niche = await prisma.niche.create({ data: { name: "Animação 3D" } });
  const ch = await prisma.channel.create({ data: { externalId: "UCdesmontando0000000001", title: "Desmontando o Mundo" } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: ch.id } });
  const mk = async (n: number, isShort = true) => {
    const v = await prisma.video.create({
      data: { externalId: `vid0000000${n}`, channelId: ch.id, title: `Construir ${n}`, publishedAt: new Date(), isShort, viewCount: 1_000_000 * n, durationSec: 140 },
    });
    await prisma.diagnosis.create({ data: { videoId: v.id, markdown: `Estudo ${n}: cada solução cria o próximo problema.` } });
    await prisma.transcript.create({
      data: {
        videoId: v.id,
        language: "pt",
        source: "manual",
        text: VULCAO,
        segments: JSON.stringify(VULCAO.split("\n").map((t, i) => ({ start: i * 4, dur: 4, text: t }))),
      },
    });
    return v;
  };
  return { prisma, niche, videos: [await mk(1), await mk(2), await mk(3), await mk(4), await mk(5), await mk(6)], longVideo: await mk(7, false) };
}

test("formato: um vídeo por nicho, rascunho com menos de 3, receita versionada; regra geral só com 2 formatos prontos", async () => {
  const { prisma, niche, videos, longVideo } = await seed();
  const f = await F();
  const a = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Construir resolvendo problemas" } });
  const b = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Desastre em cadeia" } });

  // Um vídeo fica em um formato só por nicho: pôr em B tira de A.
  await f.setVideoFormat(videos[0].id, niche.id, a.id);
  await f.setVideoFormat(videos[0].id, niche.id, b.id);
  assert.deepEqual(await f.formatVideoIds(a.id), []);
  assert.deepEqual(await f.formatVideoIds(b.id), [videos[0].id]);
  await f.setVideoFormat(videos[0].id, niche.id, a.id);
  await assert.rejects(() => f.setVideoFormat(longVideo.id, niche.id, a.id), /Shorts/);

  // A com 2 vídeos: rascunho; a receita avisa o Claude.
  await f.setVideoFormat(videos[1].id, niche.id, a.id);
  assert.equal(f.isDraft((await f.formatVideoIds(a.id)).length), true);
  const est = await f.estimateRecipe(a.id);
  assert.equal(est.studies, 2);
  assert.equal(bodies.length, 0, "estimar não chama a API");
  const r1 = await f.generateRecipe(a.id);
  assert.equal(r1.recipe.version, 1);
  assert.match(bodies[0].system, /RASCUNHO/);
  const prompt = bodies[0].messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(prompt, /# Formato: Construir resolvendo problemas/);
  assert.match(prompt, /Medidas de fala/);
  assert.match(prompt, /"então você…" ×5 \(em /, "repetições com os segundos");
  assert.match(prompt, /Transcrição:\nCadê o trabalho da escola\?/);
  const stats = JSON.parse(r1.recipe.stats);
  assert.ok(stats.speech.perVideo.length === 2);
  assert.ok(stats.speech.shared.some((x: { phrase: string }) => x.phrase === "mas…"));
  assert.equal(JSON.parse(r1.recipe.voice).length, 2, "amostras de voz guardadas");
  assert.match(r1.recipe.markdown!, /# Receita do formato — Construir resolvendo problemas/);
  assert.match(r1.recipe.markdown!, /RASCUNHO/);
  assert.match(r1.recipe.markdown!, /2ª pessoa \(você\)/);

  // Regra geral precisa de 2 formatos prontos (rascunho não conta).
  await assert.rejects(() => f.generateRule(niche.id, "short"), /2 ou mais formatos prontos/);

  // A ganha o 3º vídeo (sai do rascunho), B ganha 3; as duas receitas são geradas.
  await f.setVideoFormat(videos[2].id, niche.id, a.id);
  for (const v of [videos[3], videos[4], videos[5]]) await f.setVideoFormat(v.id, niche.id, b.id);
  const r2 = await f.generateRecipe(a.id);
  assert.equal(r2.recipe.version, 2);
  assert.doesNotMatch(bodies.at(-1)!.system, /RASCUNHO/);
  await f.generateRecipe(b.id);
  const ready = await f.readyFormats(niche.id, "short");
  assert.deepEqual(ready.map((x) => x.format.name).sort(), ["Construir resolvendo problemas", "Desastre em cadeia"]);

  const rule = await f.generateRule(niche.id, "short");
  assert.equal(rule.rule.version, 1);
  const rp = bodies.at(-1)!.messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(rp, /# FORMATO: Construir resolvendo problemas \(receita v2, 3 vídeos\)/);
  assert.match(rp, /# FORMATO: Desastre em cadeia \(receita v1, 3 vídeos\)/);
  assert.match(bodies.at(-1)!.system, /Só o que funciona em TODOS|só o que funciona em TODOS/i);
  const common = f.ruleCommonMarkdown(JSON.parse(rule.rule.content));
  assert.match(common, /Pergunta falada de duas opções/);
  assert.doesNotMatch(common, /narrador fala você/, "o específico não vai para o gerador");
  assert.match(rule.rule.markdown!, /É de cada formato \(não vira regra\)/);
});
