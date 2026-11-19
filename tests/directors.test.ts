import {test,before} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {withSse} from "./anthropic-sse";
process.env.DATABASE_URL="file:./test-directors-"+process.pid+".db";
process.env.ANTHROPIC_API_KEY="sk-ant-test";
execFileSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,stdio:"ignore",windowsHide:true});
const D=()=>import("../src/lib/directors");
let mode="ok";let fixMode="ok";let called=0;const requests:{system:string;user:string;maxTokens:number}[]=[];
let during:undefined|(()=>Promise<void>);
const scenes={cenas:[{id:"C01",falaInicial:1,falaFinal:2,intencao:"Surpresa",atuacao:"Olha",posicoes:"Mesa",movimento:"Puxa fio",continuidade:"Fio na mão",ritmo:"Pausa"}],pendencias:[]};
const photos={cenas:[{cenaId:"C01",plano:"Médio",camera:"Fixa",luz:"Janela",cor:"Canônica",composicao:"Mãos visíveis",transicao:"Continuidade"}],pendencias:[]};
const sounds={falas:[1,2].map(falaId=>({falaId,intencao:"Contar",entrega:"Natural",pausas:"Respiração"})),cenas:[{cenaId:"C01",ambiencia:"Sala",foley:"Fio",efeitos:"Nenhum",musica:"Baixa",mixagem:"Voz primeiro"}],pendencias:[]};
before(()=>{globalThis.fetch=withSse(async(url,init)=>{
 assert.match(String(url),/api.anthropic.com\/v1\/messages/);called++;
 const b=JSON.parse(String(init?.body));const user=b.messages[0].content.map((c:{text?:string})=>c.text??"").join("");requests.push({system:b.system,user,maxTokens:b.max_tokens});
 if(during){const f=during;during=undefined;await f();}
 // Replies follow the script length so long scripts (31 falas) can run through the whole pipeline; 4+ falas → two scenes.
 const u=JSON.parse(user);const n=u.roteiro.length as number;
 const ranges=n>=4?[[1,2],[3,n]]:[[1,n]];const ids=ranges.map((_,i)=>(fixMode==="regroup"?"C1":"C0")+(i+1));
 const sc={...scenes,cenas:ranges.map(([a,z],i)=>({...scenes.cenas[0],id:ids[i],falaInicial:a,falaFinal:z}))};
 const sceneIds=sc.cenas.map(c=>c.id);
 const ph={...photos,cenas:sceneIds.map(cenaId=>({...photos.cenas[0],cenaId}))};
 const so={...sounds,falas:Array.from({length:n},(_,i)=>({...sounds.falas[0],falaId:i+1})),cenas:sceneIds.map(cenaId=>({...sounds.cenas[0],cenaId}))};
 const kind=b.system.includes("Defina encenação")?"scene":b.system.includes("Receba a encenação")?"photo":"sound";
 let reply:unknown=kind==="scene"?sc:kind==="photo"?(mode==="bad-photo"?{...photos,cenas:[{...photos.cenas[0],cenaId:"WRONG"}]}:ph):so;
 if(b.system.includes("CORREÇÃO DA DIREÇÃO")&&u.alvo!=="toda a etapa"){
  const cur=u.resultadoAtual;const t=u.alvo as string;
  const base=kind==="scene"?cur.cenas.find((c:{id:string})=>c.id===t):cur.cenas.find((c:{cenaId:string})=>c.cenaId===t);
  const cena=kind==="scene"?{...base,intencao:"Corrigida",falaFinal:fixMode==="bad-range"?base.falaFinal+1:base.falaFinal}:kind==="photo"?{...base,luz:"Corrigida"}:{...base,musica:"Corrigida"};
  const range=u.encenacao?.cenas?.find((c:{id:string})=>c.id===t);
  reply=kind==="sound"?{falas:cur.falas.filter((f:{falaId:number})=>f.falaId>=range.falaInicial&&f.falaId<=range.falaFinal).map((f:object)=>({...f,entrega:"Corrigida"})),cena,pendencias:["nova"]}:{cena,pendencias:[]};
 }
 return new Response(JSON.stringify({id:"msg_test",type:"message",role:"assistant",model:"claude-opus-5-5",content:[{type:"text",text:JSON.stringify(reply)}],stop_reason:"end_turn",stop_sequence:null,usage:{input_tokens:100,output_tokens:100}}),{status:200,headers:{"content-type":"application/json"}});
}) as typeof fetch;});
async function fixture(study=true,lines=2){
 const {prisma}=await import("../src/lib/db");const {appendVersion}=await import("../src/lib/script-versions");
 const n=await prisma.niche.create({data:{name:"Teste"}});const f=await prisma.videoFormat.create({data:{name:"Formato",nicheId:n.id,directionGeneral:study?"GENERAL_ONLY":null,directionScene:study?"SCENE_ONLY":null,directionPhotography:study?"PHOTO_ONLY":null,directionSound:study?"SOUND_ONLY":null,directionStudy:study?"## A. História\nNARRATIVA_NAO_ENTRA\n## B. Direção\nLuz motivada\n## C. Canal\nManter kit":null}});
 const ch=await prisma.myChannel.create({data:{name:"Canal",nicheId:n.id,characters:"Menino"}});
 const idea=await prisma.idea.create({data:{theme:"Fio",titles:"[]",format:"short",formatId:f.id,myChannelId:ch.id}});
 const base=[{personagem:"Menino",fala:"Eu puxei o fio."},{personagem:"Avó",fala:"Era meu casaco!"}];
 const falado=lines===2?base:Array.from({length:lines},(_,i)=>({personagem:i%2?"Avó":"Menino",fala:"Fala número "+(i+1)+" da pipa."}));
 const content=JSON.stringify({titulo:"Fio",duracaoSeg:lines===2?70:125,falado,cenas:[],channelReference:{name:"Canal",characters:"Menino e Avó",rules:"Não mudar vozes"}});
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
 assert.match((await ideaExport(idea.id))!,/aguardando aprovação/);
 await (await D()).approveDirection(idea.id,version.id);
 const exported=(await ideaExport(idea.id))!;assert.match(exported,/Direção integrada/);assert.match(exported,/estimados/);assert.match(exported,/C01/);
 await assert.rejects(runDirector(idea.id,version.id,"scene"),/próxima etapa/);assert.equal(called,paid);
});
test("sem estudo, correção, versão antiga e alteração durante chamada",async()=>{
 const {runDirector}=await D();const {approveVersion,appendVersion}=await import("../src/lib/script-versions");
 const empty=await fixture(false);await approveVersion(empty.idea.id,empty.version.id);const before=called;await assert.rejects(runDirector(empty.idea.id,empty.version.id,"scene"),/Preencha/);assert.equal(called,before);
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

test("separação literal por função e execução sequencial com retomada sem refazer",async()=>{
 const {runDirectionPipeline,estimateDirectionPipeline,approveDirection}=await D();
 const {approveVersion}=await import("../src/lib/script-versions");
 const {prisma,idea,version}=await fixture();
 await approveVersion(idea.id,version.id);
 const before=called;const estimate=await estimateDirectionPipeline(idea.id,version.id);
 assert.equal(estimate.calls,3);assert.ok(estimate.usdMax>estimate.usd);assert.equal(called,before);
 await assert.rejects(approveDirection(idea.id,version.id),/No.*found|Conclua|not found/i);
 mode="bad-photo";
 await assert.rejects(runDirectionPipeline(idea.id,version.id),/vínculos/);
 const partial=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.ok(partial.scene);assert.equal(partial.sound,null);assert.equal(partial.approvedAt,null);
 const resumedEstimate=await estimateDirectionPipeline(idea.id,version.id);assert.equal(resumedEstimate.calls,2);
 mode="ok";const restart=called;await runDirectionPipeline(idea.id,version.id);
 assert.equal(called-restart,2);
 const final=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.equal(final.scene,partial.scene);assert.ok(final.integration);assert.equal(final.approvedAt,null);
 for(const r of requests.slice(before)){
  assert.match(r.user,/GENERAL_ONLY/);assert.doesNotMatch(r.user,/NARRATIVA_NAO_ENTRA/);
  const stage=r.system.includes("Defina encenação")?"SCENE_ONLY":r.system.includes("Receba a encenação")?"PHOTO_ONLY":"SOUND_ONLY";
  assert.match(r.user,new RegExp(stage));for(const other of ["SCENE_ONLY","PHOTO_ONLY","SOUND_ONLY"].filter(x=>x!==stage))assert.doesNotMatch(r.user,new RegExp(other));
 }
 await approveDirection(idea.id,version.id);
 assert.ok((await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}})).approvedAt);
});

