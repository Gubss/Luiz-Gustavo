/** Dry run by default. Explicit database target and consistent backup; never seeds/resets. */
import {readFile,mkdir} from "node:fs/promises";
import {PrismaClient} from "@prisma/client";
import {extractPqeaInstructions} from "../src/lib/pqea-instructions";
const vault="C:/Users/gubsB/Documents/GUBS OS/GUBS OS";
async function main(){
 if(!process.env.DATABASE_URL)throw new Error("Informe DATABASE_URL explicitamente.");
 const prisma=new PrismaClient();
 try{
  const data=extractPqeaInstructions(await readFile(vault+"/05 - Conteúdo/Canais Dark/Direção cinematográfica e sonora para IA - v2 piloto - 2026-11-16.md","utf8"),await readFile(vault+"/05 - Conteúdo/Canais Dark/Estudo de direção - Por Que É Assim (padrão telefone) - 2026-11-16.md","utf8"));
  const channels=(await prisma.myChannel.findMany()).filter(c=>c.name.toLocaleLowerCase("pt-BR")==="por que é assim?");
  if(channels.length!==1)throw new Error("Canal ausente ou ambíguo.");
  const links=await prisma.channelFormat.findMany({where:{myChannelId:channels[0].id},include:{format:true}});
  const formats=links.map(l=>l.format).filter(f=>f.name==="Desmontando o Mundo");
  if(formats.length!==1)throw new Error("Formato ausente ou ambíguo.");
  const format=formats[0];const counts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v?.length??0]));
  if(!process.argv.includes("--apply")){console.log(JSON.stringify({dryRun:true,formatId:format.id,counts}));return;}
  const dir=vault+"/.maestri/tmp/radar-missao/instrucoes-funcoes";await mkdir(dir,{recursive:true});
  const backup=dir+"/antes-import-"+new Date().toISOString().replace(/[:.]/g,"-")+".db";
  await prisma.$executeRawUnsafe("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");
  await prisma.videoFormat.update({where:{id:format.id},data});
  const saved=await prisma.videoFormat.findUniqueOrThrow({where:{id:format.id}});
  for(const [key,value] of Object.entries(data))if(saved[key as keyof typeof data]!==value)throw new Error("Verificação falhou: "+key);
  console.log(JSON.stringify({backup,formatId:format.id,counts,verified:true}));
 }finally{await prisma.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
