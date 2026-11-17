"use server";
import {revalidatePath} from "next/cache";
import {runDirector,runDirectionPipeline,estimateDirectionPipeline,approveDirection,correctDirection,estimateDirectionCorrection,STAGES,STAGE_LABELS,WHOLE_STAGE,type Stage,type DirectorStage} from "@/lib/directors";
import {startJob} from "@/lib/jobs";
import type {FormState} from "@/app/video/actions";
export async function directorAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState>{
 const versionId=String(fd.get("versionId")??"");const stage=String(fd.get("stage")??"") as Stage;
 if(!STAGES.includes(stage))return {error:"Etapa inválida."};
 try{
  await startJob({kind:"direction",targetId:ideaId,label:"Direção do roteiro",href:"/ideias/"+ideaId,expectedSec:stage==="integration"?2:90},async()=>{
   await runDirector(ideaId,versionId,stage);return "Etapa concluída. Falas preservadas; abra o roteiro para continuar.";
  },["script"]);
  revalidatePath("/ideias/"+ideaId);return {ok:"Etapa iniciada. O aviso mostra quando terminar; nenhuma etapa seguinte será gerada automaticamente."};
 }catch(e){return {error:e instanceof Error?e.message:String(e)}}
}

export async function prepareDirectionAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState>{
 const versionId=String(fd.get("versionId")??"");
 try{
  await estimateDirectionPipeline(ideaId,versionId);
  await startJob({kind:"direction",targetId:ideaId,label:"Preparar direção",href:"/ideias/"+ideaId,expectedSec:270},async report=>{
   await runDirectionPipeline(ideaId,versionId,report);
   return "Direção integrada. Confira o resultado e aprove esta versão.";
  },["script"]);
  revalidatePath("/ideias/"+ideaId);return {ok:"Direção iniciada. As etapas serão executadas em sequência."};
 }catch(e){return {error:e instanceof Error?e.message:String(e)}}
}
/** Adendo B: corrige uma cena ou a etapa inteira de um diretor (ou refaz o que ficou desatualizado). */
export async function correctDirectionAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState>{
 const versionId=String(fd.get("versionId")??"");const stage=String(fd.get("stage")??"") as DirectorStage;
 const target=String(fd.get("target")??WHOLE_STAGE)||WHOLE_STAGE;const redo=fd.get("mode")==="redo";const request=redo?"":String(fd.get("request")??"").trim();
 if(!redo&&!request)return {error:"Escreva o que você quer mudar."};
 try{
  await estimateDirectionCorrection(ideaId,versionId,stage,target);
  const what=(target===WHOLE_STAGE?"toda a etapa":target)+" · "+STAGE_LABELS[stage];
  await startJob({kind:"direction",targetId:ideaId,label:(redo?"Refazer ":"Corrigir direção: ")+what,href:"/ideias/"+ideaId,expectedSec:target===WHOLE_STAGE?120:60},async()=>{
   await correctDirection(ideaId,versionId,stage,target,request);
   return "Direção corrigida ("+what+"). A versão anterior ficou guardada; confira as etapas marcadas como desatualizadas.";
  },["script"]);
  revalidatePath("/ideias/"+ideaId);return {ok:(redo?"Refazendo ":"Corrigindo ")+what+". O aviso mostra quando terminar."};
 }catch(e){return {error:e instanceof Error?e.message:String(e)}}
}
export async function approveDirectionAction(ideaId:string,_prev:FormState,fd:FormData):Promise<FormState>{
 try{await approveDirection(ideaId,String(fd.get("versionId")??""));revalidatePath("/ideias/"+ideaId);return {ok:"Direção aprovada para esta versão."};}
 catch(e){return {error:e instanceof Error?e.message:String(e)}}
}
