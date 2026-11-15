/**
 * Conferência de lógica e graça do roteiro, em código (grátis, sem IA).
 *
 * - Aula disfarçada: frases que dão nome a uma peça ou conceito ("Esse é o empuxo.", "Essa é a válvula.").
 *   "Explicada" = o nome vem junto de uma comparação/explicação ("igual rolha no balde", "um gás mais leve que o ar").
 *   No máximo 1 termo explicado por vídeo. Nomes sem explicação seguem o limite dos roteiros aprovados do formato
 *   (o vulcão aprovado nomeia 4 peças que o menino construiu); sem roteiro aprovado, o limite é 1.
 * - Bordão: frase curta (1 a 4 palavras) repetida. Limite 2, ou o que os roteiros aprovados do formato repetem
 *   ("Chinelada." 4 vezes no vulcão aprovado).
 * - Fecho que explica a piada: "Parabéns: você construiu…", "Moral da história…" perto do fim sem virada ("Mas…") depois.
 * - Conta e número: frases com medida ("dez gramas", "trinta quilos") ou milhar ("três mil balões"). Regra do Gubs (15/11):
 *   é um desenho contando uma historinha; tema absurdo = sem conta e sem número. Limite 1, ou o dos roteiros aprovados.
 */

export type Fala = { text: string; who?: string };

export type ScriptTextCheck = {
  /** Frases que dão nome a algo, com a cena (1 = primeira fala com texto). */
  namings: { scene: number; sentence: string; explained: boolean }[];
  explained: number;
  namingLimit: number;
  catchphrases: { phrase: string; times: number }[];
  catchphraseLimit: number;
  /** Frase do fim que explica a piada (null se não há). */
  explainingEnd: { scene: number; sentence: string } | null;
  /** Frases com conta ou medida. */
  measures: { scene: number; sentence: string }[];
  measureLimit: number;
  problems: string[];
  ok: boolean;
};

/** Minúsculas, sem acento e sem pontuação. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));

const NAMING = [
  /^(esse|essa|este|esta|isso|isto|aquilo|aquele|aquela) (e|eh) (o|a|os|as|um|uma|chamad[oa])\b/,
  /^(isso|isto|esse|essa) (se )?chama\b/,
  /^o nome disso\b/,
  /^chama se\b/,
];
const EXPLAIN = /\b(igual|tipo|que nem|como um|como uma|ou seja|quer dizer|significa|mais leve que|mais pesad[oa] que|serve pra|serve para|que abraca|que segura)\b/;
const EXPLAIN_END = /^(parabens|moral|ou seja|resumindo|no fim das contas|a licao|viu so|e foi assim que|conclusao)\b/;

const NUM = "(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent[oa]s|trezent[oa]s|quinhent[oa]s|meio|meia)";
const UNIT = "(gramas?|g|quilos?|quilogramas?|kg|toneladas?|metros?|m|km|centimetros?|cm|litros?|ml|graus|newtons?|por cento)";
// Texto já normalizado (sem acento nem pontuação): "dez gramas", "trinta quilos", "tres mil baloes".
const MEASURE = new RegExp(`\\b${NUM}( e ${NUM})? (${UNIT}|mil)\\b`);

export const isMeasure = (sentence: string) => MEASURE.test(norm(sentence)) || /\d\s*%/.test(sentence);
export const measureCount = (text: string) => sentences(text).filter(isMeasure).length;

export const isNaming = (sentence: string) => NAMING.some((re) => re.test(norm(sentence)));

/** Quantas frases dão nome a algo, no máximo por roteiro (para medir os roteiros aprovados). */
export function namingCount(text: string) {
  return sentences(text).filter(isNaming).length;
}

/** Frases curtas repetidas (1 a 4 palavras), da mais repetida para a menos. */
export function shortRepeats(texts: string[]) {
  const count = new Map<string, { phrase: string; times: number }>();
  for (const t of texts)
    for (const s of sentences(t)) {
      const n = norm(s);
      const words = n.split(" ").filter(Boolean).length;
      if (!n || words > 4) continue;
      const cur = count.get(n) ?? { phrase: s.replace(/[.!?…]+$/, ""), times: 0 };
      cur.times++;
      count.set(n, cur);
    }
  return [...count.values()].filter((x) => x.times > 1).sort((a, b) => b.times - a.times);
}

