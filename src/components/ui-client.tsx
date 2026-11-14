"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Texto cortado em N linhas com "ver mais" (só aparece se o texto realmente passar do limite). */
export function ClampText({ children, lines = 3, className = "" }: { children: React.ReactNode; lines?: 1 | 2 | 3 | 4 | 6; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const clamp = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 6: "line-clamp-6" }[lines];
  return (
    <div className={className}>
      <div ref={ref} className={open ? "" : clamp}>
        {children}
      </div>
      {(overflow || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-zinc-400 hover:text-white">
          {open ? "ver menos" : "ver mais"}
        </button>
      )}
    </div>
  );
}

/** Menu "⋯" com as ações secundárias de um cartão. Fecha ao clicar fora ou ao escolher um item. */
export function Menu({ children, label = "Mais opções", align = "right" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        title={label}
        className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </summary>
      <div
        className={`absolute z-30 mt-1 min-w-60 rounded-lg border border-line-strong bg-raised p-1 shadow-2xl shadow-black/50 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </details>
  );
}
