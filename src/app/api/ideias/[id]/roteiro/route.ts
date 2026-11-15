import { ideaExport } from "@/lib/script-export";
export async function GET(_req:Request,ctx:RouteContext<"/api/ideias/[id]/roteiro">){
 const {id}=await ctx.params;const markdown=await ideaExport(id);
 if(!markdown)return new Response("Essa ideia ainda não tem roteiro.",{status:404});
 return new Response(markdown,{headers:{"content-type":"text/markdown; charset=utf-8","content-disposition":'attachment; filename="roteiro-'+id.replace(/[^a-zA-Z0-9_-]/g,"")+'.md"'}});
}
