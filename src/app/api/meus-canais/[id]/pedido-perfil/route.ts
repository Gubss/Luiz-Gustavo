import { prisma } from "@/lib/db";
import { profilePrompt } from "@/lib/profile-prompt";

/** Baixa o pedido (.md) para o GPT do Maestri preencher o perfil deste canal. */
export async function GET(_req: Request, ctx: RouteContext<"/api/meus-canais/[id]/pedido-perfil">) {
  const { id } = await ctx.params;
  const c = await prisma.myChannel.findUnique({ where: { id }, select: { name: true, url: true } });
  if (!c) return new Response("Canal não encontrado", { status: 404 });
  const slug = c.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "canal";
  return new Response(profilePrompt(c), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="pedido-perfil-${slug}.md"`,
    },
  });
}
