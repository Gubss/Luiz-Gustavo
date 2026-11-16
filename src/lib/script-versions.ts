import { ideaExport } from "./script-export";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
export const CHANGE_CATEGORIES = ["história", "preferência do Gubs", "limite técnico", "animação", "voz"] as const;
export type ChangeCategory = typeof CHANGE_CATEGORIES[number];
export function changeCategory(value: string): ChangeCategory {
 if (!(CHANGE_CATEGORIES as readonly string[]).includes(value)) throw new Error("Categoria de mudança inválida.");
 return value as ChangeCategory;
}
export async function projectCode(tx: Prisma.TransactionClient, ideaId: string) {
 const idea = await tx.idea.findUniqueOrThrow({where:{id:ideaId},include:{myChannel:true}});
 if (idea.projectCode) return idea.projectCode;
 const existing = [idea.notes, idea.script, idea.theme].join(" ").match(/\bPQEA-\d{3,}\b/)?.[0];
 const prefix = idea.myChannel?.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes("por que e assim") ? "PQEA" : "RDR";
 const rows = await tx.idea.findMany({where:{myChannelId:idea.myChannelId},select:{projectCode:true}});
 const floor=Number((await tx.setting.findUnique({where:{key:"projectCodeFloor:"+idea.myChannelId}}))?.value??0);
 const max = Math.max(floor,...rows.map(r=>Number(r.projectCode?.match(/-(\d+)$/)?.[1]??0)));
 const code = existing ?? prefix+"-"+String(max+1).padStart(3,"0");
 await tx.idea.update({where:{id:ideaId},data:{projectCode:code}});
 return code;
}
export async function ensureProjectCode(ideaId: string) { return prisma.$transaction(tx=>projectCode(tx,ideaId)); }
export async function appendVersion(input: {
 ideaId:string; expectedVersionId:string|null; content:string; markdown:(code:string,number:number)=>string;
 request?:string; category:ChangeCategory; origin:string; author?:string; generationId?:string;
 model?:string; costUsd?:number; title?:string;
}) {
 return prisma.$transaction(async tx=>{
  const idea=await tx.idea.findUniqueOrThrow({where:{id:input.ideaId}});
  if(idea.currentVersionId!==input.expectedVersionId) throw new Error("O roteiro mudou enquanto você editava. Reabra a versão atual.");
  const code=await projectCode(tx,idea.id);
  let base=idea.currentVersionId;
  let number=(await tx.scriptVersion.aggregate({where:{ideaId:idea.id},_max:{number:true}}))._max.number??0;
  if(!base && (idea.scriptData||idea.script)) {
   const legacy=await tx.scriptVersion.create({data:{ideaId:idea.id,number:++number,content:idea.scriptData??JSON.stringify({legacyText:idea.script}),markdown:idea.script??"",category:"história",origin:"legacy",author:"importação"}});
   base=legacy.id;
  }
  const version=await tx.scriptVersion.create({data:{ideaId:idea.id,number:++number,baseVersionId:base,content:input.content,markdown:input.markdown(code,number),request:input.request,category:input.category,origin:input.origin,author:input.author??"Gubs"}});
  await tx.idea.update({where:{id:idea.id},data:{currentVersionId:version.id,scriptData:version.content,script:version.markdown,chosenTitle:input.title??idea.chosenTitle,scriptModel:input.model??idea.scriptModel,scriptCostUsd:(idea.scriptCostUsd??0)+(input.costUsd??0),status:["IDEA","RETURNED","DISCARDED"].includes(idea.status)?"SCRIPT":idea.status}});
  if(input.generationId) await tx.generation.update({where:{id:input.generationId},data:{scriptVersionId:version.id}});
  return version;
 });
}
export async function approveVersion(ideaId:string,versionId:string) {
 return prisma.$transaction(async tx=>{
  const idea=await tx.idea.findUniqueOrThrow({where:{id:ideaId}});
  const version=await tx.scriptVersion.findFirst({where:{id:versionId,ideaId}});
  if(!version || idea.currentVersionId!==version.id) throw new Error("Aprove somente a versão atual deste projeto.");
  return tx.idea.update({where:{id:ideaId},data:{approvedVersionId:version.id,approvedAt:new Date()}});
 });
}
export async function restoreVersion(ideaId:string,versionId:string,expectedVersionId:string|null) {
 const version=await prisma.scriptVersion.findFirst({where:{id:versionId,ideaId}});
 if(!version) throw new Error("Versão não pertence a este projeto.");
 return appendVersion({ideaId,expectedVersionId,content:version.content,markdown:(code,n)=>version.markdown.replace(/\*\*Projeto:\*\*[^\n]*/,"**Projeto:** "+code+" · versão "+n),request:"Restaurar versão "+version.number,category:"história",origin:"restore"});
}

/** Preserve an existing script without generating or approving anything. */
export async function captureLegacyVersion(ideaId:string){
 const snapshot=await prisma.idea.findUniqueOrThrow({where:{id:ideaId}});
 if(snapshot.currentVersionId||!snapshot.script)return snapshot.currentVersionId;
 const markdown=await ideaExport(ideaId);
 return prisma.$transaction(async tx=>{
  const current=await tx.idea.findUniqueOrThrow({where:{id:ideaId}});
  if(current.currentVersionId)return current.currentVersionId;
  if(current.script!==snapshot.script||current.scriptData!==snapshot.scriptData)throw new Error("Roteiro mudou durante a importação.");
  const code=await projectCode(tx,ideaId);
  const v=await tx.scriptVersion.create({data:{ideaId,number:1,content:snapshot.scriptData??JSON.stringify({legacyText:snapshot.script,cenas:[]}),markdown:(markdown??snapshot.script??"").replace(/\*\*Projeto:\*\*[^\n]*/,"**Projeto:** "+code+" · versão 1"),category:"história",origin:"legacy",author:"importação"}});
  await tx.idea.update({where:{id:ideaId},data:{currentVersionId:v.id,script:v.markdown}});
  return v.id;
 });
}
