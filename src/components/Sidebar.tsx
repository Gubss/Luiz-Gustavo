"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string; soon?: boolean }[] = [
  { href: "/radar", label: "Radar de outliers" },
  { href: "/nichos", label: "Nichos e canais" },
  { href: "/meus-canais", label: "Meus canais" },
  { href: "/favoritos", label: "Favoritos" },
  { href: "/estudos", label: "Estudos de vídeo" },
  { href: "/descobrir", label: "Descobrir canais" },
  { href: "/cartilha", label: "Cartilha do nicho" },
  { href: "/gerador", label: "Gerador" },
  { href: "/ideias", label: "Banco de ideias" },
  { href: "/meus-videos", label: "Meus vídeos", soon: true },
  { href: "/configuracoes", label: "Configurações", soon: true },
];

export function Sidebar({ quotaUsed, quotaLimit }: { quotaUsed: number; quotaLimit: number }) {
  const path = usePathname();
  const pct = Math.min(100, (quotaUsed / quotaLimit) * 100);
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-3 py-5">
      <Link href="/radar" className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-red-600 text-sm font-black">▶</span>
        <span className="text-lg font-bold tracking-tight">YouTube Radar</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          if (item.soon)
            return (
              <span
                key={item.href}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-600"
                title="Disponível nas próximas etapas"
              >
                {item.label}
                <span className="text-[10px] uppercase">em breve</span>
              </span>
            );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm ${
                active ? "bg-zinc-800 font-medium text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">
        <div className="mb-1 flex justify-between">
          <span>Cota YouTube hoje</span>
          <span className="tabular-nums text-zinc-200">
            {quotaUsed.toLocaleString("pt-BR")} / {quotaLimit.toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
          <div
            className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
