"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Menu na ordem do trabalho: 1 pesquisar o que funciona, 2 criar a ideia e o roteiro, 3 acompanhar o seu canal. */
type Item = { href: string; label: string; hint: string; icon: string };
const NAV: { step: number; group: string; items: Item[] }[] = [
  {
    step: 1,
    group: "Pesquisar",
    items: [
      { href: "/radar", label: "Radar", hint: "Vídeos que estouraram nos canais de referência", icon: "M8 8m-5.5 0a5.5 5.5 0 1011 0 5.5 5.5 0 10-11 0M8 8l3-3" },
      { href: "/favoritos", label: "Favoritos", hint: "Vídeos que você guardou", icon: "M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11.1 4.6 12.9l.7-3.8L2.5 6.5l3.8-.5z" },
      { href: "/descobrir", label: "Descobrir canais", hint: "Achar mais canais de referência", icon: "M7 3a4 4 0 110 8 4 4 0 010-8zM10 10l3.5 3.5" },
      { href: "/nichos", label: "Nichos", hint: "Canais de referência que o Radar acompanha", icon: "M2 4h12M2 8h12M2 12h8" },
      { href: "/estudos", label: "Estudos", hint: "Por que cada vídeo funcionou", icon: "M3 3h7l3 3v7H3zM6 8h5M6 11h5" },
    ],
  },
  {
    step: 2,
    group: "Criar",
    items: [
      { href: "/gerador", label: "Gerador", hint: "Ideias e roteiros no formato do seu canal", icon: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2" },
      { href: "/ideias", label: "Ideias", hint: "Tudo que já foi gerado e em que etapa está", icon: "M5.5 13h5M6 11c0-1.5-2-2.5-2-5a4 4 0 118 0c0 2.5-2 3.5-2 5z" },
      { href: "/formatos", label: "Formatos", hint: "Receitas de vídeo do nicho", icon: "M3 3h4.5a1.5 1.5 0 011.5 1.5V13a1 1 0 00-1-1H3zM13 3H9.5" },
    ],
  },
  {
    step: 3,
    group: "Meu canal",
    items: [
      { href: "/meus-canais", label: "Meus canais", hint: "Perfil do canal e exemplos aprovados", icon: "M3 5h10v7H3zM6 14h4" },
      { href: "/meus-videos", label: "Meus vídeos", hint: "Como os seus vídeos estão indo", icon: "M2.5 13.5h11M4 11V8M7 11V5M10 11V7M13 11V3" },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar({ quotaUsed, quotaLimit }: { quotaUsed: number; quotaLimit: number }) {
  const path = usePathname();
  // No celular o menu fica recolhido atrás do botão "Menu" e fecha sozinho ao trocar de página.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const pct = Math.min(100, (quotaUsed / quotaLimit) * 100);
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-ink px-3 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:border-r md:py-5">
      <div className="flex items-center justify-between gap-2 md:mb-3">
        <Link href="/radar" className="flex items-center gap-2 px-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-red-600 text-sm font-black">▶</span>
          <span className="text-lg font-bold tracking-tight">YouTube Radar</span>
        </Link>
        <button
          type="button"
          className="btn-ghost btn-sm md:hidden"
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpenOn(open ? null : path)}
        >
          {open ? "Fechar" : "Menu"}
        </button>
      </div>
      <div id="menu-principal" className={`${open ? "flex" : "hidden"} mt-3 min-h-0 flex-1 flex-col md:mt-0 md:flex`}>
      <Link
        href="/como-usar"
        className={`mb-3 flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm ${
          path.startsWith("/como-usar") ? "border-red-500/60 bg-red-600/10 font-medium text-white" : "border-line text-zinc-300 hover:border-zinc-600 hover:text-white"
        }`}
      >
        <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">?</span>
        Como usar
      </Link>
      <nav className="flex flex-1 flex-col gap-4 md:overflow-y-auto">
        {NAV.map((g) => (
          <div key={g.group} className="shrink-0">
            <div className="mb-1 flex items-center gap-2 px-3 text-xs font-medium text-zinc-500">
              <span className="grid h-4 w-4 place-items-center rounded-full border border-zinc-700 text-[10px] tabular-nums text-zinc-400">{g.step}</span>
              {g.group}
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = path === item.href || path.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
                      active ? "bg-zinc-800/80 font-medium text-white" : "text-zinc-400 hover:bg-raised hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-red-400" : "text-zinc-500"}>
                      <Icon d={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <Link
        href="/configuracoes"
        title="Chaves, cota, gastos, regras do radar e cópia de segurança"
        className={`mt-2 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
          path.startsWith("/configuracoes") ? "bg-zinc-800 font-medium text-white" : "text-zinc-400 hover:bg-raised hover:text-white"
        }`}
      >
        <span className="text-zinc-500">
          <Icon d="M8 5.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
        </span>
        Configurações
      </Link>
      <Link
        href="/configuracoes#cota"
        title="Ver o que gastou a cota hoje"
        className="mt-2 block rounded-lg border border-line p-3 text-xs text-zinc-400 hover:border-zinc-600"
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-2 whitespace-nowrap">
          <span>Cota do YouTube</span>
          <span className="tabular-nums text-zinc-200">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
          <div
            className={`h-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-zinc-500 tabular-nums">
          {quotaUsed.toLocaleString("pt-BR")} de {quotaLimit.toLocaleString("pt-BR")} hoje
        </div>
      </Link>
      </div>
    </aside>
  );
}
