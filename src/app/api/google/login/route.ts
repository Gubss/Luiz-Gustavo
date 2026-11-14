import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleConfigured, redirectUriFor } from "@/lib/google";

/** Começa o "Entrar com Google": manda para a tela de login do Google (só leitura). */
export async function GET(req: NextRequest) {
  const canal = req.nextUrl.searchParams.get("canal") ?? "";
  const back = new URL(`/meus-videos${canal ? `?canal=${canal}` : ""}`, req.nextUrl.origin);
  if (!googleConfigured()) {
    back.searchParams.set("google", "sem-config");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state, redirectUriFor(req.nextUrl.origin)));
  res.cookies.set("g_oauth", JSON.stringify({ state, canal }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
