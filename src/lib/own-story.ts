/**
 * Roteiro a partir da história do Gubs (a), ideias dele (b): tudo aqui é função pura, sem banco e sem IA.
 * O texto dele vira dados (título, lista "Preservar", falas marcadas, falas de referência) e blocos de prompt.
 */
import { z } from "zod";

/** Regras gerais de todo roteiro, valem para a história e para a ideia do Gubs (Gubs, 17/11/2026). */
export const GENERAL_RULES = [
  "Abertura com a ação já acontecendo: a primeira fala ou imagem já está no meio do problema, sem apresentação nem \"oi, pessoal\".",
  "2 a 3 ganchos abertos (perguntas que o espectador quer ver respondidas) plantados cedo e pagos perto de 1 min, para prender até o fim.",
  "Final em loop: a última fala ou imagem conversa com a primeira, para o vídeo recomeçar naturalmente.",
] as const;

export const generalRulesBlock = () => ["# REGRAS GERAIS DO CANAL (valem para todo roteiro)", ...GENERAL_RULES.map((r) => `- ${r}`)].join("\n");

export type StoryLine = { who: string; text: string };
export type OwnStory = {
  title: string;
  text: string;
  /** Itens da lista "Preservar" (sem negrito nem aspas). */
  preservar: string[];
  /** Falas em negrito com aspas no texto, que precisam sair palavra por palavra. */
  falasMarcadas: string[];
  /** Falas de referência (blocos "**Personagem:**" seguidos de "> fala"). */
  falas: StoryLine[];
  /** true = só cortar e reordenar falas; false = pode reescrever, menos o Preservar. */
  manterFalas: boolean;
};

