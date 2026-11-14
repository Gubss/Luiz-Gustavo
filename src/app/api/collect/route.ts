import { collectAll, isCollecting, isCollectionDue, lastCollection } from "@/lib/collect";

export async function GET() {
  return Response.json({ running: isCollecting(), due: await isCollectionDue(), last: await lastCollection() });
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
