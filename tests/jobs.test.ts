/** Tarefas em segundo plano: o botão volta na hora e o resultado fica gravado. Banco prisma/test-jobs.db. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL = "file:./test-jobs.db";
for (const f of ["prisma/test-jobs.db", "prisma/test-jobs.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("startJob volta na hora, não duplica, grava ok/erro e expira tarefa travada", async () => {
  const { prisma } = await import("../src/lib/db");
  const { startJob, runningJob, jobsSummary, JobBusyError } = await import("../src/lib/jobs");
  const t0 = Date.now();
  const job = { kind: "diagnosis", targetId: "v1", label: "Diagnóstico: x", href: "/video/v1" };
  await startJob(job, async () => {
    await wait(300);
    return "Custo: US$ 0,10.";
  });
  assert.ok(Date.now() - t0 < 250, "não espera o trabalho");
  assert.ok(await runningJob("diagnosis", "v1"));
  await assert.rejects(startJob(job, async () => "x"), JobBusyError);

  await startJob({ ...job, kind: "comments" }, async () => {
    throw new Error("Sem crédito");
  });
  await wait(450);
  const rows = await prisma.job.findMany({ orderBy: { startedAt: "asc" } });
  assert.deepEqual(rows.map((r) => [r.kind, r.status, r.message]), [
    ["diagnosis", "ok", "Custo: US$ 0,10."],
    ["comments", "error", "Sem crédito"],
  ]);

  await prisma.job.create({ data: { ...job, targetId: "v2", startedAt: new Date(Date.now() - 20 * 60_000) } });
  assert.equal(await runningJob("diagnosis", "v2"), null);
  assert.equal((await jobsSummary()).filter((j) => j.status === "running").length, 0);
});

test("legenda com acento codificado duas vezes", async () => {
  const { decodeEntities } = await import("../src/lib/transcript");
  assert.equal(decodeEntities("C&amp;#39;est un égout"), "C'est un égout");
  assert.equal(decodeEntities("s&#39;appelle &amp; fin"), "s'appelle & fin");
});

test("palavras-chave de um link: tags repetidas e pares de palavras dos títulos, sem o nome do canal", async () => {
  const { keywordsFromVideos } = await import("../src/lib/discover");
  const kw = keywordsFromVideos(
    [
      { title: "Mitos sobre dinossauros que você acredita", tags: ["dinossauros", "curiosidades", "Canal Dino"] },
      { title: "O T-Rex não rugia? Mitos sobre dinossauros", tags: ["dinossauros", "t-rex"] },
      { title: "Dinossauros: mitos e verdades", tags: ["curiosidades"] },
    ],
    "Canal Dino",
    3,
  );
  assert.equal(kw.length, 3);
  assert.ok(kw.includes("dinossauros"), kw.join(","));
  assert.ok(!kw.some((k) => k.includes("canal dino")), kw.join(","));
});
