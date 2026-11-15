/**
 * Chamada ao Claude em streaming: limite alto, resposta cortada vira mensagem em português (não SyntaxError do JSON).
 * Anthropic simulada. Usa o banco descartável prisma/test-claude.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { z } from "zod";
import { withSse } from "./anthropic-sse";

process.env.DATABASE_URL = "file:./test-claude.db";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
for (const f of ["prisma/test-claude.db", "prisma/test-claude.db-journal"]) rmSync(f, { force: true });
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const Schema = z.object({ titulo: z.string(), cenas: z.array(z.object({ fala: z.string() })) });
const full = { titulo: "Quantos balões de festa levantam um cachorro de 30 kg?", cenas: Array.from({ length: 40 }, (_, i) => ({ fala: `Fala ${i + 1}: e aí eu enchi mais um balão.` })) };

let next: { text: string; stop: string } = { text: "", stop: "end_turn" };
const sent: { stream?: boolean; max_tokens?: number; output_config?: { format?: Record<string, unknown> } }[] = [];

before(() => {
  globalThis.fetch = withSse(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.anthropic.com") throw new Error(`fetch inesperado: ${url}`);
    sent.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        id: "msg_test",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: next.text }],
        stop_reason: next.stop,
        stop_sequence: null,
        usage: { input_tokens: 9_000, output_tokens: 31_990, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
});

test("resposta completa: vem por streaming, com limite alto, e o JSON é validado", async () => {
  const { callStructured } = await import("../src/lib/claude");
  next = { text: JSON.stringify(full), stop: "end_turn" };
  const r = await callStructured({ kind: "script", model: "claude-opus-5-5", system: "s", user: "u", schema: Schema, maxTokens: 32000 });
  assert.equal(r.data.titulo, full.titulo);
  assert.equal(r.data.cenas.length, 40);
  const req = sent.at(-1)!;
  assert.equal(req.stream, true);
  assert.equal(req.max_tokens, 32000);
  assert.ok(req.output_config?.format?.schema, "o schema vai no pedido");
  assert.equal(req.output_config?.format?.parse, undefined);
});

test("resposta cortada no limite: mensagem em português, não erro de parse; fica registrada", async () => {
  const { callStructured, ClaudeError } = await import("../src/lib/claude");
  const { prisma } = await import("../src/lib/db");
  next = { text: JSON.stringify(full).slice(0, 4591), stop: "max_tokens" };
  await assert.rejects(
    callStructured({ kind: "script", model: "claude-opus-5-5", system: "s", user: "u", schema: Schema, maxTokens: 32000 }),
    (e: unknown) => e instanceof ClaudeError && /grande demais e foi cortada/.test(e.message) && !/SyntaxError/.test(e.message),
  );
  const g = await prisma.generation.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  assert.ok(g.output.includes("max_tokens"));
  assert.ok((g.costUsd ?? 0) > 0, "o gasto da chamada cortada conta");
});

test("JSON fora do formato (sem corte): mensagem em português", async () => {
  const { callStructured, ClaudeError } = await import("../src/lib/claude");
  next = { text: JSON.stringify({ titulo: 3 }), stop: "end_turn" };
  await assert.rejects(
    callStructured({ kind: "script", model: "claude-opus-5-5", system: "s", user: "u", schema: Schema }),
    (e: unknown) => e instanceof ClaudeError && /formato esperado/.test(e.message),
  );
  assert.equal(sent.at(-1)!.max_tokens, 32000, "limite padrão");
});
