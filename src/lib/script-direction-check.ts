/** Conferência determinística, recalculada ao exibir cada versão. */
export function directionWarnings(lines: { text: string }[], durationSec: number): string[] {
  const warnings: string[] = [];
  const last = (lines.at(-1)?.text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(comenta\w*|comentem|inscrev\w*|inscri\w*|segue o canal|sigam o canal|tchau|adeus|ate (a proxima|mais|logo|o proximo)|nos vemos|valeu pessoal)\b/.test(last))
    warnings.push("Fim proibido: a última fala contém chamada ou despedida. Faça o fim voltar ao começo.");
  if (durationSec > 100) warnings.push("Duração estimada acima de 1min40 (" + Math.round(durationSec) + "s). O alvo é até 1min30.");
  return warnings;
}
