import {directionState} from "@/lib/directors";
import {prisma} from "@/lib/db";
import { ideaExport } from "@/lib/script-export";
export async function GET(_req:Request,ctx:RouteContext<"/api/ideias/[id]/roteiro">){
 const {id}=await ctx.params;
 if(new URL(_req.url).searchParams.get("estudio")==="1"){
  try{const idea=await prisma.idea.findUniqueOrThrow({where:{id}});if(!idea.currentVersionId)throw new Error("Aprove o roteiro atual.");const {run}=await directionState(id,idea.currentVersionId);if(!run?.approvedAt||!run.integration)throw new Error("Aprove a direção atual antes de exportar para o Estúdio.");}catch(e){return new Response(e instanceof Error?e.message:String(e),{status:409});}
 }
 const markdown=await ideaExport(id);
 if(!markdown)return new Response("Essa ideia ainda não tem roteiro.",{status:404});
 return new Response(markdown,{headers:{"content-type":"text/markdown; charset=utf-8","content-disposition":'attachment; filename="roteiro-'+id.replace(/[^a-zA-Z0-9_-]/g,"")+'.md"'}});
}
