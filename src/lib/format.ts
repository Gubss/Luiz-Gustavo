const nf = new Intl.NumberFormat("pt-BR");
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)));
export const fmtCompact = (n: number | null | undefined) => (n == null ? "—" : compact.format(n));
export const fmtMult = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "—" : `${n >= 10 ? n.toFixed(0) : n.toFixed(1)}x`;
export const fmtDate = (d: Date | string | null | undefined) =>
  d == null ? "—" : new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d == null
    ? "—"
    : new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      });
