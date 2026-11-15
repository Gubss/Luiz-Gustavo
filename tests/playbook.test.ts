/**
 * Etapa 5 — cartilha do nicho. Anthropic simulada (sem chave real, sem custo).
 * Usa o banco descartável prisma/test-playbook.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { withSse } from "./anthropic-sse";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-playbook.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-playbook.db", "prisma/test-playbook.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const P = () => import("../src/lib/playbook");

const anthropicBodies: { model: string; system: string; messages: { content: { text?: string }[] }[] }[] = [];

const PLAYBOOK = {
  resumo: "Nos estudos até agora, perguntas em 2ª pessoa abrem os Shorts.",
  ganchos: [{ padrao: "Pergunta hipotética", comoFazer: "Abra com 'E se você…'", exemplos: ["E se você acordasse num bunker"], estudos: [1, 2] }],
  formulasDeTitulo: [{ formula: "E se você [situação extrema]?", exemplos: ["E se você acordasse num bunker?"], porqueFunciona: "Põe o espectador na cena.", estudos: [1, 2] }],
  thumbnail: [{ padrao: "Objeto único com luz vermelha", estudos: [1] }],
  estrutura: { resumo: "Pergunta, virada, história, revelação, chamada.", partes: [{ parte: "gancho", quando: "até 3s", oQueFazer: "pergunta" }] },
  ritmo: { resumo: "Cerca de 2 palavras/s.", regras: ["Algo novo a cada ~5s"] },
  fecho: { resumo: "Chama para a parte 2.", regras: ["Termine em pergunta"] },
  temasQueFuncionam: [{ tema: "Lugares fechados", estudos: [1, 2] }],
  publicoPede: ["submarinos"],
  evitar: [{ erro: "Explicação longa no meio", estudos: [1] }],
  checklist: ["Título em 2ª pessoa"],
  lacunas: ["Estudar 3+ Shorts de outros canais"],
};

before(() => {
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      anthropicBodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(PLAYBOOK) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 20_000, output_tokens: 6_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

test("mediana e nível de confiança", async () => {
  const { med, dataLevel } = await P();
  assert.deepEqual(med([3, 1, 2]), { value: 2, min: 1, max: 3, n: 3 });
  assert.deepEqual(med([1, 2, null, undefined]), { value: 1.5, min: 1, max: 2, n: 2 });
  assert.equal(med([]).value, null);
  assert.equal(dataLevel(0).key, "none");
  assert.equal(dataLevel(2).key, "preliminary");
  assert.equal(dataLevel(4).key, "initial");
  assert.equal(dataLevel(12).key, "solid");
});

const diag = (title: string, gatilhos: string[], beatsGap: number) => ({
  content: JSON.stringify({
    resumo: `Estudo de ${title}`,
    porqueFuncionou: [{ hipotese: "Pergunta", evidencia: "título", confianca: "alta" }],
    titulo: { formula: "E se você [x]?", gatilhos, comentario: "" },
    thumbnail: { descricao: "porta", elementos: ["porta"], relacaoComTitulo: "" },
    gancho: { texto: "E se você acordasse", tecnica: "pergunta hipotética", comentario: "" },
    estrutura: {
      gancho: { inicio: 0, fim: 3, resumo: "a" },
      virada: { inicio: 3, fim: 6, resumo: "b" },
      desenvolvimento: { inicio: 6, fim: 20, resumo: "c" },
      climax: { inicio: 20, fim: 27, resumo: "d" },
      fecho: { inicio: 27, fim: 30, resumo: "e" },
    },
    beats: [{ t: 0, tipo: "gancho", texto: "" }],
    pontosDeRisco: [],
    comoReplicar: ["abrir com pergunta"],
    temasDerivados: [],
  }),
  metrics: JSON.stringify({
    durationSec: 30,
    wordCount: 60,
    wordsPerSec: 2,
    timed: true,
    firstWordAt: 0.2,
    opening: { seconds: 3, text: "E se você", words: 6 },
    closing: { seconds: 5, text: "parte 2?", hasCta: true, endsWithQuestion: true },
    paceThirds: [2.2, 2, 1.8],
    questions: 2,
    title: { chars: 30, words: 6, hasNumber: false, hasQuestion: true, hasExclamation: false, capsWords: [], hasBrackets: false, hasColonOrDash: false, firstPerson: false, secondPerson: true, startsWithWhatIf: true, emoji: false, pattern: title },
    beats: { count: 5, avgInterval: beatsGap, maxGap: beatsGap * 2, maxGapAt: 0, perMinute: 10 },
    channel: { multAvg: 8, multSubs: 20 },
  }),
});

test("cartilha: separa por nicho e formato, inclui vídeo marcado no nicho, mede em código e grava a versão", async () => {
  const { prisma } = await import("../src/lib/db");
  const { loadNicheStudies, computePlaybookStats, estimatePlaybook, generatePlaybook, studyCounts, changedSince, latestPlaybook } = await P();

  const niche = await prisma.niche.create({ data: { name: "Mistérios" } });
  const other = await prisma.niche.create({ data: { name: "Outro" } });
  const ch = await prisma.channel.create({ data: { externalId: "UCmist0000000000000000001", title: "Canal Mistério", subscriberCount: 10000 } });
  const loose = await prisma.channel.create({ data: { externalId: "UCsolto000000000000000001", title: "Canal Solto" } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: ch.id } });

  const mk = (externalId: string, channelId: string, isShort: boolean, views: number, extra: object = {}) =>
    prisma.video.create({ data: { externalId, channelId, title: `Vídeo ${externalId}`, publishedAt: new Date(), isShort, viewCount: views, durationSec: isShort ? 30 : 600, ...extra } });

  const s1 = await mk("short000001", ch.id, true, 900_000);
  const s2 = await mk("short000002", loose.id, true, 500_000, { studyNicheId: niche.id }); // estudado por link e marcado no nicho
  const s3 = await mk("short000003", loose.id, true, 400_000); // canal sem nicho, não marcado: fica fora
  const l1 = await mk("long0000001", ch.id, false, 300_000);
  const s4 = await mk("short000004", ch.id, true, 100_000); // só transcrição: pendente

  await prisma.diagnosis.create({ data: { videoId: s1.id, diagnosedAt: new Date(), ...diag("A", ["curiosidade", "medo"], 4) } });
  await prisma.diagnosis.create({ data: { videoId: s2.id, diagnosedAt: new Date(), ...diag("B", ["Curiosidade"], 6) } });
  await prisma.diagnosis.create({ data: { videoId: s3.id, diagnosedAt: new Date(), ...diag("C", ["x"], 1) } });
  await prisma.diagnosis.create({ data: { videoId: l1.id, source: "import", markdown: "# Estudo importado\nGancho forte." } });
  await prisma.transcript.create({ data: { videoId: s4.id, language: "pt", source: "manual", text: "texto" } });

  const counts = await studyCounts(niche.id);
  assert.deepEqual(counts, { short: { ready: 2, pending: 1 }, long: { ready: 1, pending: 0 } });
  assert.deepEqual(await studyCounts(other.id), { short: { ready: 0, pending: 0 }, long: { ready: 0, pending: 0 } });

  const shorts = await loadNicheStudies(niche.id, "short");
  assert.deepEqual(shorts.map((s) => s.id), [s1.id, s2.id]); // ordem por views; s3 fora
  const st = computePlaybookStats("short", shorts);
  assert.equal(st.studies, 2);
  assert.equal(st.beatInterval.value, 5); // mediana de 4 e 6
  assert.deepEqual(st.title.whatIf, { yes: 2, n: 2 });
  assert.deepEqual(st.closingCta, { yes: 2, n: 2 });
  assert.equal(st.triggers[0].label, "curiosidade");
  assert.equal(st.triggers[0].count, 2); // junta maiúscula/minúscula
  assert.deepEqual(st.structure.map((p) => p.endPct.value), [10, 20, 67, 90, 100]);

  const est = await estimatePlaybook(niche.id, "short");
  assert.equal(est.model, "claude-opus-5-5");
  assert.equal(est.studies, 2);
  assert.ok(est.usd > 0 && est.usdMax > est.usd);

  const r = await generatePlaybook(niche.id, "short");
  assert.equal(r.costUsd, 0.2); // 20k × $4 + 6k × $20 por milhão
  const body = anthropicBodies[0];
  assert.equal(body.model, "claude-opus-5-5");
  assert.match(body.system, /poucos estudos/); // aviso de base pequena
  const prompt = body.messages[0].content[0].text ?? "";
  assert.match(prompt, /Estudo #1: Vídeo short000001/);
  assert.match(prompt, /Estudo #2: Vídeo short000002/);
  assert.doesNotMatch(prompt, /short000003|long0000001/);
  assert.match(prompt, /Algo novo a cada: 5s/);

  const pb = await latestPlaybook(niche.id, "short");
  assert.ok(pb);
  assert.equal(pb.format, "short");
  assert.equal(pb.diagnosisCount, 2);
  assert.deepEqual(JSON.parse(pb.studyIds), [s1.id, s2.id]);
  assert.match(pb.markdown!, /E se você \[situação extrema\]\?/);
  assert.match(pb.markdown!, /2 de 2: #1, #2/);
  assert.equal(await latestPlaybook(niche.id, "long"), null);

  // Longo importado só com texto também gera
  const rl = await generatePlaybook(niche.id, "long");
  assert.equal(rl.playbook.format, "long");
  assert.match(anthropicBodies[1].messages[0].content[0].text ?? "", /estudo importado, só texto[\s\S]*Gancho forte/);

  // Nicho sem estudos: erro claro, sem chamar o Claude
  await assert.rejects(generatePlaybook(other.id, "short"), /Nenhum Short estudado/);
  assert.equal(anthropicBodies.length, 2);

  // Novo estudo depois da cartilha
  await prisma.diagnosis.create({ data: { videoId: s4.id, diagnosedAt: new Date(), ...diag("D", ["medo"], 5) } });
  const ch2 = changedSince(await loadNicheStudies(niche.id, "short"), pb);
  assert.deepEqual(ch2, { added: 1, updated: 0, removed: 0 });

  const gens = await prisma.generation.findMany({ where: { kind: "playbook" } });
  assert.equal(gens.length, 2);
});
