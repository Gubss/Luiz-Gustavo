import { prisma } from "./db";
import { channelIdentity, scopedRules } from "./script-context";
import { spokenLines } from "./script-lines";
import type { ScriptContent, FormatMeta } from "./generator";
export type ChannelReference = { name:string; characters:string|null; visualStyle:string|null; tone:string|null; rules:string|null; formatName:string; how:string };
export function exportScript(c:ScriptContent,ref:ChannelReference,code:string,number:number,meta?:FormatMeta|null) {
 const pending=[...(c.pendencias??[]),...(c.conferirFatos??[]),...(c.checklist??[]).filter(x=>!x.ok).map(x=>x.item),"Direção de animação ainda não preparada; requer aprovação das falas."];
 if(c.formatoCombina&&!c.formatoCombina.combina) pending.push(c.formatoCombina.motivo);
 return ["# "+c.titulo,"**Projeto:** "+code+" · versão "+number,"**Formato:** "+ref.formatName+(meta?.recipeVersion?" · receita v"+meta.recipeVersion:""),"Duração estimada: "+c.duracaoSeg+"s","", "## Pendências",...Array.from(new Set(pending)).filter(Boolean).map(x=>"- "+x),"", "## Roteiro falado",...spokenLines(c).map(l=>"**"+l.who+":** "+l.text),"", "## Animação e direção", "Tempos legados são estimados; ajustar ao áudio real.",...(c.cenas??[]).filter(s=>s.acao).map(s=>s.inicio+"–"+s.fim+"s (estimado): "+s.acao),"", "# Referência do canal: "+ref.name,"## Personagens",ref.characters??"Não informado (pendente)","## Estilo visual",ref.visualStyle??"Não informado (pendente)","## Tom e linguagem",ref.tone??"Não informado (pendente)","## Regras fixas",ref.rules??"Não informado (pendente)","## Formato usado: "+ref.formatName,ref.how||"Fechamento não definido; decisão do canal para este formato."].join("\n\n");
}

export async function ideaExport(ideaId:string) {
 const idea=await prisma.idea.findUnique({where:{id:ideaId},include:{myChannel:true,videoFormat:true}});
 if(!idea?.script)return null;
 if(idea.currentVersionId){const v=await prisma.scriptVersion.findFirst({where:{id:idea.currentVersionId,ideaId}});if(!v)throw new Error("Versão inválida");return v.markdown+await critiqueExport(v.id);}
 const channel=idea.myChannel;
 const how=channel&&idea.formatId?await prisma.channelFormat.findUnique({where:{myChannelId_formatId:{myChannelId:channel.id,formatId:idea.formatId}}}):null;
 const ref={name:channel?.name??"Canal pendente",characters:channelIdentity(channel?.characters,idea.videoFormat?.name),visualStyle:channel?.visualStyle??null,tone:channelIdentity(channel?.tone,idea.videoFormat?.name),rules:scopedRules(channel?.rules),formatName:idea.videoFormat?.name??"Formato pendente",how:how?.howText??""};
 if(idea.scriptData){const d=JSON.parse(idea.scriptData) as ScriptContent;return exportScript(d,ref,idea.projectCode??idea.id,0);}
 return idea.script+"\n\n## Pendências\nRoteiro legado sem estrutura de falas; revisão humana pendente.\n\n# Referência do canal: "+ref.name+"\n"+[ref.characters,ref.visualStyle,ref.tone,ref.rules,ref.how].filter(Boolean).join("\n");
}

async function critiqueExport(versionId:string){
 const rows=await prisma.generation.findMany({where:{scriptVersionId:versionId,kind:"script-critic-optional"},orderBy:{createdAt:"asc"}});
 return rows.map(row=>{const c=JSON.parse(row.output) as {observacoes?:string[];hipoteses?:string[];pendencias?:string[]};return "\n\n## Crítica solicitada (não aprova nem reescreve)\n"+[...(c.observacoes??[]).map(s=>"- Observação: "+s),...(c.hipoteses??[]).map(s=>"- Hipótese: "+s),...(c.pendencias??[]).map(s=>"- Pendência apontada na crítica: "+s)].join("\n")}).join("\n");
}
