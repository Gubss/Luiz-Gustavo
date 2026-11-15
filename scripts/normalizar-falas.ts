import { prisma } from "../src/lib/db";
import { appendVersion } from "../src/lib/script-versions";
import { normalizeSpokenEntries, type SpokenEntry } from "../src/lib/script-normalize";

async function main() {
 const args=process.argv.slice(2);
 const value=(flag:string)=>args[args.indexOf(flag)+1];
 if(!process.env.DATABASE_URL || !args.includes("--idea") || !args.includes("--version")) throw new Error("Informe DATABASE_URL, --idea <id> e --version <n>; use --dry-run para conferir sem gravar.");
 for(let i=0;i<args.length;i++) {
  if(args[i]==="--dry-run") continue;
  if(["--idea","--version"].includes(args[i]) && args[i+1] && !args[i+1].startsWith("--")) { i++; continue; }
  throw new Error("Argumento inválido: "+args[i]);
 }
 const idea=await prisma.idea.findUniqueOrThrow({where:{id:value("--idea")}});
 if(!idea.currentVersionId) throw new Error("Projeto sem versão atual.");
 const version=await prisma.scriptVersion.findFirstOrThrow({where:{id:idea.currentVersionId,ideaId:idea.id}});
 if(version.number!==Number(value("--version"))) throw new Error("A versão atual mudou; confira novamente antes de reparar.");
 const content=JSON.parse(version.content);
 if(!Array.isArray(content.falado) || !content.falado.every((l:SpokenEntry)=>typeof l.personagem==="string" && typeof l.fala==="string")) throw new Error("Roteiro sem falas estruturadas válidas.");
 const entries=content.falado as SpokenEntry[];
 const normalized=entries.flatMap((entry,index)=>{
  const next=normalizeSpokenEntries([entry]);
  if(!next.length) throw new Error("Fala vazia: "+(index+1));
  if(JSON.stringify(next)!==JSON.stringify([entry])) console.log(JSON.stringify({falaOriginal:index+1,antes:entry,depois:next},null,2));
  return next;
 });
 if(JSON.stringify(entries)===JSON.stringify(normalized)) { console.log("Nenhuma mudança necessária."); return; }
 const section=/## Roteiro falado\r?\n[\s\S]*?(?=\r?\n## Animação e direção)/;
 if(!section.test(version.markdown)) throw new Error("Seção de falas não encontrada; exportação exige revisão.");
 const body="## Roteiro falado\n\n"+normalized.map(l=>"**"+l.personagem+":** "+l.fala).join("\n\n")+"\n";
 const markdown=version.markdown.replace(section,()=>body);
 console.log(idea.projectCode+" · versão "+version.number+" → nova versão · "+entries.length+" → "+normalized.length+" falas · US$ 0");
 if(args.includes("--dry-run")) { console.log("DRY-RUN: nenhuma gravação."); return; }
 // Explicit writes create a version; the source and approval are never changed.
 const next=await appendVersion({ideaId:idea.id,expectedVersionId:version.id,content:JSON.stringify({...content,falado:normalized}),markdown:(code,n)=>markdown.replace(/\*\*Projeto:\*\*[^\n]*/,()=>"**Projeto:** "+code+" · versão "+n),request:"Separar falas incorporadas e remover rótulos duplicados, sem alterar o texto falado.",category:"limite técnico",origin:"normalization",author:"normalização sem IA"});
 console.log("Criada versão "+next.number+" ("+next.id+"); sem aprovação.");
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; }).finally(()=>prisma.$disconnect());
