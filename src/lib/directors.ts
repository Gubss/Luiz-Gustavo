import { createHash } from "node:crypto";
import { z } from "zod";
import type { DirectionRun, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { callStructured, estimateCost } from "./claude";
import { getSettings } from "./settings";
import { spokenLines } from "./script-lines";
import type { ScriptContent } from "./generator";

export const STAGES = ["scene", "photography", "sound", "integration"] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABELS: Record<Stage,string> = {scene:"Diretor de cena",photography:"Diretor de fotografia",sound:"Diretor de som e trilha",integration:"Integração"};
const text = z.string().trim().min(1);
const scene = z.object({id:text,falaInicial:z.number().int().min(1),falaFinal:z.number().int().min(1),intencao:text,atuacao:text,posicoes:text,movimento:text,continuidade:text,ritmo:text}).strict();
export const SceneSchema = z.object({cenas:z.array(scene).min(1),pendencias:z.array(text)}).strict();
export const PhotoSchema = z.object({cenas:z.array(z.object({cenaId:text,plano:text,camera:text,luz:text,cor:text,composicao:text,transicao:text}).strict()).min(1),pendencias:z.array(text)}).strict();
export const SoundSchema = z.object({falas:z.array(z.object({falaId:z.number().int().min(1),intencao:text,entrega:text,pausas:text}).strict()).min(1),cenas:z.array(z.object({cenaId:text,ambiencia:text,foley:text,efeitos:text,musica:text,mixagem:text}).strict()).min(1),pendencias:z.array(text)}).strict();
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
 sound:"Receba roteiro, encenação e fotografia. Para cada fala, use apenas falaId e descreva intenção, entrega vocal e pausas. Preserve voz canônica: não crie voice_id nem troque identidade, timbre ou narrador. Para cada cena, defina ambiência, Foley, efeitos, entrada/saída/pausa/retorno da música e mixagem com prioridade da voz. Sincronize pelo ID da fala e palavra ou ação já existente, sem inventar duração medida. Não altere fatos nem falas."
};
export function directionRequest(stage:Exclude<Stage,"integration">,content:string,run:Pick<DirectionRun,"study"|"reference"|"scene"|"photography">){
 const data=JSON.parse(content) as ScriptContent;
 return {system:SYSTEM+"\n"+TASKS[stage],user:JSON.stringify({roteiro:spokenLines(data),acontecimentosAprovados:(data.cenas??[]).map(s=>({acao:s.acao})),duracaoEstimada:data.duracaoSeg,referencia:JSON.parse(run.reference),estudo:run.study,...(stage!=="scene"?{encenacao:JSON.parse(run.scene!)}:{}),...(stage==="sound"?{fotografia:JSON.parse(run.photography!)}:{})})};
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
 const context=run??await initialContext(ideaId,version.content);
 const req=directionRequest(stage,version.content,context);
 return estimateCost(modelDeep,req.system+req.user,6000,16000);
}
async function initialContext(ideaId:string,content:string){
 const idea=await prisma.idea.findUniqueOrThrow({where:{id:ideaId},include:{videoFormat:true,myChannel:true}});
 if(!idea.videoFormat?.directionStudy?.trim())throw new Error("Sem estudo de direção. Importe o estudo no formato antes de preparar os diretores.");
 const data=JSON.parse(content);
 return {study:technicalStudy(idea.videoFormat.directionStudy),reference:JSON.stringify(data.channelReference??{name:idea.myChannel?.name,characters:idea.myChannel?.characters,visualStyle:idea.myChannel?.visualStyle,rules:idea.myChannel?.rules,tone:idea.myChannel?.tone}),scene:null,photography:null};
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
 const claimed=await prisma.$transaction(async tx=>{
  await approved(tx,ideaId,versionId);
  const current=await tx.directionRun.findUniqueOrThrow({where:{versionId}});
  if(nextStage(current)!==stage)throw new Error("Execute apenas a próxima etapa. As anteriores já estão preservadas.");
  // An interrupted stage may be retried after the same 15 minute window as jobs.
  const stale=new Date(Date.now()-15*60_000);
  const lock=await tx.directionRun.updateMany({where:{id:current.id,OR:[{runningStage:null},{updatedAt:{lt:stale}}]},data:{runningStage:stage,error:null}});
  if(lock.count!==1)throw new Error("Já existe um diretor trabalhando nesta versão.");
  return tx.directionRun.findUniqueOrThrow({where:{id:current.id}});
 });
 try{
  const lines=spokenLines(JSON.parse(version.content));let result:unknown;let generationId:string|undefined;let cost=0;
  if(stage==="integration")result=integrate(version.content,SceneSchema.parse(JSON.parse(claimed.scene!)),PhotoSchema.parse(JSON.parse(claimed.photography!)),SoundSchema.parse(JSON.parse(claimed.sound!)));
  else{
   const {modelDeep}=await getSettings();const req=directionRequest(stage,version.content,claimed);
   const options={kind:"direction-"+stage,model:modelDeep,effort:"medium" as const,...req,maxTokens:16000};
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
 return "\n\n## Direção integrada da versão aprovada\nMetadados separados; falas e acontecimentos permanecem no roteiro acima. Tempos estimados, não medidos.\n\n```json\n"+JSON.stringify(JSON.parse(run.integration),null,2)+"\n```";
}
