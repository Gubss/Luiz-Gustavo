import Link from "next/link";
import type { StudyMetrics } from "@/lib/study-metrics";
import type { Med, PlaybookStats, Share } from "@/lib/playbook";

const num = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));
const range = (m: Med, unit = "") => (m.value == null ? "—" : m.n > 1 ? `${num(m.value)}${unit} (de ${num(m.min)} a ${num(m.max)})` : `${num(m.value)}${unit}`);
const share = (s: Share) => (s.n ? `${s.yes} de ${s.n} estudos` : "—");

type Row = { label: string; mine: string; ref: string; flag: "ok" | "off" | null };

/** Onde o valor cai em relação à faixa dos estudos: dentro (ok) ou fora (off). */
function inRange(v: number | null | undefined, m: Med, slack = 0.15): Row["flag"] {
  if (v == null || m.value == null || m.min == null || m.max == null || m.n < 2) return null;
  const lo = m.min * (1 - slack);
  const hi = m.max * (1 + slack);
  return v >= lo && v <= hi ? "ok" : "off";
}
const majority = (yes: boolean | null | undefined, s: Share): Row["flag"] => {
  if (yes == null || s.n < 2) return null;
  const most = s.yes * 2 >= s.n;
  return yes === most ? "ok" : "off";
};
const yn = (b: boolean | null | undefined) => (b == null ? "—" : b ? "sim" : "não");

/**
 * Este vídeo × a cartilha (medidas calculadas em código, sem custo).
 * Serve para os seus próprios vídeos: ver em que o vídeo seguiu ou fugiu do padrão das referências.
 */
export function CompareWithPlaybook({
  m,
  st,
  nicheName,
  href,
  own,
}: {
  m: StudyMetrics;
  st: PlaybookStats;
  nicheName: string;
  href: string;
  own: boolean;
}) {
  const rows: Row[] = [
    { label: "Duração", mine: m.durationSec != null ? `${m.durationSec}s` : "—", ref: range(st.durationSec, "s"), flag: inRange(m.durationSec, st.durationSec) },
    { label: "Palavras por segundo", mine: num(m.wordsPerSec), ref: range(st.wordsPerSec), flag: inRange(m.wordsPerSec, st.wordsPerSec) },
    { label: "Primeira fala em", mine: m.firstWordAt != null ? `${num(m.firstWordAt)}s` : "—", ref: range(st.firstWordAt, "s"), flag: inRange(m.firstWordAt, st.firstWordAt, 0.5) },
    { label: "Palavras na abertura", mine: num(m.opening?.words), ref: range(st.openingWords), flag: inRange(m.opening?.words, st.openingWords) },
    {
      label: "Algo novo a cada",
      mine: m.beats?.avgInterval != null ? `${num(m.beats.avgInterval)}s` : "— (precisa do diagnóstico)",
      ref: range(st.beatInterval, "s"),
      flag: inRange(m.beats?.avgInterval, st.beatInterval),
    },
    {
      label: "Maior buraco sem novidade",
      mine: m.beats?.maxGap != null ? `${num(m.beats.maxGap)}s` : "—",
      ref: range(st.maxGap, "s"),
      flag: m.beats?.maxGap != null && st.maxGap.max != null && st.maxGap.n > 1 ? (m.beats.maxGap <= st.maxGap.max * 1.15 ? "ok" : "off") : null,
    },
    { label: "Fecho com chamada", mine: yn(m.closing?.hasCta), ref: share(st.closingCta), flag: majority(m.closing?.hasCta, st.closingCta) },
    { label: "Termina em pergunta", mine: yn(m.closing?.endsWithQuestion), ref: share(st.closingQuestion), flag: majority(m.closing?.endsWithQuestion, st.closingQuestion) },
    { label: "Título: caracteres", mine: String(m.title.chars), ref: range(st.title.chars), flag: inRange(m.title.chars, st.title.chars) },
    { label: "Título é pergunta", mine: yn(m.title.hasQuestion), ref: share(st.title.question), flag: majority(m.title.hasQuestion, st.title.question) },
    { label: "Título fala com “você”", mine: yn(m.title.secondPerson), ref: share(st.title.secondPerson), flag: majority(m.title.secondPerson, st.title.secondPerson) },
  ];
  const off = rows.filter((r) => r.flag === "off");
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        {own ? "Seu vídeo" : "Este vídeo"} comparado com a{" "}
        <Link href={href} className="text-red-400 hover:underline">
          cartilha de {nicheName}
        </Link>{" "}
        ({st.studies} estudos). Grátis, calculado direto das medidas. {own && "Cruze com as views: o que fugiu do padrão e mesmo assim foi bem pode ser um diferencial seu."}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 font-normal">Medida</th>
            <th className="py-1 font-normal">{own ? "Seu vídeo" : "Este vídeo"}</th>
            <th className="py-1 font-normal">Cartilha (mediana e faixa)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-zinc-800">
              <td className="py-1 text-zinc-400">{r.label}</td>
              <td className={`py-1 tabular-nums ${r.flag === "off" ? "text-amber-300" : r.flag === "ok" ? "text-emerald-300" : "text-zinc-200"}`}>
                {r.mine} {r.flag === "off" ? "⚠" : r.flag === "ok" ? "✓" : ""}
              </td>
              <td className="py-1 tabular-nums text-zinc-400">{r.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-500">
        ✓ dentro da faixa dos estudos · ⚠ fora · sem marca quando a cartilha tem menos de 2 estudos com o dado.{" "}
        {off.length ? `Fora do padrão: ${off.map((r) => r.label.toLowerCase()).join(", ")}.` : ""}
      </p>
    </div>
  );
}
