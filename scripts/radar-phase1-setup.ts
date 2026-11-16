import { captureLegacyVersion } from "../src/lib/script-versions";
import { prisma } from "../src/lib/db";
async function main(){
// Explicitly approved channel preferences, sourced from the 15/11 mission. Idempotent.
const channel=await prisma.myChannel.findFirst({where:{name:"Por Que É Assim?"}});
if(!channel?.nicheId)throw new Error("Canal Por Que É Assim? não encontrado; nada foi alterado.");
const format=await prisma.videoFormat.findFirst({where:{nicheId:channel.nicheId,name:"Historinha com regra absurda"}});
if(!format)throw new Error("Formato historinha não encontrado; nada foi alterado.");
const preferences=["Mãe fala naturalmente como mãe bronqueando, sem fórmula repetida.","Mãe só braço e voz, em casa, sempre com chinelo na mão; pode jogar o chinelo de forma cômica quando há bagunça, pegando outro imediatamente; nunca fica sem chinelo após o arremesso. Pai só pernas.","Tensão sobe até um clímax de ação concreta e visível, seguido da reação do menino, e então alivia.","Drama vem da imagem; nunca de silêncio sem música.","Se a narração mistura menino em primeira pessoa e narrador externo, registrar pendência para o Gubs decidir."];
await prisma.$transaction(async tx=>{
 const fixed="Pai, quando aparecer, só as pernas; mãe só braço com chinelo e voz, nunca corpo inteiro.";
 if(!channel.rules?.includes(fixed))await tx.myChannel.update({where:{id:channel.id},data:{rules:[channel.rules,fixed].filter(Boolean).join("\n")}});
 for(const text of preferences)if(!await tx.channelLesson.findFirst({where:{myChannelId:channel.id,formatId:format.id,source:"preferencia-thor-v3",text}}))await tx.channelLesson.create({data:{myChannelId:channel.id,formatId:format.id,source:"preferencia-thor-v3",text}});
 // PQEA-001 through PQEA-012 already exist in the channel's vault (Pote de sorvete = 012).
 const key="projectCodeFloor:"+channel.id;
 const floor=Number((await tx.setting.findUnique({where:{key}}))?.value??0);
 await tx.setting.upsert({where:{key},create:{key,value:"12"},update:{value:String(Math.max(12,floor))}});
});
for(const idea of await prisma.idea.findMany({where:{currentVersionId:null,script:{not:null}},select:{id:true}}))await captureLegacyVersion(idea.id);
console.log("Preferências Thor V3 restritas ao formato; sequência PQEA preservada (001–012 reservados). Nenhuma geração executada.");
await prisma.$disconnect();

}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
