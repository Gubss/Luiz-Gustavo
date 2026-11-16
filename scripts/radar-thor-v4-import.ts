import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {prisma} from "../src/lib/db";
import {ensureProjectCode} from "../src/lib/script-versions";
import {exportScript} from "../src/lib/script-export";
import type {ScriptContent} from "../src/lib/generator";
async function main(){
 const dir=process.env.RADAR_EVIDENCE_DIR!;if(!dir)throw new Error("RADAR_EVIDENCE_DIR obrigatório");
 const marker=join(dir,"thor-v4-case.json");try{const existing=JSON.parse(await readFile(marker,"utf8"));const idea=await prisma.idea.findUniqueOrThrow({where:{id:existing.id}});await prisma.idea.update({where:{id:idea.id},data:{ideaData:JSON.stringify({adaptacao:{daCartilha:"",doCanal:"Transcrição Thor V3"},...JSON.parse(idea.ideaData??"{}")})}});console.log(JSON.stringify(existing));return}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e}
 const source=JSON.parse(await readFile(join(dir,"thor-v3-base.json"),"utf8"));
 const channel=await prisma.myChannel.findFirstOrThrow({where:{name:"Por Que É Assim?"}});
 const format=await prisma.videoFormat.findFirstOrThrow({where:{nicheId:channel.nicheId!,name:"Historinha com regra absurda"}});
 const template=await prisma.idea.findFirstOrThrow({where:{myChannelId:channel.id,formatId:format.id,currentVersionId:{not:null}},orderBy:{createdAt:"desc"}});
 const ref=JSON.parse(template.scriptData!).channelReference;
 const data={titulo:"Thor — neste mundo os cachorros entendem tudo ao contrário",duracaoSeg:108,falado:source.falado,cenas:[],pendencias:[],channelReference:ref} as unknown as ScriptContent;
 const idea=await prisma.idea.create({data:{myChannelId:channel.id,nicheId:channel.nicheId,formatId:format.id,format:"short",theme:data.titulo,chosenTitle:data.titulo,titles:"[]",ideaData:JSON.stringify({adaptacao:{daCartilha:"",doCanal:"Transcrição Thor V3"},premissa:"Cada vem cá empurra Thor para longe; se passar da esquina, não volta. O menino tenta resgatá-lo; bola na beirada da esquina é o clímax. Preservar a história Thor V3, não inventar outro episódio."}),notes:"Regressão real solicitada pelo Gubs: transcrição Thor V3 em "+source.source,status:"SCRIPT"}});
 const code=await ensureProjectCode(idea.id);
 const v=await prisma.scriptVersion.create({data:{ideaId:idea.id,number:3,content:JSON.stringify(data),markdown:exportScript(data,ref,code,3),origin:"legacy",category:"história",author:"importação V3",request:"Transcrição fiel do MP4 V3. Identificação de vozes via tempos.json e montar-thor.py. V1/V2 não importadas."}});
 await prisma.idea.update({where:{id:idea.id},data:{currentVersionId:v.id,scriptData:v.content,script:v.markdown}});
 const out={id:idea.id,projectCode:code,baseVersionId:v.id,lineCount:source.falado.length,source:source.source};await writeFile(marker,JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
