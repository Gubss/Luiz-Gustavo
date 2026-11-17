import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "radar-delete-"));
process.env.DATABASE_URL = "file:" + join(temp, "test.db").replaceAll("\\", "/");
process.env.RADAR_BACKUP_DIR = join(temp, "backups");
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe", windowsHide: true });

test("idea deletion and cleanup use real foreign keys and preserve protected projects", async () => {
  const { prisma } = await import("../src/lib/db");
  const { deleteIdeaSafely, IDEA_DELETE_BLOCKED } = await import("../src/lib/delete-idea");
  const { runCleanup, KEEP_IDEA_IDS } = await import("../src/lib/cleanup");
  try {
    const niche = await prisma.niche.create({ data: { name: "Test" } });
    async function fixture(status = "SCRIPT", approved = false, id?: string) {
      const idea = await prisma.idea.create({ data: { id, nicheId: niche.id, format: "short", theme: id ?? status, titles: "[]", status } });
      const data = { ideaId: idea.id, content: "{}", markdown: "test", category: "história", origin: "test", author: "test" };
      const a = await prisma.scriptVersion.create({ data: { ...data, number: 1 } });
      const b = await prisma.scriptVersion.create({ data: { ...data, number: 2, baseVersionId: a.id } });
      await prisma.idea.update({ where: { id: idea.id }, data: { currentVersionId: b.id, ...(approved ? { approvedVersionId: a.id, approvedAt: new Date() } : {}) } });
      await prisma.directionRun.create({ data: { versionId: a.id, sourceHash: "test", study: "{}", reference: "test" } });
      const generation = await prisma.generation.create({ data: { scriptVersionId: a.id, kind: "script", model: "test", input: "{}", output: "{}" } });
      return { idea, a, b, generation };
    }
    const plain = await prisma.idea.create({ data: { format: "short", theme: "Sem versões", titles: "[]" } });
    assert.deepEqual(await deleteIdeaSafely(plain.id), {});
    assert.equal(await prisma.idea.count({ where: { id: plain.id } }), 0);
    const draft = await fixture();
    assert.deepEqual(await deleteIdeaSafely(draft.idea.id), {});
    assert.equal(await prisma.idea.count({ where: { id: draft.idea.id } }), 0);
    assert.equal(await prisma.scriptVersion.count({ where: { ideaId: draft.idea.id } }), 0);
    assert.equal(await prisma.directionRun.count({ where: { versionId: draft.a.id } }), 0);
    assert.equal((await prisma.generation.findUniqueOrThrow({ where: { id: draft.generation.id } })).scriptVersionId, null);
    assert.deepEqual(await deleteIdeaSafely(draft.idea.id), {});
    const protectedRows = [];
    for (const [status, approved] of [["PRODUCED", false], ["PUBLISHED", false], ["SCRIPT", true], ["DISCARDED", true]] as const) {
      const row = await fixture(status, approved);
      assert.deepEqual(await deleteIdeaSafely(row.idea.id), { message: IDEA_DELETE_BLOCKED });
      assert.equal(await prisma.scriptVersion.count({ where: { ideaId: row.idea.id } }), 2);
      assert.equal(await prisma.directionRun.count({ where: { versionId: row.a.id } }), 1);
      protectedRows.push(row);
    }
    const clean = await fixture();
    const keep = await fixture("SCRIPT", false, KEEP_IDEA_IDS[0]);
    const otherNiche = await prisma.niche.create({ data: { name: "Other" } });
    const outside = await fixture();
    await prisma.idea.update({ where: { id: outside.idea.id }, data: { nicheId: otherNiche.id } });
    await prisma.nichePlaybook.create({ data: { nicheId: niche.id, model: "test", stats: "{}", content: "{}", diagnosisCount: 0 } });
    const result = await runCleanup(niche.id, { playbooks: true, ideaIds: [clean.idea.id, keep.idea.id, outside.idea.id, ...protectedRows.map(r => r.idea.id)] });
    assert.equal(result.ideas, 1);
    assert.equal(result.playbooks, 1);
    assert.equal(await prisma.nichePlaybook.count(), 0);
    assert.equal(result.kept.length, 5);
    assert.ok(existsSync(result.backup.path));
    assert.equal(await prisma.idea.count({ where: { id: { in: [keep.idea.id, outside.idea.id, ...protectedRows.map(r => r.idea.id)] } } }), 6);
    assert.equal(await prisma.scriptVersion.count({ where: { ideaId: clean.idea.id } }), 0);
    assert.equal((await prisma.generation.findUniqueOrThrow({ where: { id: clean.generation.id } })).scriptVersionId, null);
    // A foreign descendant must cause a full rollback, including direction deletion.
    const rollback = await fixture();
    await prisma.scriptVersion.update({ where: { id: outside.a.id }, data: { baseVersionId: rollback.a.id } });
    await assert.rejects(() => deleteIdeaSafely(rollback.idea.id));
    assert.equal(await prisma.directionRun.count({ where: { versionId: rollback.a.id } }), 1);
    assert.equal((await prisma.scriptVersion.findUniqueOrThrow({ where: { id: rollback.b.id } })).baseVersionId, rollback.a.id);
  } finally { await prisma.$disconnect(); }
});
