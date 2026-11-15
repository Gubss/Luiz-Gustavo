import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { prisma } from "./db";
import { cachedDollarBrl, getSettings } from "./settings";

/** Preço em US$ por 1 milhão de tokens (tabela da Anthropic, nov/2026). */
export const PRICING: Record<string, { input: number; output: number; label: string }> = {
  "claude-opus-5-5": { input: 4, output: 20, label: "Claude Opus 5.5" },
  "claude-sonnet-5-5": { input: 2, output: 10, label: "Claude Sonnet 5.5" },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, label: "Claude Haiku 5.5" },
  "claude-fable-5-2": { input: 8, output: 40, label: "Claude Fable 5.2" },
};

/** Câmbio só para exibir uma ideia em reais (ajustável em Configurações; antes, DOLAR_BRL no .env). */
export const usdToBrl = () => cachedDollarBrl() || Number(process.env.DOLAR_BRL) || 5.6;

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

/**
 * Faixa de custo pelo histórico real: a saída típica é a média das últimas chamadas que terminaram inteiras
 * (com raciocínio adaptativo, o raciocínio conta como saída e varia muito); o teto é o limite de saída da chamada.
 * Sem histórico, usa a saída típica informada.
 */
export function estimateFromHistory(
  model: string,
  inputText: string,
  history: number[],
  opts: { fallbackTypical: number; maxTokens: number },
): CostEstimate & { basedOn: number } {
  const recent = history.filter((n) => n > 0);
  const typical = recent.length ? Math.round(recent.reduce((a, n) => a + n, 0) / recent.length) : opts.fallbackTypical;
  const est = estimateCost(model, inputText, Math.min(typical, opts.maxTokens), opts.maxTokens);
  return { ...est, basedOn: recent.length };
}

/** Tokens de saída das últimas chamadas de um tipo que terminaram inteiras (as cortadas no limite não contam). */
export async function recentOutputTokens(kind: string, take = 3): Promise<number[]> {
  const rows = await prisma.generation.findMany({
    where: { kind, outputTokens: { gt: 0 }, NOT: { output: { contains: '"stop_reason":"max_tokens"' } } },
    orderBy: { createdAt: "desc" },
    take,
    select: { outputTokens: true },
  });
  return rows.map((r) => r.outputTokens ?? 0);
}

export class ClaudeError extends Error {}

let cached: { key: string; client: Anthropic } | null = null;

/** Começo do mês corrente em São Paulo (aproximado pelo UTC-3). */
function monthStart(now = new Date()): Date {
  const sp = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3));
}

async function client(): Promise<Anthropic> {
  const { anthropicApiKey, monthlyBudgetUsd } = await getSettings();
  if (!anthropicApiKey)
    throw new ClaudeError("Chave da Anthropic não configurada. Cole a chave em Configurações (menu da esquerda).");
  if (monthlyBudgetUsd > 0) {
    const { usd } = await claudeSpendThisMonth();
    if (usd >= monthlyBudgetUsd)
      throw new ClaudeError(
        `Limite do mês atingido: já foram US$ ${usd.toFixed(2).replace(".", ",")} de US$ ${monthlyBudgetUsd.toFixed(2).replace(".", ",")}. Aumente o limite em Configurações para continuar.`,
      );
  }
  if (cached?.key !== anthropicApiKey) cached = { key: anthropicApiKey, client: new Anthropic({ apiKey: anthropicApiKey }) };
  return cached.client;
}

/** Limite de saída padrão (raciocínio + JSON). Com streaming dá para ir alto; só paga o que usar. */
export const DEFAULT_MAX_TOKENS = 32000;
const fmtTokens = (n: number) => n.toLocaleString("pt-BR");

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
  // O formato vai sem o `parse` do SDK: assim o SDK não tenta ler um JSON cortado (e lançar SyntaxError)
  // antes de a gente ver o stop_reason. A leitura e a validação são feitas aqui embaixo.
  const { parse: parseOutput, ...format } = betaZodOutputFormat(opts.schema);
  let msg;
  try {
    // Streaming: sem ele o SDK recusa max_tokens alto (acima de ~21 mil) e o raciocínio adaptativo
    // pode gastar quase todo o limite antes do JSON.
    const stream = anthropic.beta.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium", format },
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
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("Chave da Anthropic inválida. Confira em Configurações.");
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
  const text = msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Só lê o JSON se a resposta veio inteira; resposta cortada ou recusada vira mensagem em português.
  let parsed: z.infer<S> | null = null;
  let parseError: unknown = null;
  if (msg.stop_reason !== "max_tokens" && msg.stop_reason !== "refusal" && text) {
    try {
      parsed = parseOutput(text) as z.infer<S>;
    } catch (e) {
      parseError = e;
    }
  }

  await prisma.generation.create({
    data: {
      kind: opts.kind,
      model: servedBy,
      videoId: opts.videoId ?? null,
      input: JSON.stringify({ system: opts.system, user: opts.user, image: opts.image, effort: opts.effort ?? "medium" }),
      output: parsed != null ? JSON.stringify(parsed) : JSON.stringify({ stop_reason: msg.stop_reason, text }),
      inputTokens,
      outputTokens,
      costUsd: cost,
    },
  });

  if (msg.stop_reason === "refusal") throw new ClaudeError("O Claude recusou analisar esse conteúdo.");
  if (msg.stop_reason === "max_tokens")
    throw new ClaudeError(`A resposta ficou grande demais e foi cortada (limite de ${fmtTokens(opts.maxTokens ?? DEFAULT_MAX_TOKENS)} tokens). Tente de novo.`);
  if (parsed == null)
    throw new ClaudeError(
      `O Claude não devolveu a resposta no formato esperado. Tente de novo.${parseError instanceof Error ? ` (${parseError.message.slice(0, 200)})` : ""}`,
    );

  return { data: parsed, model: servedBy, inputTokens, outputTokens, costUsd: cost };
}