test("adendo A: pedidos de correção do roteiro (v2, v3) entram no prompt dos diretores; restaurar volta à cadeia da versão restaurada",async()=>{
 const {runDirector,scriptIntentions,directionRequest}=await D();const {appendVersion,approveVersion,restoreVersion}=await import("../src/lib/script-versions");
 const {idea,version,content}=await fixture(true,4);
 const PIPA="avó segurando a linha da pipa dela, que já tá no altão bem acima das outras";
 const v2=await appendVersion({ideaId:idea.id,expectedVersionId:version.id,content:content.replace("Fala número 4","Ganhou"),markdown:()=>"v2",request:PIPA,category:"história",origin:"correction"});
 const v3=await appendVersion({ideaId:idea.id,expectedVersionId:v2.id,content:content.replace("Fala número 4","Ganhou... esses dois."),markdown:()=>"v3",request:"fala só 'Ganhou... esses dois.' e ri; a imagem conta a piada",category:"história",origin:"correction"});
 assert.deepEqual(await scriptIntentions(v3.id),[PIPA,"fala só 'Ganhou... esses dois.' e ri; a imagem conta a piada"]);
 await approveVersion(idea.id,v3.id);
 const before=requests.length;await runDirector(idea.id,v3.id,"scene");
 const sent=requests.slice(before).at(-1)!;
 assert.match(sent.system,/INTENÇÕES DO GUBS/);assert.ok(sent.system.indexOf("INTENÇÕES DO GUBS")<sent.system.indexOf("Defina encenação"),"acima da tarefa genérica");
 assert.deepEqual(JSON.parse(sent.user).intencoesDoGubs,[PIPA,"fala só 'Ganhou... esses dois.' e ri; a imagem conta a piada"]);
 // Restaurar a v2 leva só os pedidos da cadeia da v2.
 const v4=await restoreVersion(idea.id,v2.id,v3.id);assert.deepEqual(await scriptIntentions(v4.id),[PIPA]);
 // Sem correções o pedido não muda (nem bloco de intenções).
 const plain=directionRequest("scene",content,await (await D()).initialContext(idea.id,content));
 assert.doesNotMatch(plain.system,/INTENÇÕES/);assert.equal(JSON.parse(plain.user).intencoesDoGubs,undefined);
});

