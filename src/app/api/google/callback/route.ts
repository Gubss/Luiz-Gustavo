import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCode, mineChannel, redirectUriFor, saveGoogleAuth } from "@/lib/google";

/** Volta do Google: troca o código pelo token, descobre qual canal entrou e liga ao perfil. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let saved: { state?: string; canal?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("g_oauth")?.value ?? "{}");
  } catch {
    /* cookie inválido */
  }
  const back = new URL(`/meus-videos${saved.canal ? `?canal=${saved.canal}` : ""}`, req.nextUrl.origin);
  const finish = (status: string, msg?: string) => {
    back.searchParams.set("google", status);
    if (msg) back.searchParams.set("msg", msg.slice(0, 300));
    const res = NextResponse.redirect(back);
    res.cookies.delete("g_oauth");
    return res;
  };

  if (sp.get("error")) return finish("erro", sp.get("error") === "access_denied" ? "Você cancelou o login." : `O Google respondeu: ${sp.get("error")}`);
  const code = sp.get("code");
  if (!code || !saved.state || sp.get("state") !== saved.state) return finish("erro", "O login não confere (demorou demais ou veio de outra aba). Tente de novo.");

  try {
    const t = await exchangeCode(code, redirectUriFor(req.nextUrl.origin));
    if (!/yt-analytics\.readonly/.test(t.scope ?? "yt-analytics.readonly"))
      return finish("erro", "Faltou marcar a permissão do YouTube Analytics na tela do Google. Entre de novo e deixe as caixinhas marcadas.");
    const ch = await mineChannel(t.access_token);
    await saveGoogleAuth(ch.id, ch.snippet.title, t);

    const thumb = ch.snippet.thumbnails?.high?.url ?? ch.snippet.thumbnails?.default?.url ?? null;
    const channelData = {
      externalId: ch.id,
      title: ch.snippet.title,
      thumbnailUrl: thumb,
      uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads ?? null,
      subscriberCount: ch.statistics?.subscriberCount != null ? Number(ch.statistics.subscriberCount) : null,
      oauthConnected: true,
    };
    const target = saved.canal ? await prisma.myChannel.findUnique({ where: { id: saved.canal } }) : null;
    if (target && target.externalId && target.externalId !== ch.id) {
      return finish(
        "erro",
        `Você entrou com o canal “${ch.snippet.title}”, mas este perfil é de outro canal. Entre de novo e escolha o canal certo (se for canal de marca, ele aparece numa lista depois do e-mail).`,
      );
    }
    if (target) await prisma.myChannel.update({ where: { id: target.id }, data: { ...channelData, url: target.url ?? `https://www.youtube.com/channel/${ch.id}` } });
    await prisma.myChannel.updateMany({ where: { externalId: ch.id }, data: { oauthConnected: true } });
    if (!target && !(await prisma.myChannel.findFirst({ where: { externalId: ch.id } }))) {
      const c = await prisma.myChannel.create({ data: { name: ch.snippet.title, url: `https://www.youtube.com/channel/${ch.id}`, status: "PRODUCTION", ...channelData } });
      back.search = `?canal=${c.id}`;
    }
    return finish("ok", `Conectado: ${ch.snippet.title}.`);
  } catch (e) {
    return finish("erro", e instanceof Error ? e.message : String(e));
  }
}
