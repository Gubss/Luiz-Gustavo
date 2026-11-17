import {test,before} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {withSse} from "./anthropic-sse";
process.env.DATABASE_URL="file:./test-directors-"+process.pid+".db";
process.env.ANTHROPIC_API_KEY="sk-ant-test";
execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,stdio:"ignore",windowsHide:true});
const D=()=>import("../src/lib/directors");
let mode="ok";let called=0;const requests:{system:string;user:string}[]=[];
let during:undefined|(()=>Promise<void>);
const scenes={cenas:[{id:"C01",falaInicial:1,falaFinal:2,intencao:"Surpresa",atuacao:"Olha",posicoes:"Mesa",movimento:"Puxa fio",continuidade:"Fio na mão",ritmo:"Pausa"}],pendencias:[]};
const photos={cenas:[{cenaId:"C01",plano:"Médio",camera:"Fixa",luz:"Janela",cor:"Canônica",composicao:"Mãos visíveis",transicao:"Continuidade"}],pendencias:[]};
const sounds={falas:[1,2].map(falaId=>({falaId,intencao:"Contar",entrega:"Natural",pausas:"Respiração"})),cenas:[{cenaId:"C01",ambiencia:"Sala",foley:"Fio",efeitos:"Nenhum",musica:"Baixa",mixagem:"Voz primeiro"}],pendencias:[]};
before(()=>{globalThis.fetch=withSse(async(url,init)=>{
 assert.match(String(url),/api.anthropic.com\/v1\/messages/);called++;
 const b=JSON.parse(String(init?.body));const user=b.messages[0].content.map((c:{text?:string})=>c.text??"").join("");requests.push({system:b.system,user});
 if(during){const f=during;during=undefined;await f();}
 const reply=b.system.includes("Defina encenação")?scenes:b.system.includes("Receba a encenação")?(mode==="bad-photo"?{...photos,cenas:[{...photos.cenas[0],cenaId:"WRONG"}]}:photos):sounds;
 return new Response(JSON.stringify({id:"msg_test",type:"message",role:"assistant",model:"claude-opus-5-5",content:[{type:"text",text:JSON.stringify(reply)}],stop_reason:"end_turn",stop_sequence:null,usage:{input_tokens:100,output_tokens:100}}),{status:200,headers:{"content-type":"application/json"}});
}) as typeof fetch;});
async function fixture(study=true){
 const {prisma}=await import("../src/lib/db");const {appendVersion}=await import("../src/lib/script-versions");
 const n=await prisma.niche.create({data:{name:"Teste"}});const f=await prisma.videoFormat.create({data:{name:"Formato",nicheId:n.id,directionStudy:study?"## A. História\nNARRATIVA_NAO_ENTRA\n## B. Direção\nLuz motivada\n## C. Canal\nManter kit":null}});
 const ch=await prisma.myChannel.create({data:{name:"Canal",nicheId:n.id,characters:"Menino"}});
 const idea=await prisma.idea.create({data:{theme:"Fio",titles:"[]",format:"short",formatId:f.id,myChannelId:ch.id}});
 const content=JSON.stringify({titulo:"Fio",duracaoSeg:70,falado:[{personagem:"Menino",fala:"Eu puxei o fio."},{personagem:"Avó",fala:"Era meu casaco!"}],cenas:[],channelReference:{name:"Canal",characters:"Menino e Avó",rules:"Não mudar vozes"}});
 const version=await appendVersion({ideaId:idea.id,expectedVersionId:null,content,markdown:()=>"FALAS ORIGINAIS",category:"história",origin:"test"});return {prisma,idea,version,content};
}
test("aprovação, dependências, falha parcial, cobertura, imutabilidade e exportação",async()=>{
 const {runDirector,estimateDirection}=await D();const {approveVersion}=await import("../src/lib/script-versions");const {ideaExport}=await import("../src/lib/script-export");
 const {prisma,idea,version,content}=await fixture();const before=called;
 await assert.rejects(runDirector(idea.id,version.id,"scene"),/aprovada/);assert.equal(called,before);
 await approveVersion(idea.id,version.id);assert.equal(called,before);
 assert.ok((await estimateDirection(idea.id,version.id))!.usd>0);assert.equal(called,before);
 await assert.rejects(runDirector(idea.id,version.id,"sound"),/próxima etapa/);assert.equal(called,before);
 await runDirector(idea.id,version.id,"scene");assert.doesNotMatch(requests.at(-1)!.user,/NARRATIVA_NAO_ENTRA/);
 mode="bad-photo";await assert.rejects(runDirector(idea.id,version.id,"photography"),/vínculos/);
 const partial=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});assert.ok(partial.scene);assert.equal(partial.photography,null);assert.equal(partial.runningStage,null);assert.ok(partial.error);
 mode="ok";await runDirector(idea.id,version.id,"photography");assert.match(requests.at(-1)!.user,/encenacao/);
 await runDirector(idea.id,version.id,"sound");assert.match(requests.at(-1)!.user,/fotografia/);
 const paid=called;await runDirector(idea.id,version.id,"integration");assert.equal(called,paid);
 assert.equal((await prisma.scriptVersion.findUniqueOrThrow({where:{id:version.id}})).content,content);
 assert.equal((await prisma.scriptVersion.findUniqueOrThrow({where:{id:version.id}})).markdown,"FALAS ORIGINAIS");
 const exported=(await ideaExport(idea.id))!;assert.match(exported,/Direção integrada/);assert.match(exported,/estimados/);assert.match(exported,/C01/);
 await assert.rejects(runDirector(idea.id,version.id,"scene"),/próxima etapa/);assert.equal(called,paid);
});
test("sem estudo, correção, versão antiga e alteração durante chamada",async()=>{
 const {runDirector}=await D();const {approveVersion,appendVersion}=await import("../src/lib/script-versions");
 const empty=await fixture(false);await approveVersion(empty.idea.id,empty.version.id);const before=called;await assert.rejects(runDirector(empty.idea.id,empty.version.id,"scene"),/Sem estudo/);assert.equal(called,before);
 const {prisma,idea,version,content}=await fixture();await approveVersion(idea.id,version.id);
 during=async()=>{await appendVersion({ideaId:idea.id,expectedVersionId:version.id,content:content.replace('fio.','fio azul.'),markdown:()=>"Nova",category:"história",origin:"correction"});};
 await assert.rejects(runDirector(idea.id,version.id,"scene"),/aprovada/);
 assert.equal((await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}})).scene,null);
 await assert.rejects(runDirector(idea.id,version.id,"scene"),/aprovada/);
 const current=(await prisma.idea.findUniqueOrThrow({where:{id:idea.id}})).currentVersionId!;
 await assert.rejects(runDirector(idea.id,current,"scene"),/aprovada/);
});
test("schemas rejeitam texto falado novo; cenas agrupam falas; vínculos não podem sumir",async()=>{
 const {SceneSchema,SoundSchema,validateCoverage,validateSound,integrate}=await D();
 assert.throws(()=>SceneSchema.parse({...scenes,falado:[{fala:"Reescrita"}]}));
 assert.throws(()=>SoundSchema.parse({...sounds,falas:[{...sounds.falas[0],fala:"Reescrita"}]}));
 validateCoverage(scenes.cenas,2);assert.throws(()=>validateCoverage(scenes.cenas,3));
 assert.throws(()=>validateSound({...sounds,falas:[sounds.falas[0]]},scenes,2));
 const integrated=integrate(JSON.stringify({duracaoSeg:70,falado:[{personagem:"M",fala:"Um"},{personagem:"M",fala:"Dois"}]}),scenes,photos,sounds);
 assert.equal(integrated.cenas.length,1);assert.equal(integrated.cenas[0].fimEstimado,70);
});