test("adendo B: corrigir só uma cena da direção guarda a anterior, marca as etapas seguintes e libera a aprovação depois de refazer",async()=>{
 const {runDirectionPipeline,correctDirection,estimateDirectionCorrection,approveDirection,parseStale,parseHistory,nextStage}=await D();
 const {approveVersion}=await import("../src/lib/script-versions");
 const {prisma,idea,version}=await fixture(true,4);await approveVersion(idea.id,version.id);
 await runDirectionPipeline(idea.id,version.id);
 const ready=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.deepEqual(JSON.parse(ready.scene!).cenas.map((c:{id:string})=>c.id),["C01","C02"]);
 let before=called;const est=await estimateDirectionCorrection(idea.id,version.id,"scene","C02");assert.equal(called,before);assert.ok(est.usdMax>est.usd);
 await assert.rejects(estimateDirectionCorrection(idea.id,version.id,"scene","C99"),/Cena não encontrada/);

 // Corrige a encenação da C02.
 before=requests.length;await correctDirection(idea.id,version.id,"scene","C02","avó segurando a linha da pipa no altão");
 const fix=requests.at(-1)!;assert.equal(requests.length-before,1);
 assert.match(fix.system,/refaça somente a cena C02/);assert.equal(JSON.parse(fix.user).pedidoDeCorrecao,"avó segurando a linha da pipa no altão");assert.equal(fix.maxTokens,32000);
 let run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 const sc=JSON.parse(run.scene!).cenas;assert.equal(sc[0].intencao,"Surpresa");assert.equal(sc[1].intencao,"Corrigida");
 assert.deepEqual(parseStale(run),[{stage:"photography",target:"C02"},{stage:"sound",target:"C02"}]);
 const hist=parseHistory(run);assert.equal(hist.length,1);assert.equal(hist[0].value,ready.scene);assert.equal(hist[0].target,"C02");
 assert.equal(run.approvedAt,null);assert.match(run.integration!,/Corrigida/);assert.equal(run.photography,ready.photography);
 await assert.rejects(approveDirection(idea.id,version.id),/desatualizadas/);

 // Refaz a fotografia da C02 (sem pedido): som continua marcado.
 await correctDirection(idea.id,version.id,"photography","C02","");
 assert.match(JSON.parse(requests.at(-1)!.user).pedidoDeCorrecao,/etapa anterior foi corrigida/);
 run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.deepEqual(parseStale(run),[{stage:"sound",target:"C02"}]);assert.equal(JSON.parse(run.photography!).cenas[1].luz,"Corrigida");assert.equal(JSON.parse(run.photography!).cenas[0].luz,"Janela");

 // Refaz o som da C02: só as falas 3 e 4 mudam.
 await correctDirection(idea.id,version.id,"sound","C02","");
 run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.deepEqual(parseStale(run),[]);
 assert.deepEqual(JSON.parse(run.sound!).falas.map((f:{entrega:string})=>f.entrega),["Natural","Natural","Corrigida","Corrigida"]);
 assert.equal(parseHistory(run).length,3);
 await approveDirection(idea.id,version.id);

 // Resposta que muda o intervalo da cena é recusada sem estragar nada nem travar.
 fixMode="bad-range";const kept=(await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}}));
 await assert.rejects(correctDirection(idea.id,version.id,"scene","C01","x"),/intervalo/);
 run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.equal(run.scene,kept.scene);assert.equal(run.runningStage,null);assert.equal(run.error,null);assert.ok(run.approvedAt,"falha na correção não derruba a aprovação");

 // Etapa inteira reagrupando cenas: fotografia e som voltam para o fluxo normal.
 fixMode="regroup";await correctDirection(idea.id,version.id,"scene","all","reagrupar");
 run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});
 assert.equal(run.photography,null);assert.equal(run.sound,null);assert.equal(run.integration,null);assert.equal(nextStage(run),"photography");assert.deepEqual(parseStale(run),[]);
 fixMode="ok";
});

