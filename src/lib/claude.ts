import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { prisma } from "./db";
import { getSettings } from "./settings";

/** Preço em US$ por 1 milhão de tokens (tabela da Anthropic, nov/2026). */
export const PRICING: Record<string, { input: number; output: number; label: string }> = {
  "claude-opus-5-5": { input: 4, output: 20, label: "Claude Opus 5.5" },
  "claude-sonnet-5-5": { input: 2, output: 10, label: "Claude Sonnet 5.5" },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, label: "Claude Haiku 5.5" },
  "claude-fable-5-2": { input: 8, output: 40, label: "Claude Fable 5.2" },
};

/** Câmbio só para exibir uma ideia em reais (ajuste em DOLAR_BRL no .env se quiser). */
export const usdToBrl = () => Number(process.env.DOLAR_BRL) || 5.6;

export const modelLabel = (m: string | null | undefined) => (m ? (PRICING[m]?.label ?? m) : "—");

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/**
 * Estimativa grosseira de tokens a partir do texto (≈ 3,6 caracteres por token em português/inglês).
 * Serve para mostrar o custo ANTES de rodar; o custo real vem da resposta da API.
 */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.6);

export type CostEstimate = { model: string; inputTokens: number; outputTokens: number; usd: number; usdMax: number };

/** Faixa de custo: saída típica e saída no pior caso (o raciocínio do Claude conta como saída). */
export function estimateCost(model: string, inputText: string, outputTypical: number, outputMax: number): CostEstimate {
  const inputTokens = estimateTokens(inputText);
  return {
    model,
    inputTokens,
    outputTokens: outputTypical,
    usd: costUsd(model, inputTokens, outputTypical),
    usdMax: costUsd(model, inputTokens, outputMax),
  };
}

export class ClaudeError extends Error {}

let cached: { key: string; client: Anthropic } | null = null;

async function client(): Promise<Anthropic> {
  const { anthropicApiKey } = await getSettings();
  if (!anthropicApiKey)
    throw new ClaudeError("Chave da Anthropic não configurada. Coloque ANTHROPIC_API_KEY no arquivo .env e reinicie o app.");
  if (cached?.key !== anthropicApiKey) cached = { key: anthropicApiKey, client: new Anthropic({ apiKey: anthropicApiKey }) };
  return cached.client;
}

export type StructuredResult<T> = {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * Uma chamada ao Claude com resposta em JSON validado pelo schema (structured outputs).
 * - Raciocínio adaptativo (sempre ligado nos modelos atuais); a profundidade vem de `effort`.
 * - Se o modelo recusar por política de segurança, a API refaz com um modelo de reserva ("fallbacks").
 * - Cada chamada fica registrada em Generation com tokens e custo.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  kind: string;
  model: string;
  effort?: "low" | "medium" | "high";
  system: string;
  user: string;
  /** URL de imagem anexada antes do texto (ex.: thumbnail). */
  image?: string;
  schema: S;
  videoId?: string;
  maxTokens?: number;
}): Promise<StructuredResult<z.infer<S>>> {
  const anthropic = await client();
  let msg;
  try {
    msg = await anthropic.beta.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [
        {
          role: "user",
          content: [
            ...(opts.image ? [{ type: "image" as const, source: { type: "url" as const, url: opts.image } }] : []),
            { type: "text" as const, text: opts.user },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("Chave da Anthropic inválida. Confira ANTHROPIC_API_KEY no .env.");
    if (e instanceof Anthropic.PermissionDeniedError)
      throw new ClaudeError("A chave da Anthropic não tem permissão para esse modelo (ou falta crédito na conta).");
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError("Limite de uso da Anthropic atingido. Espere um minuto e tente de novo.");
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(e.message)) throw new ClaudeError("Sem crédito na conta da Anthropic (console.anthropic.com → Billing).");
      throw new ClaudeError(`A Anthropic recusou o pedido: ${e.message}`);
    }
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError("Sem conexão com a Anthropic. Confira a internet.");
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Erro da Anthropic (${e.status}): ${e.message}`);
    throw e;
  }

  const inputTokens =
    (msg.usage.input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0);
  const outputTokens = msg.usage.output_tokens ?? 0;
  const servedBy = msg.model || opts.model;
  const cost = costUsd(servedBy, inputTokens, outputTokens);

  await prisma.generation.create({
    data: {
      kind: opts.kind,
      model: servedBy,
      videoId: opts.videoId ?? null,
      input: JSON.stringify({ system: opts.system, user: opts.user, image: opts.image, effort: opts.effort ?? "medium" }),
      output: JSON.stringify(msg.parsed_output ?? msg.content),
      inputTokens,
      outputTokens,
      costUsd: cost,
    },
  });

  if (msg.stop_reason === "refusal") throw new ClaudeError("O Claude recusou analisar esse conteúdo.");
  if (msg.stop_reason === "max_tokens") throw new ClaudeError("A resposta ficou grande demais e foi cortada. Tente de novo.");
  if (msg.parsed_output == null) throw new ClaudeError("O Claude não devolveu a resposta no formato esperado. Tente de novo.");

  return { data: msg.parsed_output as z.infer<S>, model: servedBy, inputTokens, outputTokens, costUsd: cost };
}

/** Gasto com o Claude no mês corrente (fuso de São Paulo, aproximado pelo UTC-3). */
export async function claudeSpendThisMonth(): Promise<{ usd: number; calls: number }> {
  const now = new Date(Date.now() - 3 * 3600_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3));
  const agg = await prisma.generation.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costUsd: true },
    _count: true,
  });
  return { usd: agg._sum.costUsd ?? 0, calls: agg._count };
}
