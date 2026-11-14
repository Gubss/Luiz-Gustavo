"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "../actions";

function Submit({ children, busy, className = "btn-primary" }: { children: React.ReactNode; busy: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? busy : children}
    </button>
  );
}

export function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div className="text-sm">
      {state.ok && <p className="text-emerald-400">{state.ok}</p>}
      {state.error && <p className="whitespace-pre-line text-red-400">{state.error}</p>}
    </div>
  );
}

/** Botão que roda uma ação demorada e mostra o resultado ao lado. */
export function ActionButton({
  action,
  label,
  busy,
  hint,
  className,
}: {
  action: () => Promise<FormState>;
  label: string;
  busy: string;
  hint?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Submit busy={busy} className={className}>
          {label}
        </Submit>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PasteTranscriptForm({
  action,
  defaultLang,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaultLang: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="transcript"
        rows={8}
        className="input font-mono text-xs"
        placeholder={"Cole aqui. Aceita:\n0:00 texto da fala\n0:04 outra fala\n…ou um arquivo .srt/.vtt, ou texto corrido sem tempo."}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Idioma
          <input name="language" defaultValue={defaultLang} className="input w-20 py-1" />
        </label>
        <Submit busy="Salvando…" className="btn-secondary">
          Salvar transcrição colada
        </Submit>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function StudyLinkForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input name="url" className="input" placeholder="https://www.youtube.com/watch?v=… ou /shorts/…" />
        <Submit busy="Buscando…">Estudar</Submit>
      </div>
      <p className="text-xs text-zinc-500">
        Para vídeos fora do radar. Usa 1–2 unidades de cota. O canal fica guardado, mas não entra no radar nem na coleta diária.
      </p>
      <Feedback state={state} />
    </form>
  );
}
