import { runTracker } from "@/lib/tracker";

/** Roda o acompanhamento dos meus vídeos agora (o app também roda sozinho a cada 5 min). */
export async function POST() {
  try {
    return Response.json(await runTracker());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