test("roteiro de 31 falas (~2 min): diretores pedem o teto novo, som cresce com as falas e a estimativa usa o mesmo teto",async()=>{
 const {runDirectionPipeline,estimateDirectionPipeline,estimateDirection,directionMaxTokens,DIRECTION_MIN_MAX_TOKENS}=await D();
 const {costUsd,estimateCost}=await import("../src/lib/claude");
 const {approveVersion}=await import("../src/lib/script-versions");
 assert.equal(DIRECTION_MIN_MAX_TOKENS,32000);
 assert.equal(directionMaxTokens("scene",31),32000);assert.equal(directionMaxTokens("photography",31),32000);
 assert.equal(directionMaxTokens("sound",31),51000);assert.equal(directionMaxTokens("sound",2),32000);assert.equal(directionMaxTokens("sound",200),64000);
 const {prisma,idea,version}=await fixture(true,31);await approveVersion(idea.id,version.id);
 const before=called;
 const single=(await estimateDirection(idea.id,version.id))!;
 assert.ok(Math.abs(single.usdMax-single.usd-costUsd(single.model,0,32000-6000))<1e-9);
 const est=await estimateDirectionPipeline(idea.id,version.id);assert.equal(called,before);assert.equal(est.calls,3);
 const oldCeiling=estimateCost(est.model,"",6000,16000);assert.ok(est.usdMax-est.usd>3*(oldCeiling.usdMax-oldCeiling.usd));
 const start=requests.length;await runDirectionPipeline(idea.id,version.id);assert.equal(called-before,3);
 const sent=requests.slice(start).map(r=>r.maxTokens);assert.deepEqual(sent,[32000,32000,51000]);
 const sound=requests.at(-1)!;assert.match(sound.system,/só pelo falaId/);assert.equal(JSON.parse(sound.user).roteiro.length,31);
 const run=await prisma.directionRun.findUniqueOrThrow({where:{versionId:version.id}});assert.ok(run.integration);assert.equal(JSON.parse(run.sound!).falas.length,31);
});

