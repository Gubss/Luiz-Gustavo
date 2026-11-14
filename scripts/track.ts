/**
 * Acompanhamento dos meus vídeos fora do navegador, para agendar no Agendador de Tarefas do Windows (de hora em hora).
 *   npm run track
 * Os diagnósticos automáticos (se ligados) precisam do app aberto para terminar; este script só atualiza números,
 * marcos e Analytics.
 */
import { trackDue } from "../src/lib/my-videos";
import { prisma } from "../src/lib/db";

trackDue()
  .then((s) => {
    console.log(
      `[${new Date().toLocaleString("pt-BR")}] meus vídeos: ${s.channels} canal(is), ${s.newVideos} vídeo(s) novo(s), ${s.updated} atualizado(s), ${s.checkpoints} marco(s), ${s.analytics} com Analytics`,
    );
    for (const e of s.errors) console.log("  aviso:", e);
  })
  .catch((e) => {
    console.error("Falha no acompanhamento:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
