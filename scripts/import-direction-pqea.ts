/** Import literal sem IA, com backup SQLite consistente antes de qualquer escrita. */
import { readFile, mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { extractPqeaStudy } from "../src/lib/direction-study";
const prisma = new PrismaClient();
const vault = "C:/Users/gubsB/Documents/GUBS OS/GUBS OS";
async function main() {
 const study = extractPqeaStudy(await readFile(vault + "/05 - Conteúdo/Canais Dark/Estudo de direção - Por Que É Assim (padrão telefone) - 2026-11-16.md","utf8"));
 const channels = await prisma.myChannel.findMany({where:{name:{equals:"Por que é assim?"}}});
 if(channels.length!==1) throw new Error("Canal PQEA ausente ou ambíguo.");
 const links = await prisma.channelFormat.findMany({where:{myChannelId:channels[0].id},include:{format:true}});
 if(links.length!==1) throw new Error("Formato do canal ambíguo; conferir vínculos antes de importar.");
 const format=links[0].format;
 if(!process.argv.includes("--apply")) { console.log(JSON.stringify({channel:channels[0].name,formatId:format.id,format:format.name,characters:study.length})); return; }
 const directory=vault+"/.maestri/tmp/radar-missao";
 await mkdir(directory,{recursive:true});
 const backup=directory+"/radar-antes-pqea-"+new Date().toISOString().replace(/[:.]/g,"-")+".db";
 await prisma.$executeRawUnsafe("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");
 await prisma.videoFormat.update({where:{id:format.id},data:{directionStudy:study}});
 console.log(JSON.stringify({backup,formatId:format.id,format:format.name,characters:study.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
