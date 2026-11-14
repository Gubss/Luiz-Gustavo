import { collectAll, isCollecting, isCollectionDue, lastCollection } from "@/lib/collect";
import { getSettings } from "@/lib/settings";

/** `due`: a tela deve coletar sozinha ao abrir (desligável em Configurações → Automático). */
export async function GET() {
  const { autoCollect } = await getSettings();
  return Response.json({ running: isCollecting(), due: autoCollect && (await isCollectionDue()), last: await lastCollection() });
}

/** POST { trigger: "auto" | "manual", force?: boolean, nicheId?: string } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { trigger?: string; force?: boolean };
  const trigger = body.trigger === "manual" ? "manual" : "auto";
  if (trigger === "auto" && !(await isCollectionDue())) {
    return Response.json({ status: "skipped", message: "Dados do dia já coletados." });
  }
  try {
    const summary = await collectAll({ trigger, force: !!body.force });
    return Response.json(summary);
  } catch (e) {
    return Response.json({ status: "error", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
