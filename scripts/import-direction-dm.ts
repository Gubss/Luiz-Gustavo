import { readFile, mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { extractDmStudy } from "../src/lib/direction-study";

const prisma = new PrismaClient();
const vault = "C:/Users/gubsB/Documents/GUBS OS/GUBS OS";
async function main() {
  if (process.argv.includes("--backup")) {
    const directory = `${vault}/.maestri/tmp/radar-missao`;
    await mkdir(directory, { recursive: true });
    const file = `${directory}/radar-antes-direcao-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
    await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`Backup íntegro: ${file}`);
    return;
  }
  const note = await readFile(`${vault}/05 - Conteúdo/Canais Dark/Estudo - como o Desmontando o Mundo anima - 2026-11-15.md`, "utf8");
  const directionStudy = extractDmStudy(note);
  const formats = await prisma.videoFormat.findMany({ where: { name: { contains: "Desmontando" } } });
  if (formats.length !== 1) throw new Error(`Esperado um formato Desmontando o Mundo; encontrados ${formats.length}.`);
  const format = await prisma.videoFormat.update({ where: { id: formats[0].id }, data: { directionStudy } });
  console.log(JSON.stringify({ id: format.id, name: format.name, characters: directionStudy.length, rules: 14 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
