"use client";

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
export function DeleteIdeaButton({ action, label = "Apagar" }: { action: () => Promise<void>; label?: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Apagar esta ideia (e o roteiro dela, se tiver)?")) e.preventDefault();
      }}
    >
      <button className="btn-ghost px-2 py-1 text-xs text-zinc-500 hover:text-red-400">{label}</button>
    </form>
  );
}
