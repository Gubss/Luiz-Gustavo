import { instructionSnapshot, instructionsFor } from "./direction-instructions";
import { effectiveInstructions } from "./directions";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DirectionRun, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { callStructured, estimateCost, costUsd } from "./claude";
import { getSettings } from "./settings";
import { spokenLines } from "./script-lines";
import type { ScriptContent } from "./generator";
import { directionLessonsBlock } from "./lessons";

export const STAGES = ["scene", "photography", "sound", "integration"] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABELS: Record<Stage,string> = {scene:"Diretor de cena",photography:"Diretor de fotografia",sound:"Diretor de som e trilha",integration:"Integração"};
const text = z.string().trim().min(1);
const scene = z.object({id:text,falaInicial:z.number().int().min(1),falaFinal:z.number().int().min(1),intencao:text,atuacao:text,posicoes:text,movimento:text,continuidade:text,ritmo:text}).strict();
const photoScene = z.object({cenaId:text,plano:text,camera:text,luz:text,cor:text,composicao:text,transicao:text}).strict();
const soundLine = z.object({falaId:z.number().int().min(1),intencao:text,entrega:text,pausas:text}).strict();
const soundScene = z.object({cenaId:text,ambiencia:text,foley:text,efeitos:text,musica:text,mixagem:text}).strict();
export const SceneSchema = z.object({cenas:z.array(scene).min(1),pendencias:z.array(text)}).strict();
export const PhotoSchema = z.object({cenas:z.array(photoScene).min(1),pendencias:z.array(text)}).strict();
export const SoundSchema = z.object({falas:z.array(soundLine).min(1),cenas:z.array(soundScene).min(1),pendencias:z.array(text)}).strict();
/** One-scene answers used by direction corrections (adendo B). */
export const SceneOneSchema = z.object({cena:scene,pendencias:z.array(text)}).strict();
export const PhotoOneSchema = z.object({cena:photoScene,pendencias:z.array(text)}).strict();
export const SoundOneSchema = z.object({falas:z.array(soundLine).min(1),cena:soundScene,pendencias:z.array(text)}).strict();
export type Scenes = z.infer<typeof SceneSchema>;
export type Photos = z.infer<typeof PhotoSchema>;
export type Sounds = z.infer<typeof SoundSchema>;
export const hashScript=(content:string)=>createHash("sha256").update(content).digest("hex");

export function validateCoverage(cenas:Scenes["cenas"],count:number){
 let next=1;const ids=new Set<string>();
 for(const c of cenas){if(c.falaInicial!==next||c.falaFinal<c.falaInicial||c.falaFinal>count||ids.has(c.id))throw new Error("Cenas devem cobrir todas as falas em ordem, sem lacunas ou repetição.");next=c.falaFinal+1;ids.add(c.id);}
 if(next!==count+1)throw new Error("Direção incompleta: faltam falas.");
}
function sameIds(actual:string[],expected:string[]){if(actual.length!==expected.length||actual.some((id,i)=>id!==expected[i]))throw new Error("Os vínculos e a ordem das cenas devem permanecer iguais à encenação.");}
export function validatePhoto(value:Photos,scenes:Scenes){sameIds(value.cenas.map(c=>c.cenaId),scenes.cenas.map(c=>c.id));}
export function validateSound(value:Sounds,scenes:Scenes,count:number){sameIds(value.cenas.map(c=>c.cenaId),scenes.cenas.map(c=>c.id));if(value.falas.length!==count||value.falas.some((f,i)=>f.falaId!==i+1))throw new Error("Cada fala precisa de interpretação, em ordem e sem repetição.");}

