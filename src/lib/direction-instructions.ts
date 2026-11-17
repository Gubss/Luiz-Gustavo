export const INSTRUCTION_MAX = 30000;
export const INSTRUCTION_FIELDS = ["directionGeneral", "directionScene", "directionPhotography", "directionSound"] as const;
export type DirectionInstructions = Record<typeof INSTRUCTION_FIELDS[number], string | null>;
export function normalizeInstructions(input: Record<string, unknown>): DirectionInstructions {
 const values = INSTRUCTION_FIELDS.map(key => {
  const text = String(input[key] ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (text.length > INSTRUCTION_MAX) throw new Error(key + ": use até 30.000 caracteres, sem truncamento.");
  return [key, text || null];
 });
 return Object.fromEntries(values) as DirectionInstructions;
}
export function hasDirectionInstructions(input: DirectionInstructions | null | undefined) {
 return Boolean(input && INSTRUCTION_FIELDS.every(key => input[key]?.trim()));
}
export function instructionSnapshot(input: DirectionInstructions) {
 if (!hasDirectionInstructions(input)) throw new Error("Preencha a Geral de gravação e as três funções no formato antes de preparar a direção.");
 return JSON.stringify({version: 1, ...normalizeInstructions(input)});
}
export function instructionsFor(stage: "scene" | "photography" | "sound", snapshot: string) {
 let input;
 try { input = JSON.parse(snapshot); } catch { throw new Error("Direção antiga sem instruções por função. Retome para carregar as caixas do formato."); }
 if (input.version !== 1 || !hasDirectionInstructions(input)) throw new Error("Instruções de direção incompletas.");
 const key = {scene: "directionScene", photography: "directionPhotography", sound: "directionSound"} as const;
 return {geralDeGravacao: input.directionGeneral as string, funcao: input[key[stage]] as string};
}
