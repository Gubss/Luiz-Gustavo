"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os números da página de tempos em tempos (sem piscar a tela), para mostrar o que o acompanhamento
 * automático foi gravando. Só quando a aba está visível.
 */
export function AutoRefresh({ everySec = 120 }: { everySec?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everySec * 1000);
    return () => clearInterval(t);
  }, [router, everySec]);
  return null;
}