/** Gasto com o Claude no mês corrente (fuso de São Paulo, aproximado pelo UTC-3). */
export async function claudeSpendThisMonth(): Promise<{ usd: number; calls: number }> {
  const start = monthStart();
  const agg = await prisma.generation.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costUsd: true },
    _count: true,
  });
  return { usd: agg._sum.costUsd ?? 0, calls: agg._count };
}

/** Nome amigável de cada tipo de chamada ao Claude. */
export const GENERATION_KIND_LABEL: Record<string, string> = {
  diagnosis: "Diagnóstico de vídeo estudado",
  comments: "Resumo dos comentários",
  playbook: "Cartilha do nicho",
  ideas: "Ideias do gerador",
  script: "Roteiros",
  "script-critic": "Roteiros: leitura de espectador",
  "script-fix": "Roteiros: reescrita depois da leitura",
  "script-recheck": "Roteiros: leitura final depois da reescrita",
  "profile-from-channel": "Perfil a partir do meu canal",
  "my-video-diagnosis": "Diagnóstico de vídeo meu",
  "my-channel-report": "Diagnóstico do meu canal",
};

/** Gasto com o Claude: mês corrente por tipo e por modelo, gasto por dia (últimos 30 dias) e mês passado. */
export async function claudeSpendSummary(now = new Date()) {
  const start = monthStart(now);
  const prevStart = monthStart(new Date(start.getTime() - 86_400_000));
  const since30 = new Date(now.getTime() - 29 * 86_400_000);
  const [byKind, byModel, prev, recent, last30] = await Promise.all([
    prisma.generation.groupBy({ by: ["kind"], where: { createdAt: { gte: start } }, _sum: { costUsd: true }, _count: true }),
    prisma.generation.groupBy({ by: ["model"], where: { createdAt: { gte: start } }, _sum: { costUsd: true }, _count: true }),
    prisma.generation.aggregate({ where: { createdAt: { gte: prevStart, lt: start } }, _sum: { costUsd: true }, _count: true }),
    prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, kind: true, model: true, costUsd: true, createdAt: true, videoId: true, inputTokens: true, outputTokens: true },
    }),
    prisma.generation.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true, costUsd: true } }),
  ]);
  const dayKey = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const perDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) perDay.set(dayKey(new Date(now.getTime() - i * 86_400_000)), 0);
  for (const g of last30) {
    const k = dayKey(g.createdAt);
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + (g.costUsd ?? 0));
  }
  const usd = byKind.reduce((a, r) => a + (r._sum.costUsd ?? 0), 0);
  const calls = byKind.reduce((a, r) => a + r._count, 0);
  // projeção simples: ritmo do mês até agora × dias do mês
  const sp = new Date(now.getTime() - 3 * 3600_000);
  const daysInMonth = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / 86_400_000);
  return {
    usd,
    calls,
    projectedUsd: (usd / elapsedDays) * daysInMonth,
    prevMonthUsd: prev._sum.costUsd ?? 0,
    prevMonthCalls: prev._count,
    byKind: byKind
      .map((r) => ({ kind: r.kind, label: GENERATION_KIND_LABEL[r.kind] ?? r.kind, usd: r._sum.costUsd ?? 0, calls: r._count }))
      .sort((a, b) => b.usd - a.usd),
    byModel: byModel.map((r) => ({ model: r.model, label: modelLabel(r.model), usd: r._sum.costUsd ?? 0, calls: r._count })).sort((a, b) => b.usd - a.usd),
    perDay: [...perDay].map(([day, usd]) => ({ day, usd })),
    recent,
  };
}

/**
 * Confere uma chave da Anthropic sem gastar nada: pede os dados do modelo (chamada gratuita, não gera texto).
 */
export async function testAnthropicKey(key: string, model: string): Promise<string> {
  const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
  try {
    const info = await c.models.retrieve(model);
    return `Chave funcionando. Modelo ${info.display_name ?? modelLabel(model)} disponível.`;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("Chave inválida: a Anthropic não reconheceu essa chave.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new ClaudeError("A chave existe, mas não tem permissão para esse modelo.");
    if (e instanceof Anthropic.NotFoundError) throw new ClaudeError(`A chave funciona, mas o modelo ${model} não foi encontrado.`);
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError("Sem conexão com a Anthropic. Confira a internet.");
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Erro da Anthropic (${e.status}): ${e.message}`);
    throw e;
  }
}
