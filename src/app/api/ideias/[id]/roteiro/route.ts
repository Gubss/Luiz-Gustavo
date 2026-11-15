import { prisma } from "@/lib/db";

/**
 * Baixa o roteiro em .md para levar ao Maestri (que produz o vídeo).
 * Vai junto o essencial do perfil (personagens, estilo visual, tom) para quem anima não precisar de outro arquivo.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ideias/[id]/roteiro">) {
  const { id } = await ctx.params;
  const idea = await prisma.idea.findUnique({ where: { id }, include: { myChannel: true, videoFormat: true } });
  if (!idea?.script) return new Response("Essa ideia ainda não tem roteiro.", { status: 404 });
  const c = idea.myChannel;
  // Como o canal faz o formato usado (para o Estúdio conferir o roteiro contra o formato certo).
  const how =
    c && idea.formatId
      ? (await prisma.channelFormat.findUnique({ where: { myChannelId_formatId: { myChannelId: c.id, formatId: idea.formatId } } }))?.howText
      : null;
  const block = (t: string, v: string | null | undefined) => (v?.trim() ? [`## ${t}`, v.trim(), ""] : []);
  const md = [
    idea.script,
    "",
    "---",
    "",
    `# Referência do canal${c ? `: ${c.name}` : ""}`,
    "",
    ...block("Personagens", c?.characters),
    ...block("Estilo visual", c?.visualStyle),
    ...block("Tom e linguagem", c?.tone),
    ...block("Sempre / nunca", c?.rules),
    ...(idea.videoFormat ? block(`Formato usado: ${idea.videoFormat.name}`, how ?? idea.videoFormat.description) : []),
    `_Gerado pelo YouTube Radar · ideia ${idea.id}_`,
    "",
  ].join("\n");
  const slug = (idea.chosenTitle || idea.theme).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "roteiro";
  return new Response(md, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="roteiro-${slug}.md"` },
  });
}
