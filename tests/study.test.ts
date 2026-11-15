/**
 * Etapa 3 — estudo do vídeo. YouTube e Anthropic simulados (sem chave real, sem custo).
 * Usa o banco descartável prisma/test-study.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { withSse } from "./anthropic-sse";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-study.db";
process.env.YOUTUBE_API_KEY = "test-key";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-study.db", "prisma/test-study.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

// Imports dinâmicos: o banco de teste precisa estar configurado antes de carregar o Prisma.
const T = () => import("../src/lib/transcript");
const M = () => import("../src/lib/study-metrics");
const C = () => import("../src/lib/claude");

// ---------- Funções puras ----------

test("lê legenda XML antiga e srv3, e json3", async () => {
  const { parseTimedTextXml, parseJson3 } = await T();
  const a = parseTimedTextXml('<transcript><text start="0.5" dur="2">Olá &amp; bem-vindo</text><text start="2.5" dur="1.5">ao &#39;bunker&#39;</text></transcript>');
  assert.deepEqual(a, [
    { start: 0.5, dur: 2, text: "Olá & bem-vindo" },
    { start: 2.5, dur: 1.5, text: "ao 'bunker'" },
  ]);
  const b = parseTimedTextXml('<timedtext><body><p t="1000" d="2000"><s>E se</s><s> você</s></p></body></timedtext>');
  assert.deepEqual(b, [{ start: 1, dur: 2, text: "E se você" }]);
  const c = parseJson3(JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Oi" }, { utf8: " gente" }] }, { tStartMs: 1500 }] }));
  assert.deepEqual(c, [{ start: 0, dur: 1.5, text: "Oi gente" }]);
});

test("transcrição colada: formato do YouTube (tempo numa linha, texto na outra), SRT e texto corrido", async () => {
  const { parsePastedTranscript, countWords } = await T();
  const yt = parsePastedTranscript("0:00\nE se você acordasse num bunker?\n0:04\nSem janelas, sem saída.\n1:02\nFoi o que aconteceu.");
  assert.equal(yt.timed, true);
  assert.equal(yt.segments.length, 3);
  assert.equal(yt.segments[2].start, 62);
  assert.equal(yt.segments[0].dur, 4);

  const srt = parsePastedTranscript("1\n00:00:01,000 --> 00:00:03,500\nPrimeira fala\n\n2\n00:00:03,500 --> 00:00:06,000\nSegunda fala\n");
  assert.deepEqual(srt.segments, [
    { start: 1, dur: 2.5, text: "Primeira fala" },
    { start: 3.5, dur: 2.5, text: "Segunda fala" },
  ]);

  const plain = parsePastedTranscript("Um texto corrido sem nenhum tempo marcado, só a fala inteira.");
  assert.equal(plain.timed, false);
  assert.equal(plain.segments.length, 0);
  assert.equal(countWords(plain.text), 11);
});

test("escolhe a legenda no idioma do vídeo, feita por gente antes da automática", async () => {
  const { pickTrack } = await T();
  const tracks = [
    { languageCode: "en", kind: "asr" },
    { languageCode: "pt-BR", kind: "asr" },
    { languageCode: "pt", kind: undefined },
  ];
  assert.equal(pickTrack(tracks, "pt")?.languageCode, "pt");
  assert.equal(pickTrack(tracks, "en")?.languageCode, "en");
  assert.equal(pickTrack([], "pt"), null);
});

test("medidas: palavras por segundo, abertura, fecho e intervalos entre momentos novos", async () => {
  const { computeStudyMetrics, beatMetrics, titleMetrics, transcriptForPrompt } = await M();
  const segments = [
    { start: 0, dur: 3, text: "E se você acordasse dentro de um bunker" }, // 8 palavras
    { start: 3, dur: 3, text: "sem janelas e sem saída nenhuma" }, // 6
    { start: 6, dur: 4, text: "foi exatamente isso que aconteceu com ele" }, // 7
    { start: 10, dur: 5, text: "se inscreva para ver a parte 2?" }, // 7
  ];
  const text = segments.map((s) => s.text).join(" ");
  const m = computeStudyMetrics({ title: "E se VOCÊ acordasse num bunker?", isShort: true, durationSec: 15, segments, text, beats: [{ t: 0, kind: "gancho", text: "" }, { t: 6, kind: "virada", text: "" }, { t: 10, kind: "chamada", text: "" }] });
  assert.equal(m.wordCount, 28);
  assert.equal(m.wordsPerSec, 1.87); // 28 palavras em 15s de fala
  assert.equal(m.opening?.text, "E se você acordasse dentro de um bunker");
  assert.equal(m.closing?.hasCta, true);
  assert.equal(m.closing?.endsWithQuestion, true);
  assert.equal(m.title.hasQuestion, true);
  assert.equal(m.title.startsWithWhatIf, true);
  assert.deepEqual(m.title.capsWords, ["VOCÊ"]);
  // beats em 0, 6, 10 com fim em 15 → intervalos 6, 4, 5
  assert.deepEqual(m.beats, { count: 3, avgInterval: 5, maxGap: 6, maxGapAt: 0, perMinute: 12 });
  assert.equal(beatMetrics([], 60).count, 0);
  assert.equal(titleMetrics("Top 10 lugares").pattern, "Top [N] lugares");
  assert.match(transcriptForPrompt(segments, text, true), /^\[0\] E se/);
});

test("custo: Opus 5.5 a US$ 4/20 por milhão; estimativa em faixa", async () => {
  const { costUsd, estimateCost } = await C();
  assert.equal(costUsd("claude-opus-5-5", 1_000_000, 0), 4);
  assert.equal(costUsd("claude-sonnet-5-5", 0, 1_000_000), 10);
  const e = estimateCost("claude-opus-5-5", "x".repeat(36_000), 5000, 14000);
  assert.equal(e.inputTokens, 10_000);
  assert.ok(Math.abs(e.usd - 0.14) < 1e-9);
  assert.ok(e.usdMax > e.usd);
});

// ---------- Fluxo completo com APIs simuladas ----------

const anthropicBodies: Record<string, unknown>[] = [];
let commentCalls = 0;

const DIAG = {
  resumo: "Short de curiosidade sobre bunkers.",
  porqueFuncionou: [{ hipotese: "Pergunta em segunda pessoa", evidencia: "Título 'E se você…'", confianca: "alta" }],
  titulo: { formula: "E se você [situação extrema]?", gatilhos: ["curiosidade"], comentario: "Coloca o espectador na cena." },
  thumbnail: { descricao: "Porta de bunker", elementos: ["porta", "luz vermelha"], relacaoComTitulo: "Completa a pergunta." },
  gancho: { texto: "E se você acordasse dentro de um bunker", tecnica: "pergunta hipotética", comentario: "Direto." },
  estrutura: {
    gancho: { inicio: 0, fim: 3, resumo: "pergunta" },
    virada: { inicio: 3, fim: 6, resumo: "sem saída" },
    desenvolvimento: { inicio: 6, fim: 10, resumo: "história" },
    climax: { inicio: 10, fim: 12, resumo: "revelação" },
    fecho: { inicio: 12, fim: 15, resumo: "chamada" },
  },
  beats: [
    { t: 0, tipo: "gancho", texto: "pergunta" },
    { t: 4, tipo: "virada", texto: "sem saída" },
    { t: 10, tipo: "chamada", texto: "parte 2" },
  ],
  pontosDeRisco: [{ t: 6, motivo: "explicação longa" }],
  comoReplicar: ["Abrir com pergunta em 2ª pessoa"],
  temasDerivados: ["E se você ficasse preso num submarino?"],
};
const COMMENTS = {
  resumo: "Público pediu parte 2.",
  oQueGostaram: [{ ponto: "Suspense", exemplo: "que medo" }],
  criticas: [],
  perguntas: ["Onde fica o bunker?"],
  pedidosDeTema: ["submarinos"],
  publico: "brasileiros jovens",
  frasesMarcantes: [{ texto: "parte 2 por favor", likes: 900 }],
  ideiasDeVideo: ["Bunker da Suíça"],
};

before(() => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "www.youtube.com" && url.pathname === "/watch") return new Response('<html>"INNERTUBE_API_KEY":"KEYKEY"</html>');
    if (url.hostname === "www.youtube.com" && url.pathname === "/youtubei/v1/player")
      return json({
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { baseUrl: "https://www.youtube.com/api/timedtext?v=bunker00001&lang=en&kind=asr", languageCode: "en", kind: "asr" },
              { baseUrl: "https://www.youtube.com/api/timedtext?v=bunker00001&lang=pt&fmt=srv3", languageCode: "pt" },
            ],
          },
        },
      });
    if (url.hostname === "www.youtube.com" && url.pathname === "/api/timedtext") {
      assert.equal(url.searchParams.get("lang"), "pt");
      assert.equal(url.searchParams.has("fmt"), false);
      return new Response(
        '<transcript><text start="0" dur="3">E se você acordasse dentro de um bunker</text><text start="3" dur="3">sem janelas e sem saída nenhuma</text><text start="6" dur="4">foi exatamente isso que aconteceu com ele</text><text start="10" dur="5">se inscreva para ver a parte 2?</text></transcript>',
      );
    }
    if (url.hostname === "www.googleapis.com" && url.pathname.endsWith("/commentThreads")) {
      commentCalls++;
      return json({
        items: [
          { snippet: { totalReplyCount: 3, topLevelComment: { snippet: { authorDisplayName: "@ana", textOriginal: "parte 2 por favor", likeCount: 900, publishedAt: "2026-11-01T00:00:00Z" } } } },
          { snippet: { topLevelComment: { snippet: { authorDisplayName: "@bia", textOriginal: "que medo", likeCount: 50 } } } },
        ],
      });
    }
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      anthropicBodies.push(body);
      const isComments = body.model === "claude-sonnet-5-5";
      return json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: JSON.stringify(isComments ? COMMENTS : DIAG) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10_000, output_tokens: 5_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      });
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

test("estudo completo: legenda → diagnóstico (Opus) → comentários (Sonnet), com custo registrado", async () => {
  const { prisma } = await import("../src/lib/db");
  const { fetchAndSaveTranscript } = await import("../src/lib/transcript");
  const { runDiagnosis, estimateDiagnosis } = await import("../src/lib/diagnosis");
  const { analyzeComments } = await import("../src/lib/comments");

  const ch = await prisma.channel.create({ data: { externalId: "UCbunkerbunkerbunker0001", title: "Canal do Bunker", subscriberCount: 29000 } });
  const v = await prisma.video.create({
    data: { externalId: "bunker00001", channelId: ch.id, title: "E se você acordasse num bunker?", publishedAt: new Date(Date.now() - 5 * 86_400_000), durationSec: 15, isShort: true, viewCount: 1_600_000, defaultLang: "pt" },
  });

  const t = await fetchAndSaveTranscript(v.id);
  assert.equal(t.source, "youtube");
  assert.equal(t.language, "pt");
  assert.equal(t.trackKind, "manual");
  assert.equal(t.wordCount, 28);

  const est = await estimateDiagnosis(v.id);
  assert.equal(est.model, "claude-opus-5-5");
  assert.ok(est.usd > 0 && est.usdMax > est.usd);

  const r = await runDiagnosis(v.id);
  assert.equal(r.costUsd, 0.14); // 10k × $4 + 5k × $20 por milhão
  const body = anthropicBodies[0] as {
    model: string;
    fallbacks: string;
    thinking: { type: string };
    output_config: { effort: string; format: { type: string } };
    messages: { content: { type: string; source?: { url: string }; text?: string }[] }[];
  };
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.equal(body.thinking.type, "adaptive");
  assert.equal(body.output_config.effort, "medium");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.messages[0].content[0].source?.url, "https://i.ytimg.com/vi/bunker00001/hqdefault.jpg");
  assert.match(body.messages[0].content[1].text ?? "", /\[3\] sem janelas/);

  const d = await prisma.diagnosis.findUniqueOrThrow({ where: { videoId: v.id } });
  assert.equal(d.source, "app");
  assert.equal(d.usedTranscript, true);
  const metrics = JSON.parse(d.metrics!);
  assert.equal(metrics.wordsPerSec, 1.87);
  assert.deepEqual(metrics.beats, { count: 3, avgInterval: 5, maxGap: 6, maxGapAt: 4, perMinute: 12 });
  assert.match(d.markdown!, /E se você \[situação extrema\]\?/);
  const st = await prisma.scriptStructure.findUniqueOrThrow({ where: { videoId: v.id } });
  assert.equal(st.maxBeatGap, 6);

  const c = await analyzeComments(v.id);
  assert.equal(commentCalls, 1); // só 1 página (sem nextPageToken)
  assert.equal(c.model, "claude-sonnet-5-5");
  const d2 = await prisma.diagnosis.findUniqueOrThrow({ where: { videoId: v.id } });
  assert.equal(JSON.parse(d2.commentsRaw!).length, 2);
  assert.equal(JSON.parse(d2.commentsAnalysis!).pedidosDeTema[0], "submarinos");
  assert.equal(d2.content, d.content); // análise de comentários não apaga o diagnóstico

  const gens = await prisma.generation.findMany({ orderBy: { createdAt: "asc" } });
  assert.deepEqual(gens.map((g) => g.kind), ["diagnosis", "comments"]);
  assert.ok(gens.every((g) => g.costUsd! > 0 && g.videoId === v.id));
});

test("importação externa: importKey único evita duplicar", async () => {
  const { prisma } = await import("../src/lib/db");
  const v = await prisma.video.findFirstOrThrow();
  const row = { videoId: v.id, language: "pt", source: "import", text: "texto", importSource: "faro", importKey: "faro:Olheiros/x.md" };
  await prisma.transcript.upsert({ where: { importKey: row.importKey }, create: { ...row, videoId: (await prisma.video.create({ data: { externalId: "imported001", channelId: v.channelId, title: "Importado", publishedAt: new Date() } })).id }, update: { text: "texto" } });
  await prisma.transcript.upsert({ where: { importKey: row.importKey }, create: row, update: { text: "texto novo" } });
  const rows = await prisma.transcript.findMany({ where: { importSource: "faro" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "texto novo");
});
