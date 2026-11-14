"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/video/actions";

function Submit({ label, busy, className }: { label: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

/** Formulário com campos (renderizados no servidor), botão, dica de custo e resultado ao lado. */
export function StateForm({
  action,
  children,
  label,
  busy = "Salvando…",
  hint,
  className = "btn-primary",
  formClassName = "space-y-3",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  label: string;
  busy?: string;
  hint?: string;
  className?: string;
  formClassName?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={formClassName}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={label} busy={busy} className={className} />
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {state && (
        <div className="text-sm">
          {state.ok && <p className="text-emerald-400">{state.ok}</p>}
          {state.error && <p className="whitespace-pre-line text-red-400">{state.error}</p>}
        </div>
      )}
    </form>
  );
}
