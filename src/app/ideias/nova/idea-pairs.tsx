"use client";
import { useRef, useState } from "react";

/** Cada ideia = Título + Resumo. "+ outra ideia" acrescenta um par; "×" tira (v3, Gubs 17/11). */
export function IdeaPairs({ max }: { max: number }) {
  const next = useRef(1);
  const [ids, setIds] = useState<number[]>([0]);
  const add = () => setIds((xs) => (xs.length >= max ? xs : [...xs, next.current++]));
  const remove = (id: number) => setIds((xs) => (xs.length === 1 ? xs : xs.filter((x) => x !== id)));
  return (
    <div className="space-y-3">
      {ids.map((id, i) => (
        <fieldset key={id} className="relative rounded-lg border border-line p-3">
          <legend className="px-1 text-xs text-zinc-400">Ideia {i + 1}</legend>
          {ids.length > 1 && (
            <button
              type="button"
              onClick={() => remove(id)}
              className="absolute right-2 top-2 rounded px-2 text-lg leading-none text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
              aria-label={`Tirar a ideia ${i + 1}`}
              title="Tirar esta ideia"
            >
              ×
            </button>
          )}
          <label className="label" htmlFor={`titulo-${id}`}>
            Título
          </label>
          <input id={`titulo-${id}`} name="titulo" className="input" maxLength={120} placeholder="Ex.: Ar-condicionado caseiro" autoFocus={i > 0} />
          <label className="label mt-2" htmlFor={`resumo-${id}`}>
            Resumo <span className="text-zinc-500">(o que acontece, pode ter vários parágrafos; vai literal para o roteirista)</span>
          </label>
          <textarea
            id={`resumo-${id}`}
            name="resumo"
            rows={5}
            className="input"
            maxLength={6000}
            placeholder="Ex.: O menino tenta construir um ar-condicionado para a avó com balde, gelo e ventilador; dá errado do jeito mais engraçado."
          />
        </fieldset>
      ))}
      <button type="button" onClick={add} disabled={ids.length >= max} className="btn-secondary btn-sm">
        + outra ideia
      </button>
      {ids.length >= max && <span className="ml-2 text-xs text-zinc-500">Até {max} de uma vez.</span>}
    </div>
  );
}