export const STORY_MAX = 20000;
const QUOTED = /\*\*[“"]([^”"]+)[”"]\*\*/g;
const clean = (s: string) => s.replace(/\*\*/g, "").replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();

export function storyTitle(md: string): string {
  const h = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  return clean(h.replace(/^(epis[óo]dio|ep\.?)\s*\d+\s*[—–:-]\s*/i, "")) || "Minha história";
}

/** Lê o .md de "referência criativa" do Gubs. Aceita texto sem nenhuma marcação: aí só o texto inteiro vai para o prompt. */
export function parseStory(md: string, manterFalas: boolean): OwnStory {
  const text = md.replace(/\r\n/g, "\n").trim();
  const preservarLine = text.match(/^\s*[-*]\s*\*\*Preservar:?\*\*:?\s*(.+)$/im)?.[1] ?? "";
  const preservar = preservarLine
    .split(/;\s*/)
    .map((s) => clean(s).replace(/[.;]+$/, ""))
    .filter(Boolean);
  const falasMarcadas = Array.from(new Set(Array.from(text.matchAll(QUOTED), (m) => m[1].trim().replace(/[.!?…]+$/, "")))).filter((f) => f.length >= 6);
  const falas: StoryLine[] = [];
  let who = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const label = line.match(/^\*\*([^*]+?):\*\*\s*(.*)$/);
    if (label) {
      who = label[1].trim();
      // Fala na mesma linha só se vier entre aspas; "**Tipo:** …", "**Proposta:** …" são metadados, não falas.
      if (/^[“"]/.test(label[2])) falas.push({ who, text: clean(label[2]) });
      continue;
    }
    if (line.startsWith(">") && who) {
      const t = clean(line.replace(/^>\s*/, ""));
      if (t) falas.push({ who, text: t });
      continue;
    }
    if (line.startsWith("#")) who = "";
  }
  return { title: storyTitle(text), text: text.slice(0, STORY_MAX), preservar, falasMarcadas, falas, manterFalas };
}

const MODE_KEEP =
  "MODO MANTER AS FALAS: as falas de referência ficam como estão, palavra por palavra. Você só pode CORTAR e REORDENAR falas. Se a abertura ou um gancho precisar de ligação, no máximo 2 falas curtas novas, e cada uma vai em mudancas.falasNovas.";
const MODE_REWRITE =
  "MODO PODE REESCREVER: você pode reescrever falas para o ritmo do canal, MENOS as falas marcadas e os itens do Preservar, que ficam literais. Cada fala reescrita vai em mudancas.falasReescritas (antes e depois).";

/** Bloco do pedido (mensagem do usuário) para escrever o roteiro a partir da história do Gubs. */
export function storyBlock(s: OwnStory): string {
  return [
    "",
    "# HISTÓRIA DO GUBS (escrita por ele; é a base deste roteiro, não uma inspiração)",
    s.text,
    "",
    "# O QUE PRESERVAR (obrigatório; nada disto pode sumir do roteiro)",
    ...(s.preservar.length ? s.preservar.map((p) => `- ${p}`) : ["- (sem lista Preservar: preserve a história, os personagens e o desfecho)"]),
    ...(s.falasMarcadas.length ? ["Falas marcadas, que saem palavra por palavra:", ...s.falasMarcadas.map((f) => `- “${f}”`)] : []),
    "",
    "# COMO ESCREVER A PARTIR DA HISTÓRIA",
    "A história, a ordem dos acontecimentos que importam, os personagens e o desfecho são do Gubs. Você ajusta só o necessário para as regras gerais abaixo: abertura, ganchos e final.",
    s.manterFalas ? MODE_KEEP : MODE_REWRITE,
    "As notas de produção do texto (tom, limites, o que não fazer) valem como regra.",
    "",
    generalRulesBlock(),
  ].join("\n");
}

/** Vai no system junto do pedido de roteiro quando a ideia é uma história do Gubs. */
export const STORY_TASK = `HISTÓRIA DO GUBS: o pedido traz uma história escrita pelo Gubs. Escreva o roteiro falado DESSA história, sem trocar o enredo.
Preencha "mudancas" em português simples, para o Gubs ver o que mudou da história dele: abertura nova, ganchos (onde planta e onde paga), cortes, reordenações, falas reescritas ou novas, e como o final volta ao começo.
Preencha "preservados" com cada item do Preservar e cada fala marcada, dizendo em que fala do roteiro ele aparece.`;

export const StoryChangesSchema = z.object({
  abertura: z.string().describe("Como o vídeo abre agora e por quê, em 1-2 frases simples."),
  ganchos: z.array(z.object({ pergunta: z.string(), plantadoEm: z.string(), pagoEm: z.string() })).describe("2 a 3 ganchos abertos."),
  cortes: z.array(z.string()).describe("O que da história saiu do roteiro. Vazio se nada."),
  reordenado: z.array(z.string()).describe("O que mudou de lugar. Vazio se nada."),
  falasReescritas: z.array(z.object({ antes: z.string(), depois: z.string() })).describe("Só no modo pode reescrever."),
  falasNovas: z.array(z.string()).describe("Falas que não estavam na história."),
  final: z.string().describe("Como o final conversa com o começo (loop)."),
});
export type StoryChanges = z.infer<typeof StoryChangesSchema>;
export const StorySpokenExtra = {
  mudancas: StoryChangesSchema,
  preservados: z.array(z.object({ item: z.string(), onde: z.string().describe("A fala do roteiro em que aparece. Vazio se não entrou.") })),
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export type StoryComparison = {
  /** Falas marcadas: saíram palavra por palavra? (conferido em código) */
  marcadas: { fala: string; ok: boolean }[];
  /** Falas da história que ficaram iguais no roteiro. */
  iguais: number;
  /** Falas da história que não aparecem iguais (cortadas ou reescritas). */
  fora: StoryLine[];
  total: number;
};

/** Conferência sem IA: compara as falas do roteiro com as da história. */
export function compareStory(s: Pick<OwnStory, "falas" | "falasMarcadas">, falado: { fala: string }[]): StoryComparison {
  const all = " " + falado.map((f) => norm(f.fala)).join(" | ") + " ";
  const has = (t: string) => {
    const n = norm(t);
    return n.length > 0 && all.includes(n);
  };
  const fora = s.falas.filter((f) => !has(f.text));
  return { marcadas: s.falasMarcadas.map((fala) => ({ fala, ok: has(fala) })), iguais: s.falas.length - fora.length, fora, total: s.falas.length };
}

// ---------- (b) Minha ideia ----------

export type OwnIdea = { tema: string; premissa: string };
export const IDEAS_MAX = 30;

/**
 * Várias ideias de uma vez. Com seções "## 1. Título" (como o banco de ideias), cada seção vira uma ideia;
 * sem elas, cada linha não vazia vira uma ideia.
 */
export function parseOwnIdeas(text: string): OwnIdea[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const sections = t.split(/^##\s+(?=\d+[.)]\s)/m).slice(1);
  if (sections.length) {
    return sections.slice(0, IDEAS_MAX).map((sec) => {
      const [head, ...body] = sec.split("\n");
      const tema = clean(head.replace(/^\d+[.)]\s*/, ""));
      const premissa = body.join("\n").split(/^(?:---|##\s)/m)[0].trim();
      return { tema, premissa: premissa ? premissa.slice(0, 3000) : tema };
    });
  }
  return t
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 3)
    .slice(0, IDEAS_MAX)
    .map((l) => ({ tema: l.length > 90 ? l.slice(0, 87).trimEnd() + "…" : l, premissa: l }));
}

/** Vai no pedido do roteiro quando a ideia foi escrita pelo Gubs. */
export function ownIdeaBlock(): string {
  return [
    "",
    "# IDEIA DO GUBS (a premissa acima é o texto dele, literal: é obrigatória)",
    "Não troque a situação, os personagens nem as falas que ele citou entre aspas. Os \"cuidados\" do texto valem como regra.",
    "",
    generalRulesBlock(),
  ].join("\n");
}