/** Sections A and narrative overrides must never enter a director's remit. */
export function technicalStudy(study:string){return study.replace(/^## A\. [\s\S]*?(?=^## [BC]\. |$(?![\s\S]))/m,"").trim();}
const SYSTEM = `MODO_DIRECAO. O roteiro aprovado é imutável. Não altere, acrescente, corte ou reordene falas ou acontecimentos. Responda somente com metadados e IDs; nunca devolva texto falado. A referência atual do canal prevalece sobre exemplos e estudos antigos, inclusive limites visuais dos personagens. Se encontrar contradição narrativa, registre pendência; não reescreva. Não invente objetos, fatos ou personagens. Tempos são estimados até existir áudio real. Cenas seguem acontecimentos; várias falas podem compartilhar a mesma cena. Não imponha corte por fala. Justifique escolhas pela história e preserve legibilidade e continuidade.`;
const TASKS:Record<Exclude<Stage,"integration">,string>={
 scene:"Defina encenação: intenção dramática, atuação, gestos, expressões, posições iniciais/finais, movimentos, continuidade de objetos, antecipação e reação, ritmo. Agrupe intervalos contíguos de falas em cenas por acontecimento; cubra todas as falas. IDs de cena estáveis (C01...). Não defina fotografia ou trilha.",
 photography:"Receba a encenação concluída. Preserve IDs, ordem e acontecimentos. Defina plano, posição/movimento e foco da câmera, luz com fonte motivada e direção consistente, cor canônica, composição legível em 9:16 e transições. Câmera serve ao objeto/ação; não esconda mãos ou pistas. Não mude atuação ou texto.",
 sound:"Receba roteiro, encenação e fotografia. Para cada fala, use apenas falaId e descreva intenção, entrega vocal e pausas. Preserve voz canônica: não crie voice_id nem troque identidade, timbre ou narrador. Para cada cena, defina ambiência, Foley, efeitos, entrada/saída/pausa/retorno da música e mixagem com prioridade da voz. Sincronize pelo ID da fala e palavra ou ação já existente, sem inventar duração medida. Não altere fatos nem falas. Seja enxuto: cada campo em uma frase curta (até ~20 palavras); não cite nem repita o texto das falas, refira-se a elas só pelo falaId."
};
/** Output ceiling (thinking + JSON). Sound writes one entry per line, so it grows with the script. Streaming makes high ceilings safe; only used tokens are billed. */
export const DIRECTION_MIN_MAX_TOKENS=32000;
export function directionMaxTokens(stage:Exclude<Stage,"integration">,lineCount:number){
 if(stage!=="sound")return DIRECTION_MIN_MAX_TOKENS;
 return Math.min(64000,Math.max(DIRECTION_MIN_MAX_TOKENS,20000+lineCount*1000));
}
const lineCount=(content:string)=>spokenLines(JSON.parse(content)).length;
const INTENTIONS=`INTENÇÕES DO GUBS: intencoesDoGubs traz os pedidos de correção que geraram a versão aprovada do roteiro, do mais antigo ao mais recente. Eles prevalecem sobre regras genéricas, estudos, exemplos e instruções do usuário: a direção precisa MOSTRAR cada um na tela (objeto, posição, ação, reação, som). Quando o pedido descreve uma imagem (ex.: alguém segurando um objeto, algo no céu, a imagem contando a piada), essa imagem é obrigatória na cena da fala correspondente. Pedido mais recente prevalece sobre o anterior.`;
/**
 * Adendo A: the correction requests that produced this version, oldest first.
 * Follows baseVersionId back to the generation; a restore jumps to the restored version's own history.
 */
export async function scriptIntentions(versionId:string){
 const out:string[]=[];const seen=new Set<string>();let id:string|null=versionId;
 while(id&&!seen.has(id)){
  seen.add(id);
  const v:{ideaId:string;baseVersionId:string|null;request:string|null;origin:string}|null=await prisma.scriptVersion.findUnique({where:{id},select:{ideaId:true,baseVersionId:true,request:true,origin:true}});
  if(!v)break;
  if(v.origin==="restore"){
   const n:number=Number(v.request?.match(/(\d+)/)?.[1]);
   const restored:{id:string}|null=n?await prisma.scriptVersion.findFirst({where:{ideaId:v.ideaId,number:n},select:{id:true}}):null;
   id=restored?.id??null;continue;
  }
  if(v.request?.trim()&&!out.includes(v.request.trim()))out.unshift(v.request.trim());
  if(v.origin==="generation"||v.origin==="legacy")break;
  id=v.baseVersionId;
 }
 return out;
}
/** Regras de direção que o Gubs marcou para o canal todo (bloco próprio no system, acima da tarefa). */
export async function channelDirectionLessons(ideaId:string){
 const idea=await prisma.idea.findUnique({where:{id:ideaId},select:{myChannelId:true}});
 return directionLessonsBlock(idea?.myChannelId);
}
export function directionRequest(stage:Exclude<Stage,"integration">,content:string,run:Pick<DirectionRun,"study"|"reference"|"scene"|"photography">,intentions:string[]=[],lessons=""){
 const data=JSON.parse(content) as ScriptContent;
 return {system:SYSTEM+(intentions.length?"\n"+INTENTIONS:"")+(lessons?"\n"+lessons:"")+"\n"+TASKS[stage],user:JSON.stringify({...(intentions.length?{intencoesDoGubs:intentions}:{}),roteiro:spokenLines(data),acontecimentosAprovados:(data.cenas??[]).map(s=>({acao:s.acao})),duracaoEstimada:data.duracaoSeg,referencia:JSON.parse(run.reference),instrucoesDoUsuario:instructionsFor(stage,run.study),...(stage!=="scene"?{encenacao:JSON.parse(run.scene!)}:{}),...(stage==="sound"?{fotografia:JSON.parse(run.photography!)}:{})})};
}
export const isDirectionRunning=(run:DirectionRun|null)=>Boolean(run?.runningStage && Date.now()-run.updatedAt.getTime()<15*60_000);
export function nextStage(run:DirectionRun|null):Stage|null{for(const stage of STAGES)if(!run?.[stage])return stage;return null;}
async function approved(tx:Prisma.TransactionClient,ideaId:string,versionId:string){
 const idea=await tx.idea.findUniqueOrThrow({where:{id:ideaId}});
 const version=await tx.scriptVersion.findFirst({where:{id:versionId,ideaId}});
 if(!version||idea.currentVersionId!==versionId||idea.approvedVersionId!==versionId)throw new Error("A direção exige a versão atual aprovada. Reabra e aprove as falas.");
 if(!spokenLines(JSON.parse(version.content)).length)throw new Error("Roteiro sem falas estruturadas; revise antes de dirigir.");
 return {idea,version};
}
export async function directionState(ideaId:string,versionId:string){
 const {version}=await approved(prisma,ideaId,versionId);
 const run=await prisma.directionRun.findUnique({where:{versionId}});
 if(run&&run.sourceHash!==hashScript(version.content))throw new Error("Conteúdo aprovado mudou; direção inválida.");
 return {version,run};
}
export async function estimateDirection(ideaId:string,versionId:string){
 const {version,run}=await directionState(ideaId,versionId);const stage=nextStage(run);
 if(!stage||stage==="integration")return null;
 const {modelDeep}=await getSettings();
 // Account for the full context before the first snapshot exists.
 const context=run?.study.startsWith('{"version":1,')?run:await initialContext(ideaId,version.content);
 const req=directionRequest(stage,version.content,context,await scriptIntentions(versionId),await channelDirectionLessons(ideaId));
 return estimateCost(modelDeep,req.system+req.user,6000,directionMaxTokens(stage,lineCount(version.content)));
}
export async function initialContext(ideaId:string,content:string){
 const idea=await prisma.idea.findUniqueOrThrow({where:{id:ideaId},include:{videoFormat:{include:{direction:true}},myChannel:true}});
 if(!idea.videoFormat)throw new Error("Formato não encontrado.");
 const data=JSON.parse(content);
 return {study:instructionSnapshot(effectiveInstructions(idea.videoFormat)!),reference:JSON.stringify(data.channelReference??{name:idea.myChannel?.name,characters:idea.myChannel?.characters,visualStyle:idea.myChannel?.visualStyle,rules:idea.myChannel?.rules,tone:idea.myChannel?.tone}),scene:null,photography:null};
}
export function integrate(content:string,scenes:Scenes,photos:Photos,sounds:Sounds){
 const data=JSON.parse(content) as ScriptContent;const lines=spokenLines(data);
 validateCoverage(scenes.cenas,lines.length);validatePhoto(photos,scenes);validateSound(sounds,scenes,lines.length);
 const weights=lines.map(l=>Math.max(1,l.text.split(/\s+/).length));const total=weights.reduce((a,b)=>a+b,0);
 const duration=Math.max(1,data.duracaoSeg||total/2.5);let cursor=0;
 return {duracaoEstimada:duration,tempos:"estimados; sincronizar ao áudio real",pendencias:[...scenes.pendencias,...photos.pendencias,...sounds.pendencias],cenas:scenes.cenas.map((s,i)=>{const start=cursor;cursor+=duration*weights.slice(s.falaInicial-1,s.falaFinal).reduce((a,b)=>a+b,0)/total;return {...s,inicioEstimado:Math.round(start*10)/10,fimEstimado:Math.round(cursor*10)/10,fotografia:photos.cenas[i],som:sounds.cenas[i],interpretacao:sounds.falas.slice(s.falaInicial-1,s.falaFinal)};})};
}
export async function runDirector(ideaId:string,versionId:string,stage:Stage){
 if(!STAGES.includes(stage))throw new Error("Etapa inválida.");
 const {version}=await directionState(ideaId,versionId);
 let run=await prisma.directionRun.findUnique({where:{versionId}});
 if(!run){const context=await initialContext(ideaId,version.content);run=await prisma.directionRun.upsert({where:{versionId},create:{versionId,sourceHash:hashScript(version.content),...context},update:{}});}
 // Runs created before role-specific instructions retain results, but receive a new scoped snapshot.
 if(!run.study.startsWith('{"version":1,')){
  const context=await initialContext(ideaId,version.content);
  await prisma.directionRun.updateMany({where:{id:run.id,runningStage:null,study:run.study},data:{study:context.study,approvedAt:null}});
 }
 const claimed=await prisma.$transaction(async tx=>{
  await approved(tx,ideaId,versionId);
  const current=await tx.directionRun.findUniqueOrThrow({where:{versionId}});
  if(nextStage(current)!==stage)throw new Error("Execute apenas a próxima etapa. As anteriores já estão preservadas.");
  // An interrupted stage may be retried after the same 15 minute window as jobs.
  const stale=new Date(Date.now()-15*60_000);
  const lock=await tx.directionRun.updateMany({where:{id:current.id,OR:[{runningStage:null},{updatedAt:{lt:stale}}]},data:{runningStage:stage,error:null,approvedAt:null}});
  if(lock.count!==1)throw new Error("Já existe um diretor trabalhando nesta versão.");
  return tx.directionRun.findUniqueOrThrow({where:{id:current.id}});
 });
 try{
  const lines=spokenLines(JSON.parse(version.content));let result:unknown;let generationId:string|undefined;let cost=0;
  if(stage==="integration")result=integrate(version.content,SceneSchema.parse(JSON.parse(claimed.scene!)),PhotoSchema.parse(JSON.parse(claimed.photography!)),SoundSchema.parse(JSON.parse(claimed.sound!)));
  else{
   const {modelDeep}=await getSettings();const req=directionRequest(stage,version.content,claimed,await scriptIntentions(versionId),await channelDirectionLessons(ideaId));
   const options={kind:"direction-"+stage,model:modelDeep,effort:"medium" as const,...req,maxTokens:directionMaxTokens(stage,lines.length)};
   const response=stage==="scene"?await callStructured({...options,schema:SceneSchema}):stage==="photography"?await callStructured({...options,schema:PhotoSchema}):await callStructured({...options,schema:SoundSchema});
   result=response.data;generationId=response.generationId;cost=response.costUsd;
   await prisma.generation.update({where:{id:generationId},data:{scriptVersionId:versionId}});
   if(stage==="scene")validateCoverage(SceneSchema.parse(result).cenas,lines.length);
   if(stage==="photography")validatePhoto(PhotoSchema.parse(result),SceneSchema.parse(JSON.parse(claimed.scene!)));
   if(stage==="sound")validateSound(SoundSchema.parse(result),SceneSchema.parse(JSON.parse(claimed.scene!)),lines.length);
  }
  return await prisma.$transaction(async tx=>{
   const fresh=await approved(tx,ideaId,versionId);
   if(hashScript(fresh.version.content)!==claimed.sourceHash)throw new Error("Versão alterada durante a direção; resultado descartado.");
   const active=await tx.directionRun.findUniqueOrThrow({where:{id:claimed.id}});
   if(active.runningStage!==stage||active.updatedAt.getTime()!==claimed.updatedAt.getTime())throw new Error("A execução foi substituída; resultado descartado.");
   return tx.directionRun.update({where:{id:claimed.id},data:{[stage]:JSON.stringify(result),runningStage:null,error:null,costUsd:{increment:cost}}});
  });
 }catch(error){await prisma.directionRun.updateMany({where:{id:claimed.id,runningStage:stage,updatedAt:claimed.updatedAt},data:{runningStage:null,error:error instanceof Error?error.message:String(error)}});throw error;}
}

export async function directionExport(ideaId:string,versionId:string,content:string){
 const idea=await prisma.idea.findUniqueOrThrow({where:{id:ideaId}});
 const run=await prisma.directionRun.findUnique({where:{versionId}});
 if(!run)return "\n\n## Direção após aprovação\nAinda não preparada para esta versão.";
 if(idea.currentVersionId!==versionId||idea.approvedVersionId!==versionId||hashScript(content)!==run.sourceHash)return "\n\n## Direção indisponível\nA versão atual precisa de aprovação; não produzir usando direções antigas.";
 if(!run.integration)return "\n\n## Direção em andamento\nPróxima etapa: "+STAGE_LABELS[nextStage(run)!]+(run.error?"\nPendência: "+run.error:"");
 if(!run.approvedAt)return "\n\n## Direção integrada aguardando aprovação\nConfira a direção desta versão no Radar e aprove antes de levar ao Estúdio.";
 return "\n\n## Direção integrada da versão aprovada\nMetadados separados; falas e acontecimentos permanecem no roteiro acima. Tempos estimados, não medidos.\n\n```json\n"+JSON.stringify(JSON.parse(run.integration),null,2)+"\n```";
}

/** Whole remaining pipeline; future outputs are budgeted as inputs, not treated as empty context. */
export async function estimateDirectionPipeline(ideaId:string, versionId:string) {
 const {version,run}=await directionState(ideaId,versionId);
 const remaining=STAGES.filter(stage=>stage!=="integration"&&!run?.[stage]) as Exclude<Stage,"integration">[];
 const {modelDeep}=await getSettings();
 if(!remaining.length)return {model:modelDeep,usd:0,usdMax:0,calls:0};
 const context=run?.study.startsWith('{"version":1,')?run:await initialContext(ideaId,version.content);
 let usd=0,usdMax=0;const count=lineCount(version.content);const intentions=await scriptIntentions(versionId);const lessons=await channelDirectionLessons(ideaId);
 for(const stage of remaining){
  const request=directionRequest(stage,version.content,{...context,scene:context.scene??"null",photography:context.photography??"null"},intentions,lessons);
  const futureInputs=(stage!=="scene"&&!context.scene?1:0)+(stage==="sound"&&!context.photography?1:0);
  const cost=estimateCost(modelDeep,request.system+request.user,6000,directionMaxTokens(stage,count));
  usd+=cost.usd+costUsd(modelDeep,futureInputs*6000,0);
  // An earlier stage's JSON cannot exceed that stage's ceiling (scene and photography share it).
  usdMax+=cost.usdMax+costUsd(modelDeep,futureInputs*DIRECTION_MIN_MAX_TOKENS,0);
 }
 return {model:modelDeep,usd,usdMax,calls:remaining.length};
}
export async function runDirectionPipeline(ideaId:string,versionId:string,report:(progress:number,step:string)=>Promise<void>=async()=>{}){
 for(;;){
  const {run}=await directionState(ideaId,versionId);
  const stage=nextStage(run);
  if(!stage)break;
  await report(STAGES.indexOf(stage)*25,STAGE_LABELS[stage]);
  await runDirector(ideaId,versionId,stage);
  await report((STAGES.indexOf(stage)+1)*25,STAGE_LABELS[stage]+": feito");
 }
}
export async function approveDirection(ideaId:string,versionId:string){
 return prisma.$transaction(async tx=>{
  const {version}=await approved(tx,ideaId,versionId);
  const run=await tx.directionRun.findUniqueOrThrow({where:{versionId}});
  if(run.sourceHash!==hashScript(version.content)||!run.integration||run.runningStage||run.error)throw new Error("Conclua e confira a direção da versão atual antes de aprovar.");
  if(parseStale(run).length)throw new Error("Há etapas desatualizadas por uma correção. Refaça-as antes de aprovar.");
  return tx.directionRun.update({where:{id:run.id},data:{approvedAt:new Date()}});
 });
}

/* ---------- Adendo B: corrigir só a direção ---------- */
export type DirectorStage=Exclude<Stage,"integration">;
export const WHOLE_STAGE="all";
export type StaleMark={stage:DirectorStage;target:string};
export type DirectionHistory={stage:DirectorStage;target:string;request:string;at:string;value:string};
const DEPENDENTS:Record<DirectorStage,DirectorStage[]>={scene:["photography","sound"],photography:["sound"],sound:[]};
export const parseStale=(run:Pick<DirectionRun,"stale">|null)=>(run?JSON.parse(run.stale||"[]"):[]) as StaleMark[];
export const parseHistory=(run:Pick<DirectionRun,"history">|null)=>(run?JSON.parse(run.history||"[]"):[]) as DirectionHistory[];
export function addStale(list:StaleMark[],stage:DirectorStage,target:string):StaleMark[]{
 if(list.some(s=>s.stage===stage&&(s.target===WHOLE_STAGE||s.target===target)))return list;
 return [...(target===WHOLE_STAGE?list.filter(s=>s.stage!==stage):list),{stage,target}];
}
export function clearStale(list:StaleMark[],stage:DirectorStage,target:string){
 return target===WHOLE_STAGE?list.filter(s=>s.stage!==stage):list.filter(s=>!(s.stage===stage&&s.target===target));
}
const uniq=(xs:string[])=>Array.from(new Set(xs));
const REDO="A etapa anterior foi corrigida; atualize para ficar coerente com ela, sem outras mudanças.";

export function correctionRequest(stage:DirectorStage,target:string,request:string,content:string,run:Pick<DirectionRun,"study"|"reference"|"scene"|"photography"|"sound">,intentions:string[]=[],lessons=""){
 const base=directionRequest(stage,content,run,intentions,lessons);
 const scenes=run.scene?SceneSchema.parse(JSON.parse(run.scene)):null;
 const sc=scenes?.cenas.find(c=>c.id===target);
 const scope=target===WHOLE_STAGE
  ?"refaça toda a etapa partindo de resultadoAtual. Mude só o que pedidoDeCorrecao exige e mantenha o resto igual."
  :"refaça somente a cena "+target+". Devolva só essa cena"+(stage==="sound"&&sc?" (campo cena) e a interpretação das falas "+sc.falaInicial+" a "+sc.falaFinal+", em ordem (campo falas)":" (campo cena)")+", com o mesmo ID"+(stage==="scene"?" e o mesmo intervalo de falas":"")+". Não mude nenhuma outra cena.";
 return {
  system:base.system+"\nCORREÇÃO DA DIREÇÃO: "+scope+" O pedidoDeCorrecao do Gubs prevalece sobre resultadoAtual. Pendências: só dúvidas reais desta correção.",
  user:JSON.stringify({...JSON.parse(base.user),resultadoAtual:JSON.parse(run[stage]!),alvo:target===WHOLE_STAGE?"toda a etapa":target,pedidoDeCorrecao:request.trim()||REDO}),
 };
}
const correctionMaxTokens=(stage:DirectorStage,target:string,count:number)=>target===WHOLE_STAGE?directionMaxTokens(stage,count):DIRECTION_MIN_MAX_TOKENS;

async function correctionContext(ideaId:string,versionId:string,stage:DirectorStage,target:string){
 if(!(["scene","photography","sound"] as string[]).includes(stage))throw new Error("Etapa inválida.");
 const {version,run}=await directionState(ideaId,versionId);
 if(!run?.[stage])throw new Error("Esta etapa ainda não foi feita; prepare a direção primeiro.");
 if(target!==WHOLE_STAGE&&!SceneSchema.parse(JSON.parse(run.scene!)).cenas.some(c=>c.id===target))throw new Error("Cena não encontrada nesta direção.");
 return {version,run};
}
export async function estimateDirectionCorrection(ideaId:string,versionId:string,stage:DirectorStage,target:string=WHOLE_STAGE){
 const {version,run}=await correctionContext(ideaId,versionId,stage,target);
 const {modelDeep}=await getSettings();
 const req=correctionRequest(stage,target,"",version.content,run,await scriptIntentions(versionId),await channelDirectionLessons(ideaId));
 return estimateCost(modelDeep,req.system+req.user,4000,correctionMaxTokens(stage,target,lineCount(version.content)));
}

/** Pure merge of a correction answer into the stage result; throws when IDs, ranges or coverage break. */
export function mergeCorrection(stage:DirectorStage,target:string,answer:unknown,run:Pick<DirectionRun,"scene"|"photography"|"sound">,count:number):{value:string;idsChanged:boolean}{
 const scenes=SceneSchema.parse(JSON.parse(run.scene!));
 if(target===WHOLE_STAGE){
  if(stage==="scene"){const v=SceneSchema.parse(answer);validateCoverage(v.cenas,count);const before=scenes.cenas.map(c=>c.id).join("|");return {value:JSON.stringify(v),idsChanged:v.cenas.map(c=>c.id).join("|")!==before};}
  if(stage==="photography"){const v=PhotoSchema.parse(answer);validatePhoto(v,scenes);return {value:JSON.stringify(v),idsChanged:false};}
  const v=SoundSchema.parse(answer);validateSound(v,scenes,count);return {value:JSON.stringify(v),idsChanged:false};
 }
 const sc=scenes.cenas.find(c=>c.id===target);if(!sc)throw new Error("Cena não encontrada nesta direção.");
 if(stage==="scene"){
  const a=SceneOneSchema.parse(answer);
  if(a.cena.id!==target||a.cena.falaInicial!==sc.falaInicial||a.cena.falaFinal!==sc.falaFinal)throw new Error("A correção precisa manter o ID e o intervalo de falas da cena "+target+".");
  const v={cenas:scenes.cenas.map(c=>c.id===target?a.cena:c),pendencias:uniq([...scenes.pendencias,...a.pendencias])};validateCoverage(v.cenas,count);
  return {value:JSON.stringify(v),idsChanged:false};
 }
 if(stage==="photography"){
  const a=PhotoOneSchema.parse(answer);const cur=PhotoSchema.parse(JSON.parse(run.photography!));
  if(a.cena.cenaId!==target)throw new Error("A correção precisa manter o ID da cena "+target+".");
  const v={cenas:cur.cenas.map(c=>c.cenaId===target?a.cena:c),pendencias:uniq([...cur.pendencias,...a.pendencias])};validatePhoto(v,scenes);
  return {value:JSON.stringify(v),idsChanged:false};
 }
 const a=SoundOneSchema.parse(answer);const cur=SoundSchema.parse(JSON.parse(run.sound!));
 if(a.cena.cenaId!==target)throw new Error("A correção precisa manter o ID da cena "+target+".");
 const expected=Array.from({length:sc.falaFinal-sc.falaInicial+1},(_,i)=>sc.falaInicial+i);
 if(a.falas.length!==expected.length||a.falas.some((f,i)=>f.falaId!==expected[i]))throw new Error("A correção do som precisa trazer as falas "+sc.falaInicial+" a "+sc.falaFinal+", em ordem.");
 const v={falas:cur.falas.map(f=>f.falaId>=sc.falaInicial&&f.falaId<=sc.falaFinal?a.falas[f.falaId-sc.falaInicial]:f),cenas:cur.cenas.map(c=>c.cenaId===target?a.cena:c),pendencias:uniq([...cur.pendencias,...a.pendencias])};
 validateSound(v,scenes,count);
 return {value:JSON.stringify(v),idsChanged:false};
}

/**
 * Redoes one scene or a whole stage with one AI call. The previous result goes to history; later stages
 * that depend on it are marked stale (or cleared when scene IDs changed, so the normal pipeline redoes them).
 * An empty request means "redo after an upstream correction".
 */
export async function correctDirection(ideaId:string,versionId:string,stage:DirectorStage,target:string,request:string){
 if(request.length>4000)throw new Error("Descreva a correção em até 4.000 caracteres.");
 const {version}=await correctionContext(ideaId,versionId,stage,target);
 const stale=new Date(Date.now()-15*60_000);
 const claimed=await prisma.$transaction(async tx=>{
  await approved(tx,ideaId,versionId);
  const current=await tx.directionRun.findUniqueOrThrow({where:{versionId}});
  if(!current[stage])throw new Error("Esta etapa ainda não foi feita; prepare a direção primeiro.");
  const lock=await tx.directionRun.updateMany({where:{id:current.id,OR:[{runningStage:null},{updatedAt:{lt:stale}}]},data:{runningStage:stage,error:null}});
  if(lock.count!==1)throw new Error("Já existe um diretor trabalhando nesta versão.");
  return tx.directionRun.findUniqueOrThrow({where:{id:current.id}});
 });
 try{
  const count=lineCount(version.content);
  const {modelDeep}=await getSettings();
  const req=correctionRequest(stage,target,request,version.content,claimed,await scriptIntentions(versionId),await channelDirectionLessons(ideaId));
  const options={kind:"direction-fix-"+stage,model:modelDeep,effort:"medium" as const,...req,maxTokens:correctionMaxTokens(stage,target,count)};
  const whole=target===WHOLE_STAGE;
  const response=stage==="scene"?await callStructured({...options,schema:whole?SceneSchema:SceneOneSchema})
   :stage==="photography"?await callStructured({...options,schema:whole?PhotoSchema:PhotoOneSchema})
   :await callStructured({...options,schema:whole?SoundSchema:SoundOneSchema});
  await prisma.generation.update({where:{id:response.generationId},data:{scriptVersionId:versionId}});
  const merged=mergeCorrection(stage,target,response.data,claimed,count);
  const at=new Date().toISOString();
  const history=[...parseHistory(claimed),{stage,target,request:request.trim()||REDO,at,value:claimed[stage]!}];
  let marks=clearStale(parseStale(claimed),stage,target);
  const data:Record<string,unknown>={[stage]:merged.value};
  for(const dep of DEPENDENTS[stage]){
   if(!claimed[dep])continue;
   if(merged.idsChanged){history.push({stage:dep,target:WHOLE_STAGE,request:"Cenas reagrupadas pela correção da encenação; etapa refeita do zero.",at,value:claimed[dep]!});data[dep]=null;marks=clearStale(marks,dep,WHOLE_STAGE);}
   else marks=addStale(marks,dep,target);
  }
  const next={...claimed,...data} as DirectionRun;
  data.integration=next.scene&&next.photography&&next.sound&&claimed.integration?JSON.stringify(integrate(version.content,SceneSchema.parse(JSON.parse(next.scene)),PhotoSchema.parse(JSON.parse(next.photography)),SoundSchema.parse(JSON.parse(next.sound)))):null;
  return await prisma.$transaction(async tx=>{
   const fresh=await approved(tx,ideaId,versionId);
   if(hashScript(fresh.version.content)!==claimed.sourceHash)throw new Error("Versão alterada durante a direção; resultado descartado.");
   const active=await tx.directionRun.findUniqueOrThrow({where:{id:claimed.id}});
   if(active.runningStage!==stage||active.updatedAt.getTime()!==claimed.updatedAt.getTime())throw new Error("A execução foi substituída; resultado descartado.");
   return tx.directionRun.update({where:{id:claimed.id},data:{...data,stale:JSON.stringify(marks),history:JSON.stringify(history),runningStage:null,error:null,approvedAt:null,costUsd:{increment:response.costUsd}}});
  });
 // A failed correction keeps the previous result valid: release the lock without blocking approval; the job shows the error.
 }catch(error){await prisma.directionRun.updateMany({where:{id:claimed.id,runningStage:stage,updatedAt:claimed.updatedAt},data:{runningStage:null}});throw error;}
}