test("lições de direção (19/11): correção 'canal todo' vira regra dos diretores, fica fora do roteiro, apagar tira; importação PQEA (11 regras) idempotente",async()=>{
 const {runDirectionPipeline,correctDirection,directionRequest}=await D();const {approveVersion}=await import("../src/lib/script-versions");
 const {recordDirectionLesson,directionLessonsBlock}=await import("../src/lib/lessons");const {lessonsBlock}=await import("../src/lib/generator");
 const {prisma,idea,version,content}=await fixture(true,4);await approveVersion(idea.id,version.id);
 const before=requests.length;await runDirectionPipeline(idea.id,version.id);
 for(const r of requests.slice(before))assert.doesNotMatch(r.system,/REGRAS DE DIREÇÃO DO CANAL/,"sem lição, prompt igual ao de antes");
 const RULE="ROSTO_VISIVEL: quem fala aparece de frente, com o objeto citado ao fundo";
 // A tela grava a lição depois da correção dar certo; "só este roteiro" não grava nada.
 await correctDirection(idea.id,version.id,"scene","C01",RULE);const lesson=await recordDirectionLesson(idea.id,RULE);
 assert.equal(lesson!.source,"direcao");assert.equal(lesson!.scope,"canal");
 const block=await directionLessonsBlock(idea.myChannelId);assert.match(block,/aplique cada regra pelo princípio/);assert.match(block,/ROSTO_VISIVEL/);
 // Próxima direção (outra etapa, outro trecho) leva a regra no system, acima da tarefa.
 const at=requests.length;await correctDirection(idea.id,version.id,"photography","C02","Luz da janela");
 const sent=requests.slice(at).at(-1)!;assert.match(sent.system,/REGRAS DE DIREÇÃO DO CANAL/);assert.match(sent.system,/ROSTO_VISIVEL/);
 assert.ok(sent.system.indexOf("REGRAS DE DIREÇÃO DO CANAL")<sent.system.indexOf("Receba a encenação"),"acima da tarefa da etapa");
 // Lição de direção não entra no gerador de roteiro.
 assert.doesNotMatch((await lessonsBlock(idea.myChannelId!,idea.formatId)).block,/ROSTO_VISIVEL/);
 // Apagar tira a regra da direção seguinte.
 await prisma.channelLesson.delete({where:{id:lesson!.id}});
 const ctx=await (await D()).initialContext(idea.id,content);
 assert.doesNotMatch(directionRequest("scene",content,ctx,[],await directionLessonsBlock(idea.myChannelId)).system,/ROSTO_VISIVEL/);
 // Importação das 11 regras da nota de câmera: grava 11 na ordem, rodar de novo não duplica.
 const n=await prisma.niche.create({data:{name:"Família 3D"}});const pqea=await prisma.myChannel.create({data:{name:"Por Que É Assim?",nicheId:n.id}});
 const {importPqeaDirectionRules,PQEA_CAMERA_RULES}=await import("../scripts/radar-direcao-pqea");
 assert.deepEqual(await importPqeaDirectionRules(),{channelId:pqea.id,created:11,skipped:0});
 assert.deepEqual(await importPqeaDirectionRules(),{channelId:pqea.id,created:0,skipped:11});
 const rows=await prisma.channelLesson.findMany({where:{myChannelId:pqea.id},orderBy:[{createdAt:"asc"},{id:"asc"}]});
 assert.deepEqual(rows.map(r=>r.text),PQEA_CAMERA_RULES);assert.ok(rows.every(r=>r.source==="direcao"&&r.scope==="canal"));
 const pqeaBlock=await directionLessonsBlock(pqea.id);assert.ok(pqeaBlock.indexOf("- ROSTO DE QUEM FALA")<pqeaBlock.indexOf("- SOM (sonoplastia)"),"ordem 1 → 11");
});

