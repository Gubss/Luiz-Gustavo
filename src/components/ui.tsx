import Link from "next/link";
import { RememberDetails } from "./workflow";

/**
 * Peças visuais compartilhadas (renderizadas no servidor).
 * Ideia geral: cada tela mostra primeiro o que importa (título, resumo, uma ação principal);
 * explicações e detalhes ficam guardados em "Como funciona" / "Ver detalhes".
 */

type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Cabeçalho padrão da página: título, uma linha de explicação, ação principal à direita. */
export function PageHeader({
  title,
  subtitle,
  actions,
  help,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  help?: React.ReactNode;
}) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-3xl text-sm text-zinc-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {help && <Help>{help}</Help>}
    </header>
  );
}

/** Explicação longa escondida atrás de "Como funciona". */
export function Help({ children, label = "Como funciona" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <span className="grid h-4 w-4 place-items-center rounded-full border border-zinc-600 text-[10px]">?</span>
        {label}
      </summary>
      <div className="mt-2 max-w-3xl space-y-2 rounded-lg border border-line bg-surface/60 p-3 text-xs leading-relaxed text-zinc-400">
        {children}
      </div>
    </details>
  );
}

/** Bloco que abre e fecha. `summary` aparece ao lado do título quando fechado. */
export function Collapsible({
  title,
  meta,
  children,
  open,
  className = "",
  bodyClassName = "mt-3",
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <RememberDetails className={`group ${className}`} open={open}>
      <summary className="flex items-center gap-2 select-none">
        <Chevron />
        <span className="font-medium text-zinc-200 group-hover:text-white">{title}</span>
        {meta && <span className="ml-auto text-xs text-zinc-500">{meta}</span>}
      </summary>
      <div className={bodyClassName}>{children}</div>
    </RememberDetails>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="chev h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform" aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Seção com título pequeno. */
export function Section({
  title,
  actions,
  children,
  className = "",
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-200">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function FilterChip({ href, active, children, title }: { href: string; active: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link href={href} title={title} className={`chip ${active ? "chip-active" : ""}`} scroll={false}>
      {children}
    </Link>
  );
}

/** Linha de filtros com rótulo à esquerda. */
export function FilterRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="mr-1 text-xs text-zinc-500">{label}</span>}
      {children}
    </div>
  );
}

/** Abas por link (status, formato…). */
export function Tabs({ items }: { items: { href: string; label: React.ReactNode; count?: number; active: boolean }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
            t.active ? "border-red-500 font-medium text-white" : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          {t.label}
          {t.count != null && (
            <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${t.active ? "bg-red-600/25 text-red-100" : "bg-zinc-800 text-zinc-400"}`}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

const TONES = {
  neutral: "bg-zinc-800 text-zinc-300",
  red: "bg-red-600/20 text-red-200",
  green: "bg-emerald-600/20 text-emerald-200",
  amber: "bg-amber-500/15 text-amber-200",
  blue: "bg-sky-600/20 text-sky-200",
  violet: "bg-violet-600/20 text-violet-200",
  muted: "bg-transparent text-zinc-500 ring-1 ring-inset ring-zinc-700",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge ${TONES[tone]}`} title={title}>
      {children}
    </span>
  );
}

/** Caixa de busca por texto (GET), mantendo os outros filtros da URL. */
export function SearchBox({
  action,
  q,
  keep,
  placeholder = "Buscar…",
}: {
  action: string;
  q?: string;
  keep?: Record<string, string | undefined>;
  placeholder?: string;
}) {
  return (
    <form action={action} className="relative w-full max-w-xs">
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden>
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input name="q" defaultValue={q} placeholder={placeholder} className="input py-1.5 pl-8" />
    </form>
  );
}

/** Corta uma lista em páginas. */
export function paginate<T>(items: T[], pageParam: string | undefined, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(pages, Math.max(1, Number(pageParam) || 1));
  return { page, pages, total: items.length, slice: items.slice((page - 1) * perPage, page * perPage), from: (page - 1) * perPage + 1 };
}

/** Navegação de páginas: ‹ 1 2 3 … 9 › */
export function Pagination({ page, pages, href, total, label = "itens" }: { page: number; pages: number; href: (p: number) => string; total?: number; label?: string }) {
  if (pages <= 1) return total != null && total > 0 ? <p className="text-center text-xs text-zinc-600">{total} {label}</p> : null;
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const list = [...nums].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out.push("…");
    out.push(n);
  });
  const cls = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm tabular-nums";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="Páginas">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${cls} text-zinc-400 hover:bg-zinc-800`}>
          ‹ Anterior
        </Link>
      ) : null}
      {out.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className={`${cls} text-zinc-600`}>
            …
          </span>
        ) : (
          <Link key={n} href={href(n)} className={`${cls} ${n === page ? "bg-zinc-800 font-medium text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} className={`${cls} text-zinc-400 hover:bg-zinc-800`}>
          Próxima ›
        </Link>
      ) : null}
      {total != null && <span className="ml-2 text-xs text-zinc-600">{total} {label}</span>}
    </nav>
  );
}

export function EmptyState({ title, children, action }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-medium text-zinc-200">{title}</p>
      {children && <div className="max-w-md text-sm text-zinc-400">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Número grande com rótulo. */
export function Stat({ label, value, hint, tone }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="card-raised px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : ""}`}>{value}</div>
      {hint && <div className="text-[11px] leading-tight text-zinc-500">{hint}</div>}
    </div>
  );
}

/** Monta links mantendo os parâmetros atuais. */
export function makeHref(base: string, current: Record<string, string | undefined>) {
  return (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
}

export type { SP };
