"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

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
    const save = () => { try { localStorage.setItem(key, String(el.open)); } catch {} };
    el.addEventListener("toggle", save);
    return () => el.removeEventListener("toggle", save);
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
  const fileRef = useRef<HTMLInputElement>(null);
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
    <p className="text-xs text-zinc-500">Revise o texto antes de salvar. Cada linha vira um aprendizado do canal.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </div>;
}

export function OpenSection({ target, children }: { target: string; children: ReactNode }) {
  return <button type="button" className="btn-primary btn-sm" onClick={() => { const el = document.getElementById(target); if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); el.querySelector("summary")?.focus(); } }}>{children}</button>;
}