/** Limites tirados dos roteiros aprovados do formato: nunca abaixo do padrão (1 nome, bordão 2 vezes). */
export function limitsFromApproved(approved: string[]) {
  const namingLimit = Math.max(1, ...approved.map(namingCount));
  const catchphraseLimit = Math.max(2, ...approved.map((a) => shortRepeats([a])[0]?.times ?? 0));
  const measureLimit = Math.max(1, ...approved.map(measureCount));
  return { namingLimit, catchphraseLimit, measureLimit };
}

export function checkScriptText(
  falas: Fala[],
  limits: { namingLimit?: number; catchphraseLimit?: number; measureLimit?: number } = {},
): ScriptTextCheck {
  const namingLimit = limits.namingLimit ?? 1;
  const catchphraseLimit = limits.catchphraseLimit ?? 2;
  const measureLimit = limits.measureLimit ?? 1;
  const lines = falas.map((f) => f.text).filter((t) => t.trim());

  const namings: ScriptTextCheck["namings"] = [];
  lines.forEach((line, i) => {
    for (const s of sentences(line)) {
      if (!isNaming(s)) continue;
      // Explicada: a comparação está na mesma fala ou na fala anterior.
      const explained = EXPLAIN.test(norm(line)) || (i > 0 && EXPLAIN.test(norm(lines[i - 1])));
      namings.push({ scene: i + 1, sentence: s, explained });
    }
  });
  const explained = namings.filter((n) => n.explained).length;
  const measures = lines.flatMap((line, i) => sentences(line).filter(isMeasure).map((sentence) => ({ scene: i + 1, sentence })));

  const catchphrases = shortRepeats(lines).filter((x) => x.times > catchphraseLimit);

  // Fecho: frase que explica a piada no último quarto, sem "Mas…" (virada) depois dela.
  let explainingEnd: ScriptTextCheck["explainingEnd"] = null;
  const all = lines.flatMap((line, i) => sentences(line).map((s) => ({ scene: i + 1, s })));
  const fromIdx = Math.floor(all.length * 0.75);
  for (let k = all.length - 1; k >= fromIdx; k--) {
    if (!EXPLAIN_END.test(norm(all[k].s))) continue;
    const twistAfter = all.slice(k + 1).some((x) => /^mas\b/.test(norm(x.s)));
    if (!twistAfter) explainingEnd = { scene: all[k].scene, sentence: all[k].s };
    break;
  }

  const problems: string[] = [];
  if (explained > 1)
    problems.push(
      `Aula disfarçada: ${explained} termos explicados (máximo 1, dentro de uma piada): ${namings
        .filter((n) => n.explained)
        .map((n) => `"${n.sentence}" (fala ${n.scene})`)
        .join(", ")}.`,
    );
  if (namings.length > namingLimit)
    problems.push(
      `Nomes demais: ${namings.length} frases do tipo "Esse é o…" (limite ${namingLimit}${namingLimit > 1 ? ", o mesmo dos roteiros aprovados do formato" : ""}): ${namings
        .map((n) => `"${n.sentence}"`)
        .join(", ")}.`,
    );
  if (measures.length > measureLimit)
    problems.push(
      `Conta e número: ${measures.length} frases com medida ou conta (máximo ${measureLimit}): ${measures
        .map((m) => `"${m.sentence}"`)
        .join(", ")}. É um desenho contando uma historinha: responda com uma cena, não com número.`,
    );
  for (const c of catchphrases) problems.push(`Bordão repetido: "${c.phrase}" ${c.times} vezes (máximo ${catchphraseLimit}).`);
  if (explainingEnd) problems.push(`O fecho explica a piada: "${explainingEnd.sentence}" (fala ${explainingEnd.scene}). Termine numa virada ou numa imagem, sem explicar.`);

  return { namings, explained, namingLimit, catchphrases, catchphraseLimit, explainingEnd, measures, measureLimit, problems, ok: problems.length === 0 };
}
