"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Summary = { status: string; message?: string; errors?: string[] };

async function runCollect(trigger: "auto" | "manual"): Promise<Summary> {
  const res = await fetch("/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger, force: trigger === "manual" }),
  });
  return res.json();
}

/** Na abertura do app: se a última coleta tiver mais de 20h, coleta sozinho. */
export function AutoCollect() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const st = await fetch("/api/collect").then((r) => r.json()).catch(() => null);
      if (!st?.due || st.running) return;
      setMsg("Coletando os dados do dia…");
      const r = await runCollect("auto");
      setMsg(r.status === "error" ? `Erro na coleta: ${r.errors?.join("; ") ?? r.message}` : `${r.message}`);
      router.refresh();
      setTimeout(() => setMsg(null), 8000);
    })();
  }, [router]);
  if (!msg) return null;
  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm shadow-xl">
      {msg}
    </div>
  );
}

export function CollectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="max-w-md text-right text-xs text-zinc-400">{msg}</span>}
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("Coletando… pode levar alguns minutos com muitos canais.");
          const r = await runCollect("manual").catch((e) => ({ status: "error", message: String(e) }) as Summary);
          setMsg(r.status === "error" ? `Erro: ${r.errors?.join("; ") ?? r.message}` : `${r.message}${r.errors?.length ? ` Avisos: ${r.errors.join("; ")}` : ""}`);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Coletando…" : "↻ Coletar agora"}
      </button>
    </div>
  );
}
