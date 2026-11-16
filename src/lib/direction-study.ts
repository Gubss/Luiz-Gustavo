import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const NO_DIRECTION = "sem estudo de direção: o roteiro sai sem plano de cenas";
export const STUDY_MAX = 12000;
export const REQUEST_DIR = "C:/Users/gubsB/Documents/GUBS OS/GUBS OS/.maestri/tmp/radar-pedidos-estudo";

export function normalizeStudy(text: string) {
  const value = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!value || value.length > STUDY_MAX) throw new Error(`Cole um estudo de direção de até ${STUDY_MAX} caracteres.`);
  return value;
}

/** Extração literal da nota aprovada, sem chamada de IA. */
export function extractDmStudy(note: string) {
  const rules = note.split(/\r?\n/).filter(line => /^\d+\. /.test(line));
  if (rules.length !== 14) throw new Error("A nota deve conter as 14 regras de direção.");
  const channel = note.match(/## Para o Por Que É Assim\?[^\n]*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
  if (!channel) throw new Error("Seção Para o Por Que É Assim? ausente.");
  return normalizeStudy(["# Estudo de direção — Desmontando o Mundo", ...rules.map(line => line.replace(/\*\*/g, "").replace(/ 4 de 4\.$/, "")), "", "## Para o Por Que É Assim?", channel].join("\n"));
}

export const ScenePlanSchema = z.array(z.object({
  falaInicial: z.number().int().min(1),
  falaFinal: z.number().int().min(1),
  tela: z.string().min(1),
  camera: z.string().min(1),
  efeito: z.string().min(1),
  etiqueta: z.string().min(1),
})).min(1);
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export function validateScenePlan(plan: ScenePlan, lines: number) {
  let next = 1;
  for (const scene of plan) {
    if (scene.falaInicial !== next || scene.falaFinal < next || scene.falaFinal > lines) throw new Error("Plano de cenas não cobre as falas em ordem.");
    next = scene.falaFinal + 1;
  }
  if (next !== lines + 1) throw new Error("Plano de cenas incompleto.");
}

export function directionPrompt(study?: string | null) {
  return study?.trim() ? `\n# Estudo de direção\n${study.trim()}\nDepois de escrever as falas, acrescente planoCenas cobrindo todas elas, em ordem, sem lacunas nem sobreposição (índices a partir de 1). Em cada cena: o que entra na tela, onde a câmera vai, efeito e etiqueta (diga nenhum quando não se aplicar). Aplique o estudo apenas à direção: preserve tom, tamanho e falas do canal, inclusive diante de métricas de voz do estudo. A adaptação Para o Por Que É Assim? vale somente para esse canal. Não altere a Referência do canal. Plano proposto, sujeito à aprovação humana.\n` : "";
}

export function sceneLine(scene: ScenePlan[number], index: number) {
  return `Cena ${index + 1} · falas ${scene.falaInicial}–${scene.falaFinal}: Tela: ${scene.tela} | Câmera: ${scene.camera} | Efeito: ${scene.efeito} | Etiqueta: ${scene.etiqueta}`;
}

export async function writeStudyRequest(format: { id: string; name: string }, raw: string, directory = REQUEST_DIR) {
  const links = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!links.length || links.length > 5) throw new Error("Informe de 1 a 5 links de vídeo, um por linha.");
  for (const link of links) {
    let url: URL;
    try { url = new URL(link); } catch { throw new Error("Link de vídeo inválido."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use links http ou https de vídeos.");
  }
  const date = new Date().toISOString();
  const name = format.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "formato";
  const filename = `${date.slice(0, 10)}-${name}-${randomUUID()}.md`;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), `# Pedido de estudo de direção\n\nFormato: ${format.name.replace(/[\r\n]/g, " ")}\nID: ${format.id}\nData: ${date}\nResponsável: GEPETO (fora do Radar, sem API)\n\n## Vídeos\n${links.map(link => "- " + link).join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return filename;
}
