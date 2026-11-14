"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "../actions";

function Submit({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? "Processando…" : children}
    </button>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div className="space-y-1 text-sm">
      {state.ok && <p className="text-emerald-400">{state.ok}</p>}
      {state.error && <p className="whitespace-pre-line text-red-400">{state.error}</p>}
    </div>
  );
}

export function AddChannelsForm({
  action,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="label" htmlFor="channels">
        Adicionar canais monitorados
      </label>
      <textarea
        id="channels"
        name="channels"
        rows={3}
        className="input font-mono"
        placeholder={"https://www.youtube.com/@canal\n@outrocanal\nUCxxxxxxxxxxxxxxxxxxxxxx"}
      />
      <div className="flex items-center gap-3">
        <Submit>Adicionar</Submit>
        <span className="text-xs text-zinc-500">
          Um por linha: URL, @handle, ID (UC…) ou link de um vídeo do canal. ~1 unidade de cota cada.
        </span>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RefreshButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex items-center gap-3">
      <Feedback state={state} />
      <Submit className="btn-secondary">↻ Atualizar dados dos canais</Submit>
    </form>
  );
}

export function ConfirmDelete({ action, label, message }: { action: () => Promise<void>; label: string; message: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <button className="btn-danger">{label}</button>
    </form>
  );
}

export function StatusSelect({
  action,
  value,
}: {
  action: (fd: FormData) => Promise<void>;
  value: string;
}) {
  return (
    <form action={action}>
      <select
        name="status"
        defaultValue={value}
        className="input w-auto py-1"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="PRODUCTION">Em produção</option>
        <option value="VALIDATING">Validando formato</option>
        <option value="RESEARCH">Em pesquisa</option>
      </select>
    </form>
  );
}
