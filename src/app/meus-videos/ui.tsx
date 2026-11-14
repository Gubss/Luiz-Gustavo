import { modelLabel, usdToBrl, type CostEstimate } from "@/lib/claude";

export const usd = (n: number | null | undefined) => (n == null ? "—" : `US$ ${n.toFixed(n < 0.1 ? 3 : 2).replace(".", ",")}`);
const brl = (n: number) => `R$ ${(n * usdToBrl()).toFixed(2).replace(".", ",")}`;
export const estimateHint = (e: CostEstimate) =>
  `${modelLabel(e.model)} · custo estimado ${usd(e.usd)} a ${usd(e.usdMax)} (≈ ${brl(e.usd)} a ${brl(e.usdMax)})`;

export function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

const VERDICT: Record<string, string> = {
  "acima do normal": "border-emerald-700 bg-emerald-950/50 text-emerald-300",
  "no normal": "border-zinc-700 bg-zinc-800/60 text-zinc-300",
  "abaixo do normal": "border-red-800 bg-red-950/50 text-red-300",
  "cedo demais": "border-amber-700 bg-amber-950/40 text-amber-300",
};

export function VerdictBadge({ v }: { v: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${VERDICT[v] ?? VERDICT["no normal"]}`}>{v}</span>;
}

/** Cor do número comparado ao normal do canal. */
export function ratioClass(r: number | null | undefined) {
  if (r == null || !isFinite(r)) return "text-zinc-300";
  if (r >= 1.5) return "text-emerald-300";
  if (r >= 0.8) return "text-zinc-200";
  return "text-red-300";
}
