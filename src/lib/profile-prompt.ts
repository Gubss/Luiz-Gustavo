/**
 * O pedido para o GPT (docs/prompt-perfil-canal.md), com o nome e a URL do canal já preenchidos.
 * Fica separado de profile-md.ts de propósito: ler arquivo do disco num módulo usado pelas páginas
 * faz o modo dev do Next recarregar a tela sem parar.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export function profilePrompt(channel: { name: string; url: string | null }) {
  const tpl = readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "docs", "prompt-perfil-canal.md"), "utf8");
  return tpl.replaceAll("{{CANAL}}", channel.name).replaceAll("{{URL}}", channel.url || "(coloque o link do canal)");
}
