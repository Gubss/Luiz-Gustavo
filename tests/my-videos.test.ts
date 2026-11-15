/**
 * Etapa 7 — meus vídeos: lista de uploads, marcos (1h, 3h, 24h…), YouTube Analytics (login do Google),
 * diagnóstico do vídeo e do canal, e as lições indo para o gerador.
 * YouTube, Google e Anthropic simulados (sem chave real, sem custo). Banco descartável prisma/test-myvideos.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { withSse } from "./anthropic-sse";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-myvideos.db";
process.env.YOUTUBE_API_KEY = "yt-test";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.GOOGLE_CLIENT_ID = "client-test";
process.env.GOOGLE_CLIENT_SECRET = "secret-test";
for (const f of ["prisma/test-myvideos.db", "prisma/test-myvideos.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const HOUR = 3_600_000;
const T0 = Date.now();
const CH = "UCmeucanal0000000000000a";
// fio: 10 dias, 21 mil views · vulcao: 1h10 de vida · antigo: 40 dias
const VIDS = {
  fio0000000a: { title: "Puxei um fiozinho e olha no que deu", ago: 10 * 24 * HOUR, views: 21000 },
  vulcao00000: { title: "Como fazer um vulcão na escola em uma noite", ago: 70 * 60_000, views: 300 },
  antigo00000: { title: "Por que a tampa da caneta tem um furo?", ago: 40 * 24 * HOUR, views: 5000 },
};
let views: Record<string, number> = Object.fromEntries(Object.entries(VIDS).map(([k, v]) => [k, v.views]));
const calls: string[] = [];
const bodies: { system: string; messages: { content: { type: string; text?: string }[] }[] }[] = [];

const DIAG = {
  veredito: "abaixo do normal",
  resumo: "O gancho demora: a pergunta só aparece no segundo 4 e 40% saem antes disso.",
  confianca: "média",
  motivoConfianca: "Só 1 dia de Analytics.",
  oQueFuncionou: [{ ponto: "Título com promessa clara", evidencia: "CTR ok" }],
  oQueNaoFuncionou: [{ ponto: "Gancho lento", evidencia: "retenção aos 3s 55%", segundo: 2 }],
  gancho: { nota: "fraco", leitura: "Começa explicando o material.", comoMelhorar: "Abrir com o vulcão explodindo." },
  retencao: { leitura: "Queda forte no começo.", quedas: [{ segundo: 10, oQueAcontecia: "lista de materiais", porqueProvavel: "sem novidade", comoEvitar: "mostrar o resultado antes" }] },
  tituloECapa: { leitura: "ok", sugestoes: ["O vulcão que salvou minha nota"] },
  cartilha: [{ item: "Gancho em até 2s", seguiu: "não", efeito: "perdeu gente no começo" }],
  comparacao: "O do fiozinho abre com a ação já acontecendo.",
  licoes: ["Abrir com o resultado/ação nos 2 primeiros segundos", "Nunca começar listando materiais"],
  oQueObservarDepois: "Em 3 dias, se o feed de Shorts voltou a empurrar.",
};
const REPORT = {
  resumo: "Vídeos que abrem com ação vão melhor.",
  padroesQueFuncionam: [{ padrao: "Ação no primeiro segundo", evidencia: "fiozinho 4x" }],
  padroesQueNaoFuncionam: [{ padrao: "Explicar antes de mostrar", evidencia: "vulcão 0,3x" }],
  cartilhaNoMeuCanal: [{ item: "Narração rápida", status: "contrariado", evidencia: "vulcão rápido e foi mal" }],
  temasQueFuncionaram: ["experimentos caseiros"],
  licoesParaRoteiros: ["Mostrar o resultado antes de explicar", "Personagem reage com surpresa no 1º segundo"],
  proximosTestes: ["Gancho pergunta × afirmação"],
};

const PROFILE = {
  formato: "short",
  duracaoAlvoSeg: 29,
  plataformas: "YouTube Shorts",
  doQueTrata: "Curiosidades do dia a dia em animação 3D.",
  personagens: "Narrador: curioso, rápido",
  formatosDeHistoria: "Pergunta curiosa e resposta surpreendente (ex.: tampa da caneta)",
  estiloVisual: "Animação 3D (conferir: inferido sem ver o vídeo)",
  tom: "leve",
  publico: "geral",
  sempreNunca: "Sempre abre com a pergunta",
  notas: "Fiozinho foi 4x o normal.",
  roteiros: [{ videoId: "fio0000000a", roteiro: "NARRADOR: Puxei um fiozinho da blusa...", oQueFuncionou: "Ação no primeiro segundo; 4x o normal." }],
  avisos: ["Confira o estilo visual."],
};

function ytVideo(id: string) {
  const v = VIDS[id as keyof typeof VIDS];
  return {
    id,
    snippet: { channelId: CH, title: v.title, publishedAt: new Date(T0 - v.ago).toISOString(), thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` } } },
    contentDetails: { duration: "PT29S" },
    statistics: { viewCount: String(views[id]), likeCount: "10", commentCount: "2" },
  };
}

before(() => {
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    calls.push(`${url.hostname}${url.pathname}`);
    if (url.hostname === "www.googleapis.com") {
      const path = url.pathname.replace("/youtube/v3/", "");
      if (path === "channels")
        return json({
          items: [{ id: CH, snippet: { title: "Culpa de Quem?", customUrl: "@culpadequem", thumbnails: {} }, statistics: { subscriberCount: "5000" }, contentDetails: { relatedPlaylists: { uploads: "UUmeucanal" } } }],
        });
      if (path === "playlistItems")
        return json({
          items: Object.entries(VIDS)
            .sort((a, b) => a[1].ago - b[1].ago)
            .map(([id, v]) => ({ contentDetails: { videoId: id, videoPublishedAt: new Date(T0 - v.ago).toISOString() }, snippet: { title: v.title, publishedAt: new Date(T0 - v.ago).toISOString() } })),
        });
      if (path === "videos") return json({ items: (url.searchParams.get("id") ?? "").split(",").map(ytVideo) });
    }
    if (url.hostname === "www.youtube.com" && url.pathname.startsWith("/shorts/")) return new Response(null, { status: 200 });
    if (url.hostname === "oauth2.googleapis.com") {
      const p = new URLSearchParams(String(init?.body));
      if (p.get("grant_type") === "refresh_token") return json({ access_token: "tok-2", expires_in: 3600 });
      return json({ access_token: "tok-1", expires_in: 3600, refresh_token: "ref-1", scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly" });
    }
    if (url.hostname === "youtubeanalytics.googleapis.com") {
      assert.equal(new Headers(init?.headers).get("authorization")?.startsWith("Bearer tok-"), true);
      assert.equal(url.searchParams.get("ids"), "channel==MINE");
      const dim = url.searchParams.get("dimensions");
      if (dim === "day")
        return json({ columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }], rows: [["2026-11-12", 15000, 900], ["2026-11-13", 6000, 300]] });
      if (dim === "elapsedVideoTimeRatio") {
        // 100 pontos; queda forte entre 30% e 40% do vídeo
        const rows = Array.from({ length: 100 }, (_, i) => {
          const r = (i + 1) / 100;
          const watch = r < 0.3 ? 0.9 - r * 0.2 : r < 0.4 ? 0.84 - (r - 0.3) * 4 : 0.44 - (r - 0.4) * 0.1;
          return [r, watch, 0.6];
        });
        return json({ columnHeaders: [{ name: "elapsedVideoTimeRatio" }, { name: "audienceWatchRatio" }, { name: "relativeRetentionPerformance" }], rows });
      }
      if (dim === "insightTrafficSourceType") return json({ columnHeaders: [{ name: "insightTrafficSourceType" }, { name: "views" }], rows: [["SHORTS", 19000], ["YT_SEARCH", 2000]] });
      return json({
        columnHeaders: ["views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage", "likes", "comments", "shares", "subscribersGained", "subscribersLost"].map((name) => ({ name })),
        rows: [[21000, 1200, 24, 82.5, 900, 40, 120, 85, 3]],
      });
    }
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const isReport = String(body.system).includes("Encontre os padrões");
      const isProfile = String(body.system).includes("escreve o PERFIL");
      return json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(isProfile ? PROFILE : isReport ? REPORT : DIAG) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10_000, output_tokens: 3_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      });
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

test("marcos: janela de cada idade", async () => {
  const { checkpointTolerance, checkpointLabel, trackEveryMs } = await import("../src/lib/my-videos");
  assert.equal(checkpointTolerance(1), 0.5);
  assert.equal(checkpointTolerance(24), 6);
  assert.equal(checkpointLabel(72), "3d");
  assert.equal(checkpointLabel(168), "7d");
  assert.equal(trackEveryMs(2), 15 * 60_000, "vídeo novo é conferido a cada 15 min");
  assert.equal(trackEveryMs(40 * 24), 86_400_000);
});

test("retenção medida em código: quedas e 3s", async () => {
  const { summarizeRetention } = await import("../src/lib/my-diagnosis");
  const curve = Array.from({ length: 100 }, (_, i) => {
    const r = (i + 1) / 100;
    return { r, watch: r < 0.5 ? 1 - r * 0.2 : 0.5, rel: 0.5 };
  });
  const s = summarizeRetention(curve, 30)!;
  assert.ok(s.at3s! > 0.97);
  assert.equal(s.end, 0.5);
  assert.ok(Math.abs(s.drops[0].fromSec - 15) < 2, `maior queda perto de 15s (veio ${s.drops[0].fromSec})`);
  assert.equal(summarizeRetention([], 30), null);
});

test("meus vídeos: lê o canal, acompanha marcos, Analytics, diagnóstico e lições no gerador", async () => {
  const { prisma } = await import("../src/lib/db");
  const mv = await import("../src/lib/my-videos");
  const g = await import("../src/lib/google");
  const md = await import("../src/lib/my-diagnosis");

  const niche = await prisma.niche.create({ data: { name: "Curiosidades 3D" } });
  const ch = await prisma.myChannel.create({
    data: { name: "Culpa de Quem?", url: "https://www.youtube.com/@culpadequem", nicheId: niche.id, format: "short", concept: "Animação 3D de curiosidades." },
  });

  // 1) Primeira atualização: liga ao canal, lê todos os uploads e mede.
  const note = await mv.refreshChannelNow(ch.id);
  assert.match(note, /3 vídeo\(s\) novo\(s\)/);
  const linked = await prisma.myChannel.findUniqueOrThrow({ where: { id: ch.id } });
  assert.equal(linked.externalId, CH);
  assert.equal(linked.uploadsPlaylistId, "UUmeucanal");
  const vids = await prisma.myVideo.findMany({ where: { myChannelId: ch.id }, include: { checkpoints: true, snapshots: true } });
  assert.equal(vids.length, 3);
  const vulcao = vids.find((v) => v.externalId === "vulcao00000")!;
  const fio = vids.find((v) => v.externalId === "fio0000000a")!;
  const antigo = vids.find((v) => v.externalId === "antigo00000")!;
  assert.equal(vulcao.isShort, true);
  assert.equal(vulcao.viewCount, 300);
  assert.deepEqual(vulcao.checkpoints.map((c) => c.ageHours), [1], "1h10 de vida → marco de 1h");
  assert.equal(vulcao.checkpoints[0].measuredAgeMin, 70);
  assert.equal(fio.checkpoints.length, 0, "10 dias: fora da janela de 7d (5,25d–8,75d) e de 14d");
  assert.equal(antigo.snapshots.length, 0, "vídeo com mais de 30 dias não guarda snapshot");

  // Medição mais perto de 1h substitui; mais longe não.
  await mv.recordCheckpoints(vulcao, new Date(vulcao.publishedAt!.getTime() + 62 * 60_000), { views: 280, likes: 1, comments: 0 });
  await mv.recordCheckpoints(vulcao, new Date(vulcao.publishedAt!.getTime() + 85 * 60_000), { views: 350, likes: 1, comments: 0 });
  const cp1 = await prisma.myVideoCheckpoint.findUniqueOrThrow({ where: { myVideoId_ageHours: { myVideoId: vulcao.id, ageHours: 1 } } });
  assert.equal(cp1.viewCount, 280);
  assert.equal(cp1.measuredAgeMin, 62);

  // 2) Acompanhamento automático: nada vence logo depois de medir (sem gastar cota).
  const before = calls.filter((c) => c.endsWith("/videos")).length;
  const s1 = await mv.trackDue();
  assert.equal(s1.updated, 0);
  assert.equal(calls.filter((c) => c.endsWith("/videos")).length, before, "não chama videos.list sem precisar");

  // 3) Login do Google: token salvo, renovado sozinho quando vence, Analytics gravado.
  assert.match(g.authUrl("abc", g.redirectUriFor("http://localhost:3000")), /yt-analytics\.readonly/);
  assert.match(g.authUrl("abc", g.redirectUriFor("http://localhost:3000")), /access_type=offline/);
  const tok = await g.exchangeCode("code-1", "http://localhost:3000/api/google/callback");
  await g.saveGoogleAuth(CH, "Culpa de Quem?", tok);
  await prisma.googleAuth.update({ where: { channelExternalId: CH }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await g.accessTokenFor(CH), "tok-2", "renovou com o refresh_token");
  const fioFull = await prisma.myVideo.findUniqueOrThrow({ where: { id: fio.id }, include: { myChannel: true } });
  assert.equal(await mv.refreshAnalytics(fioFull), true);
  const fioA = await prisma.myVideo.findUniqueOrThrow({ where: { id: fio.id } });
  assert.equal(fioA.avgViewPercent, 82.5);
  assert.equal(JSON.parse(fioA.retention!).length, 100);
  assert.equal(JSON.parse(fioA.trafficSources!)[0].source, "SHORTS");
  assert.equal(JSON.parse(fioA.analytics!).throughDay, "2026-11-13");

  // 4) Roteiro colado com tempos (legenda) para casar a queda de retenção com a fala.
  await prisma.myVideo.update({
    where: { id: fio.id },
    data: {
      transcriptSegments: JSON.stringify([
        { start: 0, dur: 4, text: "Puxei um fiozinho da blusa..." },
        { start: 8, dur: 4, text: "E aí a vó apareceu com a tesoura" },
        { start: 12, dur: 5, text: "Agora a parte da ciência" },
      ]),
      transcriptText: "Puxei um fiozinho da blusa... E aí a vó apareceu com a tesoura. Agora a parte da ciência",
      transcriptSource: "youtube",
      studioNotes: "Continuaram assistindo 78%",
    },
  });

  // 5) Diagnóstico do vídeo: custo antes, prompt com marcos, Analytics, quedas e fala no momento.
  const est = await md.estimateMyDiagnosis(fio.id);
  assert.ok(est.usd > 0 && est.usdMax > est.usd);
  const nCalls = bodies.length;
  const r = await md.runMyDiagnosis(fio.id, { trigger: "manual" });
  assert.equal(bodies.length, nCalls + 1);
  const user = bodies.at(-1)!.messages[0].content.map((c) => c.text ?? "").join("");
  assert.match(user, /% médio visto: 82,5%/);
  assert.match(user, /Feed de Shorts 90%/);
  assert.match(user, /nesse momento: "E aí a vó apareceu com a tesoura"/, "queda de retenção casada com a fala");
  assert.match(user, /Continuaram assistindo 78%/);
  assert.match(user, /Como fazer um vulcão/, "outros vídeos do canal entram para comparar");
  assert.equal(bodies.at(-1)!.messages[0].content[0].type, "image", "thumbnail anexada");
  assert.equal(r.diagnosis.trigger, "manual");
  const inputs = JSON.parse(r.diagnosis.inputs);
  assert.ok(inputs.retention.drops.length >= 1);
  assert.match(r.diagnosis.markdown!, /Lições para os próximos roteiros/);

  // 6) Diagnóstico automático: só no marco certo (24h, 3d, 7d) e uma vez por marco.
  await prisma.myVideo.update({ where: { id: vulcao.id }, data: { publishedAt: new Date(Date.now() - 26 * HOUR) } });
  let pend = await mv.pendingMilestones(ch.id);
  assert.deepEqual(pend.map((p) => [p.myVideoId, p.milestone]), [[vulcao.id, 24]]);
  await md.runMyDiagnosis(vulcao.id, { trigger: "auto", milestone: 24 });
  pend = await mv.pendingMilestones(ch.id);
  assert.equal(pend.length, 0, "não repete o marco de 24h");

  // 7) Diagnóstico do canal e as lições indo para o gerador.
  const rep = await md.runChannelReport(ch.id);
  assert.equal(rep.report.videoCount, 3);
  assert.match(bodies.at(-1)!.system, /Encontre os padrões/);
  const { loadContext } = await import("../src/lib/generator");
  const vfNiche = (await prisma.myChannel.findUniqueOrThrow({ where: { id: ch.id } })).nicheId ?? (await prisma.niche.create({ data: { name: "Nicho do teste" } })).id;
  const vf = await prisma.videoFormat.create({ data: { nicheId: vfNiche, name: "Família constrói" } });
  const ctx = await loadContext({ myChannelId: ch.id, formatId: vf.id });
  assert.doesNotMatch(ctx.block,/APRENDIZADOS DOS MEUS VÍDEOS/,"relatório global sem formato não entra");
  assert.equal(ctx.learnings,0);
  const linkedIdeaForFormat=await prisma.idea.create({data:{myChannelId:ch.id,nicheId:vfNiche,formatId:vf.id,format:"short",theme:"Vulcão",titles:"[]"}});
  await prisma.myVideo.update({where:{id:vulcao.id},data:{inspiredIdeaId:linkedIdeaForFormat.id}});
  const scoped=await loadContext({myChannelId:ch.id,formatId:vf.id});
  assert.match(scoped.block,/APRENDIZADOS DOS MEUS VÍDEOS/);
  assert.ok(scoped.learnings>0);
  assert.doesNotMatch(scoped.block,/NÃO funcionaram no meu canal: Narração rápida/);

  // Títulos já publicados entram na lista de "não repita" (o caso da tampa da caneta).
  const { ownItems } = await import("../src/lib/my-catalog");
  const own = await ownItems(ch.id);
  assert.ok(own.some((i) => i.title === "Por que a tampa da caneta tem um furo?" && i.source === "vídeo publicado"));

  // 8) Atualização mais tarde: views sobem e o marco de 24h do vulcão é medido.
  views = { ...views, vulcao00000: 900 };
  VIDS.vulcao00000.ago = 26 * HOUR; // o YouTube devolve a data real de publicação
  await prisma.myVideo.update({ where: { id: vulcao.id }, data: { statsFetchedAt: new Date(Date.now() - 2 * HOUR) } });
  const s2 = await mv.trackDue();
  assert.ok(s2.updated >= 1);
  const cp24 = await prisma.myVideoCheckpoint.findUnique({ where: { myVideoId_ageHours: { myVideoId: vulcao.id, ageHours: 24 } } });
  assert.equal(cp24?.viewCount, 900);

  // Comparação com o canal na mesma idade
  const peers = await mv.channelPeers(ch.id, true);
  assert.equal(peers.baseMedian, 13000, "mediana de fio (21 mil) e antigo (5 mil)");

  // 9) Perfil a partir do meu canal: rascunho no modelo .md da importação, com prévia antes de salvar.
  const pf = await import("../src/lib/profile-from-channel");
  const pest = await pf.estimateProfileFromChannel(ch.id);
  assert.ok(pest.usd > 0 && pest.videos === 3);
  const pr = await pf.runProfileFromChannel(ch.id);
  assert.match(bodies.at(-1)!.messages[0].content.map((c) => c.text ?? "").join(""), /Legenda: Puxei um fiozinho da blusa/);
  const { parseProfileMd } = await import("../src/lib/profile-md");
  const parsed = parseProfileMd(pr.md);
  assert.equal(parsed.fields.format, "short");
  assert.equal(parsed.fields.durationSec, 29);
  assert.match(parsed.fields.concept!, /Curiosidades/);
  assert.equal(parsed.scripts.length, 1);
  assert.equal(parsed.scripts[0].title, "Puxei um fiozinho e olha no que deu");
  assert.equal(parsed.scripts[0].views, 21000);
  assert.deepEqual(parsed.warnings, []);
  const draft = await pf.profileDraft(ch.id);
  assert.equal(draft?.md, pr.md);
  const unchanged = await prisma.myChannel.findUniqueOrThrow({ where: { id: ch.id } });
  assert.equal(unchanged.concept, "Animação 3D de curiosidades.", "nada é salvo sem confirmar");
});

test("marcos de vídeos antigos vêm das views por dia do Analytics (sem passar por cima do que o app mediu)", async () => {
  const { prisma } = await import("../src/lib/db");
  const mv = await import("../src/lib/my-videos");
  // Dia do Analytics = fuso do Pacífico. Em novembro (PST), 12/11 termina às 08:00 UTC de 13/11.
  assert.equal(mv.pacificEndOfDay("2026-11-12").toISOString(), "2026-11-13T08:00:00.000Z");
  assert.equal(mv.pacificEndOfDay("2026-07-01").toISOString(), "2026-07-02T07:00:00.000Z", "no horário de verão é 07:00 UTC");
  const ch = await prisma.myChannel.create({ data: { name: "Canal antigo" } });
  const v = await prisma.myVideo.create({
    data: { myChannelId: ch.id, externalId: "old1", url: "https://www.youtube.com/shorts/old1", publishedAt: new Date("2026-10-01T11:00:00Z") },
  });
  // já medido pelo app em 48h: não pode ser trocado
  await prisma.myVideoCheckpoint.create({ data: { myVideoId: v.id, ageHours: 48, viewCount: 7777, measuredAgeMin: 48 * 60, source: "api" } });
  const daily = Array.from({ length: 10 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, views: 1000 * (i + 1) }));
  const n = await mv.backfillCheckpointsFromDaily(v, daily);
  const cps = await prisma.myVideoCheckpoint.findMany({ where: { myVideoId: v.id }, orderBy: { ageHours: "asc" } });
  const by = Object.fromEntries(cps.map((c) => [c.ageHours, c]));
  // Fins de dia (vida): 01/10 → 20h (1000), 02/10 → 44h (3000), 03/10 → 68h (6000), 07/10 → 164h (28000), 08/10 → 188h (36000)
  assert.equal(by[24].viewCount, 1000 + Math.round((2000 * 4) / 24), "24h fica entre o fim do 1º e do 2º dia");
  assert.equal(by[24].source, "analytics");
  assert.equal(by[48].viewCount, 7777, "o número medido pelo app fica");
  assert.equal(by[72].viewCount, 6000 + Math.round((4000 * 4) / 24));
  assert.equal(by[168].viewCount, 28000 + Math.round((8000 * 4) / 24));
  assert.equal(by[1], undefined, "1h não dá para saber pelo Analytics");
  assert.equal(by[336], undefined, "14 dias ainda não chegou nos dados");
  assert.equal(n, 3);
  // o app medindo depois troca o número do Analytics
  await mv.recordCheckpoints(v, new Date(v.publishedAt!.getTime() + 72 * 3_600_000), { views: 6500, likes: 1, comments: 1 });
  const c72 = await prisma.myVideoCheckpoint.findUniqueOrThrow({ where: { myVideoId_ageHours: { myVideoId: v.id, ageHours: 72 } } });
  assert.equal(c72.viewCount, 6500);
  assert.equal(c72.source, "api");
});
