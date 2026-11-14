/**
 * Roda uma vez quando o servidor do app liga (npm run dev / npm start).
 * Liga o acompanhamento dos meus vídeos: a cada 5 minutos confere o que está na hora (marcos de 1h, 3h, 24h…).
 * No mesmo relógio faz a cópia de segurança semanal do banco. As duas coisas podem ser desligadas em Configurações.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.RADAR_NO_TRACKER) return;
  const g = globalThis as unknown as { __radarTracker?: NodeJS.Timeout };
  if (g.__radarTracker) return; // já ligado (recarregamento do código em desenvolvimento)
  const tick = async () => {
    const { getSettings } = await import("./lib/settings");
    const settings = await getSettings().catch(() => null);
    if (settings?.autoBackup) {
      try {
        const { backupIfDue } = await import("./lib/backup");
        const b = await backupIfDue();
        if (b) console.log(`[cópia de segurança] ${b.name} (${(b.bytes / 1_048_576).toFixed(1)} MB)`);
      } catch (e) {
        console.error("[cópia de segurança] falhou:", e instanceof Error ? e.message : e);
      }
    }
    if (settings && !settings.tracker) return; // acompanhamento desligado em Configurações
    try {
      const { runTracker } = await import("./lib/tracker");
      const s = await runTracker();
      if (s.newVideos || s.checkpoints || s.diagnoses || s.errors.length)
        console.log(
          `[meus vídeos] ${s.newVideos} novo(s), ${s.updated} atualizado(s), ${s.checkpoints} marco(s), ${s.analytics} Analytics, ${s.diagnoses} diagnóstico(s)${s.errors.length ? ` · avisos: ${s.errors.join("; ")}` : ""}`,
        );
    } catch (e) {
      console.error("[meus vídeos] falha no acompanhamento:", e instanceof Error ? e.message : e);
    }
  };
  g.__radarTracker = setInterval(tick, 5 * 60_000);
  setTimeout(tick, 20_000);
}
