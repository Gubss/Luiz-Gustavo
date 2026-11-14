/** Perfil do canal por .md (pedido para o GPT do Maestri e leitura da resposta). Sem banco, sem rede. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ANSWER = [
  "```markdown",
  "# PERFIL DO CANAL",
  "",
  "## Nome",
  "Culpa de Quem?",
  "",
  "## URL",
  "https://www.youtube.com/@culpadequem",
  "",
  "## Formato principal",
  "Short",
  "",
  "## Plataformas",
  "YouTube Shorts, TikTok",
  "",
  "## Duração alvo",
  "35 segundos",
  "",
  "## Do que o canal trata",
  "Família 3D. O Theo pergunta tudo.",
  "",
  "## Personagens",
  "Theo (7): curioso",
  "Pai: calmo",
  "",
  "## Formatos de historia que se repetem",
  "Theo afirma algo errado e o pai corrige",
  "",
  "## Estilo visual",
  "(animação 3D/2D, cenários fixos)",
  "",
  "## Tom e linguagem",
  "-",
  "",
  "## Público",
  "Crianças 6-12",
  "",
  "## Sempre / nunca",
  "Nunca violência",
  "",
  "## Números do canal",
  "14/11/2026: 3.200 inscritos; top: Puxei um fiozinho (21 mil)",
  "",
  "## Coisa inventada",
  "x",
  "",
  "# ROTEIROS PUBLICADOS",
  "",
  "### Roteiro: Puxei um fiozinho",
  "Link: https://youtube.com/shorts/abcdefghijk",
  "Views: 21 mil",
  "O que funcionou: gancho nos 2s",
  "~~~",
  "THEO: Pai, puxei um fiozinho...",
  "PAI: Ih.",
  "~~~",
  "",
  "### Roteiro: (título do próximo vídeo)",
  "Link: -",
  "~~~",
  "(roteiro)",
  "~~~",
  "```",
].join("\n");

test("lê a resposta do GPT: campos, roteiros, '-' e exemplos vazios, avisos", async () => {
  const { parseProfileMd, parseViews } = await import("../src/lib/profile-md");
  const p = parseProfileMd(ANSWER);
  assert.equal(p.fields.name, "Culpa de Quem?");
  assert.equal(p.fields.format, "short");
  assert.equal(p.fields.durationSec, 35);
  assert.equal(p.fields.characters, "Theo (7): curioso\nPai: calmo");
  assert.equal(p.fields.storyFormats, "Theo afirma algo errado e o pai corrige");
  assert.equal(p.fields.visualStyle, null, "texto de exemplo entre parênteses não conta");
  assert.equal(p.fields.tone, null, "'-' = não sabe");
  assert.equal(p.fields.audience, "Crianças 6-12");
  assert.match(p.fields.analytics!, /3\.200 inscritos/);
  assert.equal(p.scripts.length, 1);
  assert.deepEqual(p.scripts[0], {
    title: "Puxei um fiozinho",
    url: "https://youtube.com/shorts/abcdefghijk",
    views: 21000,
    notes: "gancho nos 2s",
    script: "THEO: Pai, puxei um fiozinho...\nPAI: Ih.",
  });
  assert.ok(p.warnings.some((w) => w.includes("Coisa inventada")));
  assert.equal(parseViews("1,2 mi"), 1_200_000);
  assert.equal(parseViews("12.345"), 12345);
});

test("o pedido para o GPT tem todos os títulos que o leitor entende", async () => {
  const { parseProfileMd } = await import("../src/lib/profile-md");
  const tpl = readFileSync("docs/prompt-perfil-canal.md", "utf8");
  const model = tpl.slice(tpl.indexOf("# PERFIL DO CANAL"), tpl.lastIndexOf("```"));
  const p = parseProfileMd(model);
  assert.equal(p.warnings.filter((w) => w.includes("não conhece")).length, 0, p.warnings.join(" | "));
  assert.equal(p.fields.format, "short");
  assert.equal(p.fields.durationSec, 35);
  assert.equal(p.scripts.length, 0, "os exemplos do modelo não viram roteiro");
});
