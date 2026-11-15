/**
 * Classificação automática de formato, limpeza com cópia de segurança e regenerar ideia antiga num formato.
 * Anthropic simulada (sem chave real, sem custo). Usa o banco descartável prisma/test-classify.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { withSse } from "./anthropic-sse";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATABASE_URL = "file:./test-classify.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.RADAR_BACKUP_DIR = mkdtempSync(path.join(tmpdir(), "radar-backup-"));
for (const f of ["prisma/test-classify.db", "prisma/test-classify.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const C = () => import("../src/lib/classify");

const RECIPE = {
  resumo: "Desastre em cadeia: cada conserto piora.",
  abertura: { comoAbre: "O desastre já aconteceu", primeiroQuadro: "O estrago", exemplos: ["Eu desmanchei…"], estudos: [1] },
  narrador: { quem: "O menino", pessoa: "1ª pessoa (eu)", comoFala: "Curto", exemplos: ["Aí eu…"] },
  motor: [{ passo: "Dispara", oQueAcontece: "Sem querer", quando: "0-5s" }],
  repeticoes: [],
  tensao: { comoCresce: "Cada tentativa piora", regras: [] },
  fecho: { comoFecha: "Recomeça", exemplos: [], regras: [] },
  porQueViralizou: [],
  regras: [],
  evitar: [],
  checklist: ["Três tentativas"],
  lacunas: [],
};

const SCRIPT = {
  historinha: "O menino estoura os balões da festa antes de a avó chegar.",
  formatoCombina: { combina: true, motivo: "ok", sugestao: "" },
  titulo: "Os balões da festa",
  titulosAlternativos: [],
  duracaoSeg: 30,
  resumo: "x",
  cenas: [{ inicio: 0, fim: 30, parte: "gancho", personagem: "Narrador", fala: "Eu estourei todos os balões da festa.", acao: "Sala cheia de borracha", textoNaTela: "", novidade: "estrago" }],
  capa: "x",
  descricao: "x",
  hashtags: [],
  checklist: [{ item: "Três tentativas", origem: "formato", ok: true, comentario: "" }],
  adaptacao: "x",
  conferirFatos: [],
  dicasDeProducao: [],
};

type Body = { system: string; messages: { content: { text?: string }[] }[] };
const bodies: Body[] = [];
const userText = (b: Body) => b.messages[0].content.map((c) => c.text ?? "").join("\n");

function answer(b: Body) {
  const sys = String(b.system);
  if (sys.includes("Você classifica vídeos")) {
    const t = userText(b);
    const title = /# Vídeo: (.*)/.exec(t)?.[1] ?? "";
    const formato = /Desastre|Domino/i.test(title) ? "Desastre em cadeia" : /Construir/.test(title) ? "Construir resolvendo problemas" : "nenhum";
    return { formato, motivo: `Pelo título ${title}.`, confianca: "alta" };
  }
  if (sys.includes("completar um formato")) return { faltam: "Mais desastres em cadeia em casa.", palavrasChave: ["domino", "chain reaction"], candidatos: [{ n: 1, motivo: "parece" }] };
  if (sys.includes("TAREFA: escrever o roteiro")) return SCRIPT;
  return RECIPE;
}

before(() => {
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.anthropic.com") {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: JSON.stringify(answer(body)) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 3_000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
});

let n = 0;
async function seedNiche(name: string) {
  const { prisma } = await import("../src/lib/db");
  const niche = await prisma.niche.create({ data: { name } });
  const ch = await prisma.channel.create({ data: { externalId: `UC${name.replace(/\W/g, "")}${Math.random().toString(36).slice(2, 10)}`, title: `Canal ${name}` } });
  await prisma.nicheChannel.create({ data: { nicheId: niche.id, channelId: ch.id } });
  const mk = async (title: string, opts: { lang?: string; text?: string; diagnosed?: boolean } = {}) => {
    n++;
    const v = await prisma.video.create({
      data: { externalId: `v${Date.now()}${n}`, channelId: ch.id, title, publishedAt: new Date(), isShort: true, viewCount: 1_000_000 - n, durationSec: 60 },
    });
    if (opts.diagnosed !== false) await prisma.diagnosis.create({ data: { videoId: v.id, markdown: `Estudo: ${title}.` } });
    if (opts.text) await prisma.transcript.create({ data: { videoId: v.id, language: opts.lang ?? "pt", source: "manual", text: opts.text } });
    return v;
  };
  return { prisma, niche, ch, mk };
}

test("classificação: sugere sem gravar; ao gravar cria os dois formatos, põe os vídeos (até 5) e marca confirmada/trocada", async () => {
  const { prisma, niche, mk } = await seedNiche("Animação 3D");
  const c = await C();
  const construir: { id: string }[] = [];
  for (let i = 1; i <= 7; i++) construir.push(await mk(`Construir ${i}`, { text: "Então você faz. Mas dá errado." }));
  const english = await mk("Domino house", { lang: "en", text: "Then the dog pulls the string and everything falls." });
  const desastre = await mk("Desastre do fiozinho", { text: "Eu puxei um fiozinho." });
  const fatos = await mk("Lista de fatos");

  const cands = await c.classifyCandidates(niche.id);
  assert.deepEqual(cands.map((x) => [x.name, x.exists]), [["Desastre em cadeia", false], ["Construir resolvendo problemas", false]]);

  const rows = await c.nicheStudiesForClassify(niche.id);
  assert.equal(rows.length, 10);
  const r = await c.classifyMany(niche.id, rows.map((x) => x.study.id));
  assert.equal(r.ok, 10);
  assert.equal(r.errors.length, 0);

  // Nada gravado ainda: só sugestões pendentes, nenhum formato criado.
  assert.equal(await prisma.videoFormat.count({ where: { nicheId: niche.id } }), 0);
  const sug = await prisma.formatSuggestion.findMany({ where: { nicheId: niche.id } });
  assert.equal(sug.length, 10);
  assert.ok(sug.every((s) => s.status === "pending" && s.reason.length > 0));
  const label = (id: string) => sug.find((s) => s.videoId === id)!.label;
  assert.equal(label(english.id), "Desastre em cadeia");
  assert.equal(label(fatos.id), "nenhum");
  // Vídeo em inglês: a transcrição vai no idioma original e as opções são só os formatos + nenhum.
  const engBody = bodies.find((b) => userText(b).includes("# Vídeo: Domino house"))!;
  assert.ok(userText(engBody).includes("Then the dog pulls the string"));
  assert.ok(userText(engBody).includes("transcrição em en"));

  // Gravar: troco um "Construir" para desastre; o 7º construir passa de 5 e fica de reserva.
  const choices = rows
    .map((x) => ({ videoId: x.study.id, label: label(x.study.id) }))
    .sort((a, b) => a.videoId.localeCompare(b.videoId));
  const ordered = [...construir.map((v) => v.id), english.id, desastre.id, fatos.id].map((id) => choices.find((x) => x.videoId === id)!);
  ordered[0] = { videoId: construir[0].id, label: "Desastre em cadeia" };
  const res = await c.applyChoices(niche.id, ordered);
  assert.equal(res.created.length, 2);
  const obra = res.placed.find((p) => p.name === "Construir resolvendo problemas")!;
  const des = res.placed.find((p) => p.name === "Desastre em cadeia")!;
  assert.equal(obra.total, 5);
  assert.deepEqual(obra.reserve, ["Construir 7"]);
  assert.equal(des.total, 3);
  assert.equal(res.none, 1);
  const after = await prisma.formatSuggestion.findMany({ where: { nicheId: niche.id } });
  assert.equal(after.find((s) => s.videoId === construir[0].id)!.status, "changed");
  assert.equal(after.find((s) => s.videoId === construir[0].id)!.chosen, "Desastre em cadeia");
  assert.equal(after.find((s) => s.videoId === fatos.id)!.status, "confirmed");
  assert.equal(after.find((s) => s.videoId === construir[6].id)!.status, "confirmed", "reserva: escolha gravada, sem entrar na receita");

  // Agora os candidatos são os formatos que existem
  assert.ok((await c.classifyCandidates(niche.id)).every((x) => x.exists));

  // Receitas: os dois formatos ganham receita; nenhum é rascunho, então não há lista do que falta.
  const rg = await c.recipesAndGaps(res.placed.map((p) => p.formatId));
  assert.equal(await prisma.formatRecipe.count({ where: { format: { nicheId: niche.id } } }), 2, rg.notes.join(" | "));
  assert.equal((await prisma.videoFormat.findMany({ where: { nicheId: niche.id, gaps: { not: null } } })).length, 0);
});

test("formato com menos de 3 vídeos: receita de rascunho e o que falta, com candidatos só do radar", async () => {
  const { prisma, niche, mk } = await seedNiche("Animação 3D b");
  const c = await C();
  const v = await mk("Desastre único", { text: "Eu puxei." });
  await c.classifyMany(niche.id, [v.id]);
  const res = await c.applyChoices(niche.id, [{ videoId: v.id, label: "Desastre em cadeia" }]);
  const f = res.placed[0];
  const rg = await c.recipesAndGaps([f.formatId]);
  assert.ok(rg.notes.some((x) => x.includes("rascunho")), rg.notes.join(" | "));
  const row = await prisma.videoFormat.findUniqueOrThrow({ where: { id: f.formatId } });
  const g = c.gapHint(row)!;
  assert.equal(g.faltam, "Mais desastres em cadeia em casa.");
  assert.deepEqual(g.palavrasChave, ["domino", "chain reaction"]);
  // o número 1 não existe na lista do radar (nenhum outlier coletado): candidato inventado é descartado
  assert.equal(g.candidatos.length, 0);
  assert.ok(g.radarHref.startsWith(`/radar?niche=${niche.id}`));
});

test("estudo novo: sugere formato só onde o nicho já tem formatos e o vídeo ainda não está em um", async () => {
  const { prisma, niche, mk } = await seedNiche("Com formatos");
  const empty = await seedNiche("Sem formatos");
  const c = await C();
  await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Desastre em cadeia", description: "piora em cadeia" } });
  const v = await mk("Desastre novo", { text: "Eu puxei." });
  const r = await c.suggestAfterStudy(v.id);
  assert.deepEqual(r.labels, ["Desastre em cadeia"]);
  const s = await prisma.formatSuggestion.findUniqueOrThrow({ where: { videoId_nicheId: { videoId: v.id, nicheId: niche.id } } });
  assert.equal(s.status, "pending");
  assert.ok(s.formatId, "já aponta para o formato que existe");
  const w = await empty.mk("Desastre fora");
  assert.deepEqual((await c.suggestAfterStudy(w.id)).labels, []);
});

test("limpeza: cópia de segurança antes; fica a ideia dos balões, os estudos e os roteiros do perfil", async () => {
  const { prisma, niche, mk } = await seedNiche("Limpeza");
  const { runCleanup, cleanupPreview, KEEP_IDEA_IDS } = await import("../src/lib/cleanup");
  await mk("Estudo que fica");
  const ch = await prisma.myChannel.create({ data: { nicheId: niche.id, name: "Família", format: "short" } });
  const fmt = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Desastre em cadeia" } });
  await prisma.myChannelScript.create({ data: { myChannelId: ch.id, title: "O fiozinho", script: "Eu puxei um fiozinho." } });
  await prisma.nichePlaybook.create({ data: { nicheId: niche.id, model: "m", stats: "{}", content: "{}", diagnosisCount: 3 } });
  const baloes = await prisma.idea.create({ data: { id: KEEP_IDEA_IDS[0], myChannelId: ch.id, nicheId: niche.id, format: "short", theme: "Balões", titles: "[]", script: "x" } });
  const old = await prisma.idea.create({ data: { myChannelId: ch.id, nicheId: niche.id, format: "short", theme: "Antiga", titles: "[]", script: "y" } });
  const withFormat = await prisma.idea.create({ data: { myChannelId: ch.id, nicheId: niche.id, format: "short", formatId: fmt.id, theme: "Nova", titles: "[]" } });
  const diagBefore = await prisma.diagnosis.count();

  const pv = await cleanupPreview(niche.id);
  assert.equal(pv.playbooks.length, 1);
  assert.deepEqual(pv.ideas.map((i) => i.id).sort(), [baloes.id, old.id].sort());

  // mesmo marcada, a dos balões não se apaga
  const r = await runCleanup(niche.id, { playbooks: true, ideaIds: [baloes.id, old.id, withFormat.id] });
  assert.ok(existsSync(r.backup.path), "cópia de segurança feita");
  assert.equal(r.playbooks, 1);
  assert.equal(r.ideas, 1);
  assert.deepEqual(r.kept, ["Balões"]);
  assert.ok(await prisma.idea.findUnique({ where: { id: baloes.id } }));
  assert.ok(await prisma.idea.findUnique({ where: { id: withFormat.id } }), "ideia com formato não entra na limpeza");
  assert.equal(await prisma.idea.findUnique({ where: { id: old.id } }), null);
  assert.equal(await prisma.diagnosis.count(), diagBefore);
  assert.equal(await prisma.myChannelScript.count({ where: { myChannelId: ch.id } }), 1);
  assert.equal(await prisma.nichePlaybook.count({ where: { nicheId: niche.id } }), 0);
  await assert.rejects(runCleanup(niche.id, { playbooks: false, ideaIds: [baloes.id] }), /Nada marcado/);
});

test("regenerar ideia antiga num formato: o tema fica e o gancho antigo não vale", async () => {
  const { prisma, niche } = await seedNiche("Regenerar");
  const { generateScript } = await import("../src/lib/generator");
  const ch = await prisma.myChannel.create({ data: { nicheId: niche.id, name: "Família", format: "short", characters: "O menino\nA avó", visualStyle: "3D" } });
  const fmt = await prisma.videoFormat.create({ data: { nicheId: niche.id, name: "Desastre em cadeia", description: "piora em cadeia" } });
  const oldData = {
    tema: "Balões da festa",
    premissa: "O menino enche balões para a festa da avó.",
    formatoDeHistoria: "Lista de curiosidades sobre balões",
    gancho: "Você sabia que o balão foi inventado em 1824?",
    ganchoPadrao: "Pergunta de curiosidade",
    titulos: [{ titulo: "Os balões", formula: "x" }],
    adaptacao: { daCartilha: "x", doCanal: "y" },
    porQueVaiFuncionar: "x",
    risco: "",
    recontar: { formatId: fmt.id, formatName: fmt.name, at: new Date().toISOString() },
  };
  const idea = await prisma.idea.create({
    data: { myChannelId: ch.id, nicheId: niche.id, format: "short", formatId: fmt.id, theme: "Balões da festa", titles: "[]", status: "RETURNED", ideaData: JSON.stringify(oldData) },
  });
  bodies.length = 0;
  const r = await generateScript(idea.id, { noRecipeOk: true }); // formato ainda sem receita: só com a confirmação
  const sent = userText(bodies.find((b) => String(b.system).includes("TAREFA: escrever o roteiro"))!);
  assert.ok(sent.includes("Tema: Balões da festa"));
  assert.ok(sent.includes("RECONTAR NO FORMATO"));
  assert.ok(sent.includes('motor da receita de "Desastre em cadeia"'));
  assert.ok(!sent.includes("Você sabia que o balão foi inventado"), "gancho antigo fica de fora");
  assert.ok(!sent.includes("Lista de curiosidades"), "formato de história antigo fica de fora");
  assert.equal(r.idea.status, "SCRIPT");
  assert.ok(r.idea.script!.includes("**Formato:** Desastre em cadeia"));
});
