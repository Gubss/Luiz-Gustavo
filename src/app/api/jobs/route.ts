import { jobsSummary } from "@/lib/jobs";

export async function GET() {
  const jobs = await jobsSummary();
  return Response.json(
    jobs.map((j) => ({ id: j.id, kind: j.kind, label: j.label, href: j.href, status: j.status, message: j.message, progress: j.progress, step: j.step, expectedSec: j.expectedSec, startedAt: j.startedAt, finishedAt: j.finishedAt })),
  );
}
