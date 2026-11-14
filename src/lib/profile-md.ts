/**
 * Perfil do canal por arquivo .md: o app gera o pedido (docs/prompt-perfil-canal.md) com títulos fixos,
 * o GPT do Maestri responde no mesmo modelo e o app lê a resposta de volta.
 * Leitura tolerante: ignora acento/maiúscula nos títulos, aceita a resposta dentro de um bloco ``` e roteiros em ~~~ ou ```.
 */

export type ProfileFields = {
  name: string | null;
  url: string | null;
  format: "short" | "long" | null;
  platforms: string | null;
  durationSec: number | null;
  concept: string | null;
  characters: string | null;
  storyFormats: string | null;
  visualStyle: string | null;
  tone: string | null;
  audience: string | null;
  rules: string | null;
  notes: string | null;
  analytics: string | null;
};

export type ImportedScript = { title: string; url: string | null; views: number | null; notes: string | null; script: string };
export type ParsedProfile = { fields: ProfileFields; scripts: ImportedScript[]; warnings: string[] };

export const FIELD_LABELS: Record<keyof ProfileFields, string> = {
  name: "Nome",
  url: "URL",
  format: "Formato principal",
  platforms: "Plataformas",
  durationSec: "Duração alvo (segundos)",
  concept: "Do que o canal trata",
  characters: "Personagens",
  storyFormats: "Formatos de história que se repetem",
  visualStyle: "Estilo visual",
  tone: "Tom e linguagem",
  audience: "Público",
  rules: "Sempre / nunca",
  notes: "Outras notas",
  analytics: "Números do canal",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Título (normalizado) → campo. Confere pelo começo, para aceitar "Duração alvo" sem "(segundos)". */
const HEADINGS: [string, keyof ProfileFields][] = [
  ["nome", "name"],
  ["url", "url"],
  ["link do canal", "url"],
  ["formato principal", "format"],
  ["formatos de historia", "storyFormats"],
  ["formato", "format"],
  ["plataformas", "platforms"],
  ["duracao alvo", "durationSec"],
  ["duracao", "durationSec"],
  ["do que o canal trata", "concept"],
  ["premissa", "concept"],
  ["personagens", "characters"],
  ["estilo visual", "visualStyle"],
  ["tom e linguagem", "tone"],
  ["tom", "tone"],
  ["publico", "audience"],
  ["sempre nunca", "rules"],
  ["regras", "rules"],
  ["outras notas", "notes"],
  ["notas", "notes"],
  ["numeros do canal", "analytics"],
  ["analytics", "analytics"],
];

/** "-", vazio ou só o texto de exemplo entre parênteses = não preenchido. */
function clean(v: string): string | null {
  const t = v.replace(/^\s+|\s+$/g, "");
  if (!t || /^[-–—]+$/.test(t)) return null;
  const lines = t.split("\n").filter((l) => l.trim() && !/^\(.*\)$/.test(l.trim()));
  const out = lines.join("\n").trim();
  return out && !/^[-–—]+$/.test(out) ? out : null;
}

export function parseViews(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = v.toLowerCase().replace(/\s+/g, " ").trim();
  const m = t.match(/([\d.,]+)\s*(mil|k|mi|m|milh)?/);
  if (!m) return null;
  let n = m[2] ? Number(m[1].replace(/\./g, "").replace(",", ".")) : Number(m[1].replace(/[.,]/g, ""));
  if (!isFinite(n)) return null;
  if (m[2] === "mil" || m[2] === "k") n *= 1_000;
  if (m[2] === "mi" || m[2] === "m" || m[2] === "milh") n *= 1_000_000;
  return Math.round(n);
}

function stripOuterFence(text: string) {
  const t = text.replace(/\r\n?/g, "\n").trim();
  const lines = t.split("\n");
  if (lines.length > 2 && /^```/.test(lines[0]) && /^```\s*$/.test(lines[lines.length - 1])) return lines.slice(1, -1).join("\n");
  return t;
}

function parseScripts(part: string, warnings: string[]): ImportedScript[] {
  const blocks = part.split(/^###\s+/m).slice(1);
  const out: ImportedScript[] = [];
  for (const b of blocks) {
    const [head, ...rest] = b.split("\n");
    const title = head.replace(/^roteiro\s*:?\s*/i, "").trim();
    const body = rest.join("\n");
    if (!title || /^\(.*\)$/.test(title)) continue;
    const meta = (label: RegExp) => {
      const m = body.match(new RegExp(`^\\s*(?:${label.source})\\s*:\\s*(.*)$`, "im"));
      return m ? clean(m[1]) : null;
    };
    const fence = body.match(/^(~~~+|```+)[^\n]*\n([\s\S]*?)\n\1\s*$/m);
    let script: string;
    if (fence) script = fence[2].trim();
    else {
      // Sem bloco: tudo o que vem depois das linhas Link/Views/O que funcionou.
      script = body
        .split("\n")
        .filter((l) => !/^\s*(link|views|o que funcionou|notas?)\s*:/i.test(l))
        .join("\n")
        .trim();
    }
    if (!script || /^\(.*\)$/.test(script)) {
      warnings.push(`Roteiro "${title}" veio sem o texto do roteiro e foi ignorado.`);
      continue;
    }
    out.push({ title, url: meta(/link/), views: parseViews(meta(/views?/)), notes: meta(/o que funcionou|notas?/), script });
  }
  return out;
}

export function parseProfileMd(input: string): ParsedProfile {
  const text = stripOuterFence(input);
  const warnings: string[] = [];
  const fields: ProfileFields = {
    name: null,
    url: null,
    format: null,
    platforms: null,
    durationSec: null,
    concept: null,
    characters: null,
    storyFormats: null,
    visualStyle: null,
    tone: null,
    audience: null,
    rules: null,
    notes: null,
    analytics: null,
  };

  const splitAt = text.search(/^#\s+roteiros publicados\s*$/im);
  const profilePart = splitAt >= 0 ? text.slice(0, splitAt) : text;
  const scriptsPart = splitAt >= 0 ? text.slice(splitAt) : "";

  const sections = profilePart.split(/^##\s+/m).slice(1);
  if (!sections.length) warnings.push("Não achei nenhum título “## …”. Confira se o GPT devolveu no modelo do pedido.");
  const unknown: string[] = [];
  for (const sec of sections) {
    const [head, ...rest] = sec.split("\n");
    const key = norm(head);
    const hit = HEADINGS.find(([h]) => key.startsWith(h));
    if (!hit) {
      unknown.push(head.trim());
      continue;
    }
    const field = hit[1];
    const value = clean(rest.join("\n"));
    if (value == null || fields[field] != null) continue;
    if (field === "format") {
      const f = norm(value);
      fields.format = /long|longo/.test(f) ? "long" : /short|curto/.test(f) ? "short" : null;
      if (!fields.format) warnings.push(`Formato "${value}" não reconhecido (use short ou long).`);
    } else if (field === "durationSec") {
      const n = value.match(/\d+/);
      fields.durationSec = n ? Number(n[0]) : null;
    } else {
      (fields as Record<string, unknown>)[field] = value;
    }
  }
  if (unknown.length) warnings.push(`Títulos que o app não conhece (ignorados): ${unknown.join(", ")}.`);

  const scripts = scriptsPart ? parseScripts(scriptsPart, warnings) : [];
  const filled = Object.values(fields).filter((v) => v != null).length;
  if (sections.length && filled === 0) warnings.push("Nenhum campo veio preenchido.");
  return { fields, scripts, warnings };
}