test("fecho PQEA (regra de 16/11): tira a pergunta de duas opções do perfil com backup, regra 10 e partes de roteiro de 3 e 9 chegam ao gerador; idempotente",async()=>{
 const {prisma}=await import("../src/lib/db");const {lessonsBlock,profileBlock}=await import("../src/lib/generator");const {directionLessonsBlock}=await import("../src/lib/lessons");
 const {mkdtempSync,readFileSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const OLD="- Sempre: fecho com pergunta falada de duas opções, que o vídeo não respondeu, e um motivo para se inscrever ligado à história.";
 const rules=`- Sempre: mãe só braço.\r\n${OLD}\r\n- Nunca: repetir frase de vídeo publicado.`;
 let pqea=await prisma.myChannel.findFirst({where:{name:"Por Que É Assim?"}});
 if(!pqea){const n=await prisma.niche.create({data:{name:"Família 3D fecho"}});pqea=await prisma.myChannel.create({data:{name:"Por Que É Assim?",nicheId:n.id}});}
 await prisma.myChannel.update({where:{id:pqea.id},data:{rules}});
 const {applyPqeaClosingRule,PQEA_SCRIPT_RULES}=await import("../scripts/radar-fecho-pqea");
 const dir=mkdtempSync(join(tmpdir(),"radar-fecho-"));
 const first=await applyPqeaClosingRule(new Date(),dir);
 assert.deepEqual([first.removed,first.created,first.skipped],[[OLD],3,0]);
 const after=(await prisma.myChannel.findUniqueOrThrow({where:{id:pqea.id}})).rules!;
 assert.equal(after,"- Sempre: mãe só braço.\r\n- Nunca: repetir frase de vídeo publicado.");
 const saved=JSON.parse(readFileSync(first.backup!,"utf8"));assert.equal(saved.antes,rules);assert.deepEqual(saved.removidas,[OLD]);
 const second=await applyPqeaClosingRule(new Date(),dir);
 assert.deepEqual([second.removed,second.backup,second.created,second.skipped],[[],null,0,3]);
 // Regras de roteiro chegam ao gerador inteiras (o "sem pedir … inscrição" não é cortado) e ficam fora da direção.
 const block=(await lessonsBlock(pqea.id,null)).block;
 assert.match(block,/O fecho volta ao começo, sem pedir comentário ou inscrição/);assert.match(block,/Nunca anda na rua, nunca abraça/);assert.match(block,/O roteiro não pede cena/);
 assert.doesNotMatch(profileBlock({...pqea,rules:after,scripts:[]} as unknown as Parameters<typeof profileBlock>[0],"short"),/duas opções/);
 assert.doesNotMatch(await directionLessonsBlock(pqea.id),/O roteiro não pede cena/);
 assert.equal(PQEA_SCRIPT_RULES.length,3);
});
