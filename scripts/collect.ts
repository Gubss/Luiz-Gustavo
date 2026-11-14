/**
 * Coleta diária fora do navegador, para agendar no Agendador de Tarefas do Windows.
 *   npm run collect          -> coleta só o que tem mais de 20h
 *   npm run collect -- --force -> coleta tudo agora
 */
import { collectAll } from "../src/lib/collect";
import { prisma } from "../src/lib/db";

const force = process.argv.includes("--force");
collectAll({ trigger: "script", force })
  .then((s) => {
    console.log(`[${new Date().toLocaleString("pt-BR")}] ${s.status}: ${s.message}`);
    for (const e of s.errors) console.log("  aviso:", e);
  })
  .catch((e) => {
    console.error("Falha na coleta:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
