"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Job = {
  id: string;
  label: string;
  href: string;
  status: string;
  message: string | null;
  progress: number | null;
  step: string | null;
  expectedSec: number | null;
  startedAt: string;
};

/** Barra: usa o progresso real (etapas) e, entre uma etapa e outra, estima pelo tempo típico. Nunca passa de 95% antes de acabar. */
function percent(j: Job, now: number) {
  const byTime = j.expectedSec ? ((now - new Date(j.startedAt).getTime()) / 1000 / j.expectedSec) * 100 : 0;
  return Math.round(Math.min(95, Math.max(j.progress ?? 0, byTime)));
}

function notifyOS(j: Job) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(j.status === "ok" ? `✓ Pronto: ${j.label}` : `✗ Deu erro: ${j.label}`, { body: j.message ?? "", tag: j.id });
    n.onclick = () => {
      window.focus();
      window.location.href = j.href;
    };
  } catch {
    /* navegador sem suporte */
  }
}

const elapsed = (from: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${String(s % 60).padStart(2, "0")}`;
};

/**
 * Aviso no canto da tela com as tarefas do Claude em segundo plano.
 * Confere a cada 3s; quando uma termina, atualiza a página aberta e mostra o resultado com link.
 */
export function JobsWatcher() {
  const router = useRouter();
  const [running, setRunning] = useState<Job[]>([]);
  const [done, setDone] = useState<Job[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const seenRunning = useRef(new Set<string>());
  const [perm, setPerm] = useState<string>("granted");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const jobs: Job[] | null = await fetch("/api/jobs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!alive || !jobs) return;
      setNow(Date.now());
      if (typeof Notification !== "undefined") setPerm(Notification.permission);
      const run = jobs.filter((j) => j.status === "running");
      const finished = jobs.filter((j) => j.status !== "running" && seenRunning.current.has(j.id));
      if (finished.length) {
        for (const j of finished) {
          seenRunning.current.delete(j.id);
          if (document.hidden) notifyOS(j);
        }
        setDone((d) => [...finished, ...d].slice(0, 4));
        router.refresh();
      }
      for (const j of run) seenRunning.current.add(j.id);
      setRunning(run);
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [router]);

  if (!running.length && !done.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2">
      {done.map((j) => (
        <div
          key={j.id}
          className={`rounded-lg border px-4 py-3 text-sm shadow-xl ${j.status === "ok" ? "border-emerald-700 bg-emerald-950" : "border-red-800 bg-red-950"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">
                {j.status === "ok" ? "✓ Pronto" : "✗ Deu erro"}: {j.label}
              </div>
              {j.message && <div className="mt-0.5 text-xs text-zinc-300">{j.message}</div>}
              <Link href={j.href} className="mt-1 inline-block text-xs text-red-300 hover:underline" onClick={() => setDone((d) => d.filter((x) => x.id !== j.id))}>
                Abrir →
              </Link>
            </div>
            <button className="text-zinc-400 hover:text-white" onClick={() => setDone((d) => d.filter((x) => x.id !== j.id))} aria-label="Fechar">
              ×
            </button>
          </div>
        </div>
      ))}
      {running.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm shadow-xl">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Rodando em segundo plano · pode usar o app normalmente</div>
          <ul className="space-y-2">
            {running.map((j) => {
              const pct = percent(j, now);
              return (
                <li key={j.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
                    <Link href={j.href} className="min-w-0 flex-1 truncate hover:underline">
                      {j.label}
                    </Link>
                    <span className="text-xs tabular-nums text-zinc-400">{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800">
                    <div className="h-full bg-amber-400 transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[11px] text-zinc-500">
                    <span>{j.step ?? ""}</span>
                    <span className="tabular-nums">{elapsed(j.startedAt, now)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {perm === "default" && (
            <button
              className="mt-2 text-xs text-red-300 hover:underline"
              onClick={() => Notification.requestPermission().then(setPerm)}
            >
              Avisar também pelo Windows quando terminar (se eu estiver em outra aba)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
