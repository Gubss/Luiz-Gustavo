import { normalizeInstructions } from "./direction-instructions";
export const PQEA_WRITER_RULES = 'Regras testadas pela retenção do canal (acrescentar só o que for provado):\n1. Gancho forte nos 3 primeiros segundos: a primeira frase abre uma pergunta que só o fim responde.\n2. O fim completa ou repete o começo, para o vídeo parecer um loop.\n3. Nada de pedir comentário, inscrição ou "segue o canal", nem despedida.';
/** Literal Markdown sections: includes subordinate headings, stops at same or higher level. */
export function literalSection(source:string,key:string){
 const lines=source.replace(/\r\n/g,"\n").split("\n");
 const start=lines.findIndex(line=>{const m=line.match(/^#{2,3} (\S+)/);return m&&(m[1]===key||m[1]===key+".");});
 if(start<0)throw new Error("Seção ausente: "+key);
 const level=lines[start].match(/^#+/)![0].length;
 const end=lines.findIndex((line,i)=>i>start&&new RegExp("^#{1,"+level+"} ").test(line));
 return lines.slice(start,end<0?undefined:end).join("\n").trim();
}
export function extractPqeaInstructions(v2:string,study:string){
 const b=literalSection(study,"B");
 const rules=(ids:number[])=>ids.map(id=>{const line=b.split("\n").find(l=>l.startsWith(id+". "));if(!line)throw new Error("Regra B"+id+" ausente");return line;}).join("\n");
 const sections=(keys:string[])=>keys.map(key=>literalSection(v2,key));
 return {narrativeRules:PQEA_WRITER_RULES,...normalizeInstructions({
  directionGeneral:[...sections(["1","3","2.5"]),rules([11]),literalSection(study,"C")].join("\n\n"),
  directionScene:[...sections(["2.4","4"]),rules([5,6,8,10])].join("\n\n"),
  directionPhotography:[...sections(["2.1","2.2","2.3"]),rules([2,3,4,7])].join("\n\n"),
  directionSound:[...sections(["10","11","13","14","15","16","18"]),rules([9])].join("\n\n")
 })};
}
