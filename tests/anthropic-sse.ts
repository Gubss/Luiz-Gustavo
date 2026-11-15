/**
 * As chamadas ao Claude são em streaming (SSE). Os testes simulam a Anthropic devolvendo a mensagem inteira em JSON;
 * este embrulho transforma essa resposta em eventos SSE quando o pedido é de streaming.
 */
type Msg = {
  id: string;
  model: string;
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: Record<string, number>;
};

export function sseFromMessage(m: Msg): Response {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const parts = [
    ev("message_start", {
      message: { ...m, type: "message", role: "assistant", content: [], stop_reason: null, stop_sequence: null, usage: { ...m.usage, output_tokens: 0 } },
    }),
  ];
  m.content.forEach((b, index) => {
    if (b.type !== "text") return;
    parts.push(ev("content_block_start", { index, content_block: { type: "text", text: "" } }));
    parts.push(ev("content_block_delta", { index, delta: { type: "text_delta", text: b.text ?? "" } }));
    parts.push(ev("content_block_stop", { index }));
  });
  parts.push(ev("message_delta", { delta: { stop_reason: m.stop_reason, stop_sequence: m.stop_sequence }, usage: { output_tokens: m.usage.output_tokens ?? 0 } }));
  parts.push(ev("message_stop", {}));
  return new Response(parts.join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Embrulha o fetch simulado: resposta JSON de mensagem da Anthropic vira SSE se o pedido pediu stream. */
export function withSse(fn: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fn(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.anthropic.com" || !res.ok) return res;
    let body: { stream?: boolean } = {};
    try {
      body = JSON.parse(String(init?.body));
    } catch {
      return res;
    }
    if (!body.stream) return res;
    return sseFromMessage((await res.json()) as Msg);
  }) as typeof fetch;
}
