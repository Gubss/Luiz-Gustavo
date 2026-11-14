/**
 * Etapa 8 — configurações e controle de cota: chaves salvas na tela, regras e opções, de onde veio cada unidade de cota,
 * limite de gasto com o Claude e cópia de segurança. YouTube simulado. Banco descartável prisma/test-settings.db.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATABASE_URL = "file:./test-settings.db";
process.env.YOUTUBE_API_KEY = "yt-do-env";
process.env.ANTHROPIC_API_KEY = "sk-ant-do-env";
const BACKUPS = mkdtempSync(path.join(tmpdir(), "radar-backups-"));
process.env.RADAR_BACKUP_DIR = BACKUPS;
for (const f of ["prisma/test-settings.db", "prisma/test-settings.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchCalls: { url: string; key: string | null }[] = [];
let ytStatus = 200;
let ytBody: unknown = { items: [{ id: "jNQXAC9IVRw" }] };
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const headers = new Headers(init?.headers);
  fetchCalls.push({ url, key: headers.get("X-goog-api-key") });
  return new Response(JSON.stringify(ytBody), { status: ytStatus, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

test("configurações: o que é salvo na tela vale mais que o .env; booleanos e números; voltar ao padrão", async () => {
  const { getSettings, saveSetting, resetSetting, secretStatus, maskSecret } = await import("../src/lib/settings");
  let s = await getSettings();
  assert.equal(s.youtubeApiKey, "yt-do-env");
  assert.equal(s.autoCollect, true);
  assert.equal(s.monthlyBudgetUsd, 0);
  assert.equal((await secretStatus("youtubeApiKey")).source, "env");

  await saveSetting("youtubeApiKey", "AIzaSyCHAVE-NOVA-1234");
  await saveSetting("autoCollect", "0");
  await saveSetting("multiplier", "2.5");
  await saveSetting("minViews", "abc"); // valor estragado é ignorado
  s = await getSettings();
  assert.equal(s.youtubeApiKey, "AIzaSyCHAVE-NOVA-1234");
  assert.equal(s.autoCollect, false);
  assert.equal(s.multiplier, 2.5);
  assert.equal(s.minViews, 10000);
  const st = await secretStatus("youtubeApiKey");
  assert.deepEqual(st, { source: "app", masked: "AIzaSy…1234", envAlso: true });
  assert.equal(maskSecret("curta"), "•••••");

  await resetSetting("youtubeApiKey");
  await resetSetting("minViews");
  assert.equal((await getSettings()).youtubeApiKey, "yt-do-env");
});

test("cota: cada unidade fica com a origem (tarefa, coleta, acompanhamento, outras) e a renovação é à meia-noite do Pacífico", async () => {
  const { prisma } = await import("../src/lib/db");
  const { ytGet } = await import("../src/lib/youtube");
  const { startJob } = await import("../src/lib/jobs");
  const { withQuotaSource, quotaBreakdown, quotaHistory, quotaResetAt, quotaUsedToday } = await import("../src/lib/quota");

  await ytGet("videos.list", { part: "id", id: "a" }); // fora de tudo: "outras ações"
  await withQuotaSource("coleta", () => ytGet("channels.list", { part: "id", id: "b" }));
  await startJob({ kind: "discover", targetId: "n1", label: "Busca", href: "/descobrir" }, async () => {
    await ytGet("search.list", { part: "id", q: "x" });
    await ytGet("videos.list", { part: "id", id: "c" });
    return "ok";
  });
  await wait(200);

  const rows = await prisma.quotaLog.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(
    rows.map((r) => [r.endpoint, r.source]),
    [
      ["videos.list", null],
      ["channels.list", "coleta"],
      ["search.list", "discover"],
      ["videos.list", "discover"],
    ],
  );
  const b = await quotaBreakdown();
  assert.deepEqual(
    b.bySource.map((r) => [r.label, r.units]),
    [
      ["Descobrir canais (buscas)", 101],
      ["Coleta diária do radar", 1],
      ["Outras ações (botões na tela)", 1],
    ],
  );
  assert.equal(await quotaUsedToday(), 103);
  const h = await quotaHistory(14);
  assert.equal(h.length, 14);
  assert.equal(h.at(-1)?.units, 103);

  const now = new Date("2026-11-14T18:00:00Z"); // 10h no Pacífico (PST, -8)
  assert.equal(quotaResetAt(now).toISOString(), "2026-11-15T08:00:00.000Z"); // 05h em Brasília
  const summer = new Date("2026-07-01T12:00:00Z"); // PDT, -7
  assert.equal(quotaResetAt(summer).toISOString(), "2026-07-02T07:00:00.000Z");
});

test("teste da chave do YouTube: aceita a boa (1 unidade) e explica a ruim", async () => {
  const { prisma } = await import("../src/lib/db");
  const { testYoutubeKey } = await import("../src/lib/youtube");
  const { withQuotaSource } = await import("../src/lib/quota");
  fetchCalls.length = 0;
  const msg = await withQuotaSource("key-test", () => testYoutubeKey("AIzaChaveBoa"));
  assert.match(msg, /funcionando/);
  assert.equal(fetchCalls[0].key, "AIzaChaveBoa");
  assert.ok(!fetchCalls[0].url.includes("AIzaChaveBoa"), "a chave não vai na URL");
  assert.equal(await prisma.quotaLog.count({ where: { source: "key-test" } }), 1);

  ytStatus = 400;
  ytBody = { error: { message: "API key not valid. Please pass a valid API key.", errors: [{ reason: "badRequest" }] } };
  await assert.rejects(testYoutubeKey("ruim"), /Chave inválida/);
  ytStatus = 403;
  ytBody = { error: { message: "YouTube Data API v3 has not been used in project 123 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } };
  await assert.rejects(testYoutubeKey("sem-api"), /não está ativada/);
  ytStatus = 200;
  ytBody = { items: [] };
});

test("limite do mês: com o gasto no limite, o Claude não é chamado e o aviso diz onde aumentar", async () => {
  const { prisma } = await import("../src/lib/db");
  const { saveSetting } = await import("../src/lib/settings");
  const { callStructured, claudeSpendSummary, ClaudeError } = await import("../src/lib/claude");
  const z = await import("zod/v4");
  await prisma.generation.create({ data: { kind: "ideas", model: "claude-opus-5-5", input: "{}", output: "{}", costUsd: 1.2 } });
  await prisma.generation.create({ data: { kind: "comments", model: "claude-sonnet-5-5", input: "{}", output: "{}", costUsd: 0.05 } });
  const sum = await claudeSpendSummary();
  assert.equal(sum.calls, 2);
  assert.ok(Math.abs(sum.usd - 1.25) < 1e-9);
  assert.deepEqual(sum.byKind.map((k) => k.label), ["Ideias do gerador", "Resumo dos comentários"]);
  assert.equal(sum.perDay.length, 30);
  assert.ok(Math.abs(sum.perDay.at(-1)!.usd - 1.25) < 1e-9);

  await saveSetting("monthlyBudgetUsd", "1");
  fetchCalls.length = 0;
  await assert.rejects(
    callStructured({ kind: "ideas", model: "claude-opus-5-5", system: "s", user: "u", schema: z.object({ a: z.string() }) }),
    (e: unknown) => e instanceof ClaudeError && /Limite do mês atingido/.test(e.message) && /Configurações/.test(e.message),
  );
  assert.equal(fetchCalls.length, 0, "não chamou a Anthropic");
  await saveSetting("monthlyBudgetUsd", "0");
});

test("coleta automática: respeita as horas configuradas", async () => {
  const { prisma } = await import("../src/lib/db");
  const { saveSetting } = await import("../src/lib/settings");
  const { isCollectionDue } = await import("../src/lib/collect");
  await prisma.channel.create({ data: { externalId: "UCx", title: "Canal X" } });
  await prisma.collectionRun.create({ data: { kind: "videos", trigger: "auto", status: "ok", startedAt: new Date(Date.now() - 10 * 3_600_000) } });
  assert.equal(await isCollectionDue(), false); // 10h < 20h
  await saveSetting("autoCollectHours", "6");
  assert.equal(await isCollectionDue(), true); // 10h > 6h
});

test("cópia de segurança: gera um banco íntegro e guarda só as 10 mais novas", async () => {
  const { makeBackup, listBackups, backupIfDue } = await import("../src/lib/backup");
  const old = Date.now() / 1000 - 30 * 86400;
  for (let i = 0; i < 11; i++) {
    const f = path.join(BACKUPS, `radar-2026-01-${String(i + 1).padStart(2, "0")}_00-00-00.db`);
    writeFileSync(f, "x");
    utimesSync(f, old + i, old + i);
  }
  const b = await makeBackup();
  assert.ok(existsSync(b.path));
  assert.ok(b.bytes > 1000, "é um banco de verdade, não vazio");
  const list = listBackups();
  assert.equal(list.length, 10);
  assert.equal(list[0].name, b.name);
  assert.ok(!list.some((x) => x.name === "radar-2026-01-01_00-00-00.db"), "a mais velha saiu");
  assert.equal(await backupIfDue(), null, "a de agora é nova: não faz outra");

  // a cópia abre e tem os dados (lê com o próprio Prisma apontando para ela)
  const out = execSync(`node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:'file:${b.path.replace(/\\/g, "/")}'}}});p.quotaLog.count().then(n=>{console.log(n);return p.\\$disconnect()})"`, {
    encoding: "utf8",
  });
  assert.ok(Number(out.trim()) >= 4);
  rmSync(BACKUPS, { recursive: true, force: true });
});
