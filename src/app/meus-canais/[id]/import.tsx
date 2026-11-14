"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ParsedProfile, ProfileFields } from "@/lib/profile-md";
import type { FormState } from "@/app/video/actions";

const LABELS: Record<keyof ProfileFields, string> = {
  name: "Nome",
  url: "URL",
  format: "Formato principal",
  platforms: "Plataformas",
  durationSec: "Duração alvo (s)",
  concept: "Do que o canal trata",
  characters: "Personagens",
  storyFormats: "Formatos de história",
  visualStyle: "Estilo visual",
  tone: "Tom e linguagem",
  audience: "Público",
  rules: "Sempre / nunca",
  notes: "Outras notas",
  analytics: "Números do canal",
};

/** Importar o perfil respondido pelo GPT (.md): escolher arquivo ou colar → prévia → salvar. */
export function ProfileImport({
  preview,
  apply,
}: {
  preview: (text: string) => Promise<ParsedProfile>;
  apply: (text: string) => Promise<FormState>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedProfile | null>(null);
  const [result, setResult] = useState<FormState>(null);
  const [pending, start] = useTransition();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setParsed(null);
    setResult(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-secondary cursor-pointer">
          Escolher arquivo .md
          <input type="file" accept=".md,.txt,text/markdown,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="text-xs text-zinc-500">ou cole a resposta do GPT abaixo</span>
      </div>
      <textarea
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParsed(null);
          setResult(null);
        }}
        className="input font-mono text-xs"
        placeholder={"# PERFIL DO CANAL\n\n## Nome\n…"}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!text.trim() || pending}
          onClick={() => start(async () => setParsed(await preview(text)))}
        >
          {pending && !parsed ? "Lendo…" : "Ver prévia"}
        </button>
        {parsed && (
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await apply(text);
                setResult(r);
                if (r?.ok) {
                  setParsed(null);
                  setText("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Salvando…" : "Importar e salvar no perfil"}
          </button>
        )}
      </div>

      {parsed && (
        <div className="space-y-3 rounded-lg border border-zinc-800 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Prévia: é isso que vai entrar no perfil</div>
          {parsed.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-300">
              {parsed.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <table className="w-full">
            <tbody>
              {(Object.keys(LABELS) as (keyof ProfileFields)[]).map((k) => (
                <tr key={k} className="border-t border-zinc-800 align-top">
                  <td className="w-44 py-1 pr-3 text-xs text-zinc-500">{LABELS[k]}</td>
                  <td className="whitespace-pre-line py-1 text-zinc-200">
                    {parsed.fields[k] != null ? String(parsed.fields[k]) : <span className="text-zinc-600">vazio (mantém o que já está no perfil)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <div className="text-xs text-zinc-500">Roteiros publicados ({parsed.scripts.length})</div>
            <ul className="mt-1 space-y-0.5">
              {parsed.scripts.map((s, i) => (
                <li key={i} className="text-zinc-300">
                  {s.title}{" "}
                  <span className="text-xs text-zinc-500">
                    · {s.script.split(/\s+/).length} palavras{s.views != null ? ` · ${s.views.toLocaleString("pt-BR")} views` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-zinc-500">Roteiro com o mesmo título de um que já está cadastrado é atualizado; os outros são adicionados.</p>
          </div>
        </div>
      )}
      {result?.ok && <p className="text-sm text-emerald-400">{result.ok}</p>}
      {result?.error && <p className="text-sm text-red-400">{result.error}</p>}
    </div>
  );
}
