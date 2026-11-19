"use client";

import { useEffect, useState } from "react";

type View = "grid" | "list";
const KEY = "radar:ideias:view";

/** Banco de ideias em Quadrados ou Lista; a escolha fica guardada neste navegador. */
export function IdeasView({ grid, list }: { grid: React.ReactNode; list: React.ReactNode }) {
  const [view, setView] = useState<View>("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência só existe no navegador
      if (saved === "list" || saved === "grid") setView(saved);
    } catch {}
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const btn = (v: View, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => choose(v)}
      aria-pressed={view === v}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
        view === v ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div role="group" aria-label="Como mostrar as ideias" className="inline-flex gap-0.5 rounded-lg border border-line bg-raised p-0.5">
          {btn(
            "grid",
            "Quadrados",
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
            </svg>,
          )}
          {btn(
            "list",
            "Lista",
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <rect x="1.5" y="2.5" width="13" height="2" rx="1" fill="currentColor" />
              <rect x="1.5" y="7" width="13" height="2" rx="1" fill="currentColor" />
              <rect x="1.5" y="11.5" width="13" height="2" rx="1" fill="currentColor" />
            </svg>,
          )}
        </div>
      </div>
      {view === "grid" ? grid : list}
    </div>
  );
}
