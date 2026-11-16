import {mkdir,writeFile,access} from "node:fs/promises";
import {join,resolve} from "node:path";
import assert from "node:assert/strict";
import {prisma} from "../src/lib/db";
import {generateIdeas,generateScript} from "../src/lib/generator";
import {costUsd} from "../src/lib/claude";
async function main(){
 if(process.env.RADAR_REAL_TEST!=="1")throw new Error("Opt-in necessário: RADAR_REAL_TEST=1; chamadas pagas até US$5.");
 const dir=resolve(process.env.RADAR_EVIDENCE_DIR??".maestri/tmp/radar-regression");await mkdir(dir,{recursive:true});
 const marker=join(dir,"run.json");try{await access(marker);throw new Error("Regressão já iniciada; não repetir chamadas. Consulte run.json.");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 const since=new Date();const ids:string[]=[];await writeFile(marker,JSON.stringify({since,ids,status:"running"},null,2));
 const budgetSince=process.env.RADAR_BUDGET_SINCE?new Date(process.env.RADAR_BUDGET_SINCE):since;
 let reserved=(await prisma.generation.aggregate({where:{createdAt:{gte:budgetSince}},_sum:{costUsd:true}}))._sum.costUsd??0;const native=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.hostname==="api.anthropic.com"){
 const body=JSON.parse(String(init?.body));const upper=costUsd(body.model,Buffer.byteLength(JSON.stringify(body))+2048,body.max_tokens);
 if(reserved+upper>5)throw new Error("Teto de US$5: reserva conservadora insuficiente; chamada bloqueada.");reserved+=upper;
 await writeFile(join(dir,"request-"+Date.now()+".json"),JSON.stringify({system:body.system,messages:body.messages,max_tokens:body.max_tokens,model:body.model,upper},null,2));
 }return native(input,init);};
 try{
 const channel=await prisma.myChannel.findFirstOrThrow({where:{name:"Por Que É Assim?"}});
 for(const scenario of [{name:"Thor",format:"Historinha com regra absurda",prompt:"Neste mundo, os cachorros entendem tudo ao contrário. Thor é o cachorro da família; quando alguém diz vem cá, ele se afasta. Preserve essa regra central. Sugira só a premissa e um gancho, sem definir final ou acontecimentos."},{name:"Construção",format:"Construir resolvendo problemas",prompt:"O menino quer montar um comedouro que não espalhe ração no chão da cozinha. Cada tentativa resolve um problema e revela o próximo. Ideia enxuta, não fixe cenas, piadas nem final."}]){
 const format=await prisma.videoFormat.findFirstOrThrow({where:{nicheId:channel.nicheId!,name:scenario.format}});
 const result=await generateIdeas({myChannelId:channel.id,formatId:format.id,count:1,ponto:scenario.prompt});const idea=result.ideas[0];ids.push(idea.id);
 await writeFile(marker,JSON.stringify({since,ids,status:"running"},null,2));
 const script=await generateScript(idea.id,{noRecipeOk:true});
 assert.equal(script.version.number,1);assert.equal(await prisma.scriptVersion.count({where:{ideaId:idea.id}}),1);
 assert.match(script.idea.script!,/Referência do canal/);assert.doesNotMatch(script.idea.script!,/\[x\]|Pendências:\*\* nenhuma/);
 await writeFile(join(dir,scenario.name+".md"),script.idea.script!);
 }
 const generations=await prisma.generation.findMany({where:{createdAt:{gte:since}},orderBy:{createdAt:"asc"}});
 assert.deepEqual(generations.filter(g=>g.kind!=="script-correction").map(g=>g.kind),["ideas","script","ideas","script"]);
 const cost=generations.reduce((s,g)=>s+(g.costUsd??0),0);assert.ok(cost<=5);
 await writeFile(marker,JSON.stringify({since,ids,status:"generated",cost,reserved},null,2));
 console.log(JSON.stringify({ids,cost,reserved}));
 }finally{
 const calls=await prisma.generation.findMany({where:{createdAt:{gte:since}},orderBy:{createdAt:"asc"}});
 await writeFile(join(dir,"calls.json"),JSON.stringify(calls,null,2));
 console.log("Custo registrado: US$ "+calls.reduce((s,g)=>s+(g.costUsd??0),0).toFixed(6));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
