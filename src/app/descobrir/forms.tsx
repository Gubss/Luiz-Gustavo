"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "./actions";

const SEARCH_COST = 102; // 100 da busca + ~2 dos lotes de vídeos e canais
const MAX_KEYWORDS = 5;

function Submit({
  children,
  className = "btn-primary",
  pendingText = "Processando…",
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending || disabled}>
      {pending ? pendingText : children}
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

const units = (n: number) => `${n.toLocaleString("pt-BR")} unidade${n === 1 ? "" : "s"}`;

export function SearchForm({
  action,
  suggestions,
  remaining,
  reserve,
  defaults,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  suggestions: string[];
  remaining: number;
  reserve: number;
  defaults: { format: "short" | "long"; language: string; region: string; days: number };
}) {
  const [state, formAction] = useActionState(action, null);
  const [keywords, setKeywords] = useState("");
  const [format, setFormat] = useState<"short" | "long">(defaults.format);
  const list = [...new Set(keywords.split(/[\n,;]+/).map((s) => s.trim()).filter((s) => s.length >= 2))];
  const cost = list.length * SEARCH_COST;
  const tooMany = list.length > MAX_KEYWORDS;
  const noQuota = cost > remaining;
  const eatsReserve = !noQuota && remaining - cost < reserve;

  const addSuggestion = (s: string) => {
    if (list.includes(s)) return;
    setKeywords((k) => (k.trim() ? `${k.trim()}\n${s}` : s));
  };

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div>
          <label className="label" htmlFor="keywords">
            Palavras-chave (uma por linha, até {MAX_KEYWORDS})
          </label>
          <textarea
            id="keywords"
            name="keywords"
            rows={4}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="input"
            placeholder={"o que aconteceria se\ncuriosidades do oceano\nmistérios não resolvidos"}
          />
          {suggestions.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-zinc-500">Sugestões tiradas dos títulos que mais deram view no nicho (clique para usar):</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => addSuggestion(s)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      list.includes(s) ? "border-red-500 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="label">Formato que você procura</span>
            <div className="flex gap-2">
              {(
                [
                  ["short", "Shorts"],
                  ["long", "Vídeos longos"],
                ] as const
              ).map(([v, l]) => (
                <label
                  key={v}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${
                    format === v ? "border-red-500 bg-red-600/20 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  <input type="radio" name="format" value={v} checked={format === v} onChange={() => setFormat(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {format === "short"
                ? "Busca vídeos de até 4 min e fica só com os que são Shorts de verdade."
                : "Só vídeos longos entram; Shorts que aparecerem na busca são descartados."}
            </p>
          </div>
          {format === "long" && (
            <div>
              <label className="label">Duração dos longos</label>
              <select name="longDuration" defaultValue="medium" className="input">
                <option value="medium">4 a 20 min</option>
                <option value="long">Mais de 20 min</option>
                <option value="any">Qualquer duração</option>
              </select>
            </div>
          )}
          <div>
            <label className="label">Vídeos publicados</label>
            <select name="days" defaultValue={String(defaults.days)} className="input">
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 3 meses</option>
              <option value="180">Últimos 6 meses</option>
              <option value="365">Último ano</option>
              <option value="0">Qualquer data</option>
            </select>
          </div>
          <div>
            <label className="label">Ordenar a busca por</label>
            <select name="order" defaultValue="viewCount" className="input">
              <option value="viewCount">Mais vistos</option>
              <option value="relevance">Relevância</option>
            </select>
          </div>
          <div>
            <label className="label">Idioma</label>
            <select name="language" defaultValue={defaults.language} className="input">
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
              <option value="es">Espanhol</option>
              <option value="">Qualquer</option>
            </select>
          </div>
          <div>
            <label className="label">País</label>
            <select name="region" defaultValue={defaults.region} className="input">
              <option value="BR">Brasil</option>
              <option value="PT">Portugal</option>
              <option value="US">Estados Unidos</option>
              <option value="">Qualquer</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit disabled={list.length === 0 || tooMany || noQuota} pendingText="Buscando… (pode levar alguns segundos)">
          Buscar canais
        </Submit>
        <span className={`text-sm ${noQuota || tooMany ? "text-red-400" : eatsReserve ? "text-amber-400" : "text-zinc-400"}`}>
          {list.length === 0
            ? `Cada palavra-chave custa cerca de ${SEARCH_COST} unidades.`
            : tooMany
              ? `Use no máximo ${MAX_KEYWORDS} palavras por vez.`
              : `Custo: ~${units(cost)} (${list.length} palavra${list.length === 1 ? "" : "s"} × ${SEARCH_COST}) · restam ${units(remaining)} hoje.`}
          {noQuota && " Não há cota suficiente hoje."}
          {eatsReserve && ` Atenção: vai sobrar menos que as ~${units(reserve)} da coleta diária dos seus canais.`}
        </span>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ActionButton({
  action,
  children,
  className = "btn-secondary",
  pendingText,
  title,
}: {
  action: () => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  title?: string;
}) {
  const [state, formAction] = useActionState(async () => action(), null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1" title={title}>
      <Submit className={className} pendingText={pendingText}>
        {children}
      </Submit>
      {state?.error && <p className="max-w-xs text-right text-xs text-red-400">{state.error}</p>}
      {state?.ok && <p className="max-w-xs text-right text-xs text-emerald-400">{state.ok}</p>}
    </form>
  );
}

export function FeaturedButton({ action, cost, disabled }: { action: () => Promise<FormState>; cost: number; disabled: boolean }) {
  const [state, formAction] = useActionState(async () => action(), null);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Submit className="btn-secondary" disabled={disabled} pendingText="Lendo as páginas dos canais…">
          Buscar canais indicados
        </Submit>
        <span className="text-sm text-zinc-400">Custo: ~{units(cost)}</span>
      </div>
      <Feedback state={state} />
    </form>
  );
}
