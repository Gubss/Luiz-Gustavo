"use server";
import {revalidatePath} from "next/cache";
import {runDirector,STAGES,type Stage} from "@/lib/directors";
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
