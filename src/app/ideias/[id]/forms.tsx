"use client";
import { useId, useState, type ReactNode } from "react";

import { IDEA_STATUS } from "@/lib/idea-status";

export function IdeaStatusSelect({ action, value }: { action: (fd: FormData) => Promise<void>; value: string }) {
  return (
    <form action={action}>
      <select name="status" defaultValue={value} className="input w-auto py-1" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {Object.entries(IDEA_STATUS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}

/** Botão pequeno de apagar, com confirmação. */
export function DeleteIdeaButton({
  action,
  label = "Apagar",
  className = "btn-ghost px-2 py-1 text-xs text-zinc-500 hover:text-red-400",
}: {
  action: () => Promise<void>;
  label?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Apagar esta ideia (e o roteiro dela, se tiver)?")) e.preventDefault();
      }}
    >
      <button className={className}>{label}</button>
    </form>
  );
}

/** Roteiro em duas abas: o falado (só o que se ouve) abre primeiro; a animação e direção fica na outra. */
export function ScriptTabs({ spoken, animation }: { spoken: ReactNode; animation: ReactNode }) {
  const tabId=useId();
  const [tab, setTab] = useState<"falado" | "animacao">("falado");
  const btn = (k: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={tabId+k}
      aria-controls={tabId+"panel"}
      tabIndex={tab===k?0:-1}
      aria-selected={tab === k}
      onClick={() => setTab(k)}
      onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();const next=k==="falado"?"animacao":"falado";setTab(next);document.getElementById(tabId+next)?.focus();}}}
      className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div role="tablist" className="mb-3 inline-flex gap-1 rounded-lg border border-line p-1">
        {btn("falado", "Roteiro falado")}
        {btn("animacao", "Animação e direção")}
      </div>
      <div role="tabpanel" id={tabId+"panel"} aria-labelledby={tabId+tab}>{tab === "falado" ? spoken : animation}</div>
    </div>
  );
}

