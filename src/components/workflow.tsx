"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { returnPoints } from "@/lib/speech";

/** Native disclosure: usable before hydration, with page-specific browser memory. */
export function RememberDetails({ children, open, storageKey, ...props }: React.ComponentProps<"details"> & { storageKey?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = "radar:section:" + pathname + ":" + (storageKey ?? el.querySelector("summary")?.textContent);
    try {
      const saved = localStorage.getItem(key);
      el.open = saved === null ? Boolean(open) : saved === "true";
    } catch { /* Browser storage may be unavailable; disclosure still works. */ }
    // Link com âncora (#cota, #receita…) abre o bloco de destino.
    const openFromHash = () => { if (el.id && window.location.hash === "#" + el.id) { el.open = true; el.scrollIntoView(); } };
    openFromHash();
    const save = () => { try { localStorage.setItem(key, String(el.open)); } catch {} };
    el.addEventListener("toggle", save);
    window.addEventListener("hashchange", openFromHash);
    return () => { el.removeEventListener("toggle", save); window.removeEventListener("hashchange", openFromHash); };
  }, [pathname, storageKey, open]);
  return <details {...props} open={open} ref={ref}>{children}</details>;
}

export function WorkSection({ id, title, children, open = false, version = "" }: { id: string; title: string; children: ReactNode; open?: boolean; version?: string }) {
  return <RememberDetails id={id} storageKey={id + version} open={open} className="card p-5 scroll-mt-6">
    <summary className="flex items-center gap-3 text-base font-semibold"><span className="chev text-zinc-500" aria-hidden>›</span>{title}</summary>
    <div className="mt-4 space-y-4">{children}</div>
  </RememberDetails>;
}

export function FlowSteps({ current, referenceDone }: { current: number; referenceDone: boolean }) {
  const labels = ["Pesquisar", "Estudar referência", "Ideia", "Roteiro", "Revisão do Estúdio", "Produção", "Publicado / métricas"];
  const hrefs = ["/", "/estudos", "#ideia", "#roteiro", "#revisao", "#producao", "#publicacao"];
  return <nav aria-label="Etapas de criação"><ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
    {labels.map((label, i) => <li key={label}><a href={hrefs[i]} aria-current={current === i + 1 ? "step" : undefined}
      onClick={() => { const el = document.getElementById(hrefs[i].slice(1)); if (el instanceof HTMLDetailsElement) el.open = true; }}
      className={"flex h-full items-center gap-2 rounded-lg border px-3 py-3 text-xs " + (current === i + 1 ? "border-red-500 text-white bg-red-600/10" : "border-line text-zinc-400 hover:text-white")}>
      <span className="font-semibold tabular-nums">{i + 1}</span><span>{label}</span>
      {((i === 0 && referenceDone) || (i === 2 && current > 3) || (i === 3 && current > 4)) && <span aria-label="Concluída">✓</span>}
    </a></li>)}
  </ol></nav>;
}

export function CopyScript({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return <span className="inline-flex flex-wrap items-center gap-2"><button type="button" className="btn-secondary btn-sm" onClick={async () => {
    try { const response = await fetch(url); if (!response.ok) throw new Error(); await navigator.clipboard.writeText(await response.text()); setMessage("Copiado"); }
    catch { setMessage("Não foi possível copiar. Baixe o .md."); }
  }}>Copiar roteiro</button><span role="status" className="text-xs text-zinc-400">{message}</span></span>;
}

export function ReturnInput() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // Depois de registrar, o React reseta o formulário: limpa o texto e as escolhas junto (senão as bolinhas voltam ao padrão e o destaque não).
  useEffect(() => {
    const form = fileRef.current?.form;
    if (!form) return;
    const clear = () => { setText(""); setRound((r) => r + 1); };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);
  async function load(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) { setError("Escolha um arquivo .md."); return; }
    if (file.size > 1024 * 1024) { setError("O arquivo deve ter até 1 MB."); return; }
    try { const content = await file.text(); setText((previous) => previous.trim() ? previous + "\n" + content : content); setError(""); }
    catch { setError("Não foi possível ler o arquivo. Cole o texto."); }
  }
  return <div className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}>
    <label htmlFor="return-notes" className="label">Cole a devolução ou solte um arquivo .md</label>
    <textarea id="return-notes" name="returnNotes" required rows={6} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Um ponto por linha" />
    <input ref={fileRef} type="file" accept=".md,text/markdown" className="sr-only" aria-label="Arquivo de devolução" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
    <button type="button" className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Escolher .md</button>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <ReturnPointScopes key={round} text={text} />
  </div>;
}

/** Cada ponto numa linha, com "Vale para o canal todo" ou "Só este roteiro" (padrão). Envia `ponto` + `escopo-<i>`. */
function ReturnPointScopes({ text }: { text: string }) {
  const points = returnPoints(text);
  const [scopes, setScopes] = useState<Record<string, "canal" | "roteiro">>({});
  if (!points.length) return <p className="text-xs text-zinc-500">Cada linha vira um ponto. Depois de colar, escolha para cada um se vale para o canal todo ou só para este roteiro.</p>;
  const channel = points.filter((p, i) => scopes[i + "|" + p] === "canal").length;
  return <fieldset className="space-y-2">
    <legend className="label">Para cada ponto: vale para o canal todo ou só para este roteiro?</legend>
    <ol className="space-y-2">
      {points.map((p, i) => {
        const key = i + "|" + p;
        const scope = scopes[key] ?? "roteiro";
        const option = (value: "canal" | "roteiro", label: string) => (
          <label className={"inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs " + (scope === value ? (value === "canal" ? "border-emerald-500 bg-emerald-600/10 text-emerald-200" : "border-zinc-500 bg-zinc-800 text-zinc-100") : "border-line text-zinc-400 hover:text-zinc-200")}>
            <input type="radio" name={"escopo-" + i} value={value} checked={scope === value} onChange={() => setScopes((s) => ({ ...s, [key]: value }))} className="accent-emerald-500" />
            {label}
          </label>
        );
        return <li key={key} className="rounded border border-line px-3 py-2">
          <input type="hidden" name="ponto" value={p} />
          <p className="text-sm text-zinc-200"><span className="mr-2 tabular-nums text-zinc-500">{i + 1}.</span>{p}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">{option("canal", "Vale para o canal todo")}{option("roteiro", "Só este roteiro")}</div>
        </li>;
      })}
    </ol>
    <p className="text-xs text-zinc-500">{channel} {channel === 1 ? "ponto vira regra do canal" : "pontos viram regra do canal"} (entram em todos os formatos) · {points.length - channel} {points.length - channel === 1 ? "fica" : "ficam"} só neste roteiro. A frase é guardada como você escreveu.</p>
  </fieldset>;
}

export function OpenSection({ target, children }: { target: string; children: ReactNode }) {
  return <button type="button" className="btn-primary btn-sm" onClick={() => { const el = document.getElementById(target); if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); el.querySelector("summary")?.focus(); } }}>{children}</button>;
}
