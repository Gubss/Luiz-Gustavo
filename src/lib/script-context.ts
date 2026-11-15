/** Context only from the selected channel/format. Raw studies remain intact. */
export function scopedRules(text: string | null | undefined) {
 return (text??"").split(/\r?\n/).filter(line=>!/(?:inscrev|inscri|\bCTA\b|pergunta.*duas opções|piada.*(?:obrigat|cada|pelo menos)|bord[aã]o.*(?:cada|máximo)|nunca.*n[uú]mero|sem conta e sem número)/i.test(line)).join("\n");
}
export function completeSample(text:string) {
 return !text.trim().endsWith("...") && text.trim().length>20 && /[.!?…][”"')]*$/.test(text.trim()) && !/(?:\(cortado\)|\[truncad|…$)/i.test(text.trim());
}
export function recipeEvidence(content:string,videoIds:string) {
 let r:Record<string,unknown>={}; let ids:string[]=[];
 try {r=JSON.parse(content);ids=JSON.parse(videoIds);} catch {return "Receita sem estrutura verificável; consulte o estudo original.";}
 const hypotheses=Array.isArray(r.porQueViralizou)?r.porQueViralizou as {hipotese:string;evidencia:string;estudos:number[]}[]:[];
 const motor=Array.isArray(r.motor)?r.motor as {passo:string}[]:[];
 return [ids.length===1?"1 exemplo, não é regra":ids.length+" exemplos; hipóteses, não regras",
 "Fontes recuperáveis (Video.id): "+ids.join(", "),
 "Mecanismo observado no estudo (não copiar a história): "+motor.map(p=>p.passo).join(" → "),
 ...hypotheses.map(h=>"Hipótese: "+h.hipotese+" | Evidência relatada: "+h.evidencia+" | Estudos: "+h.estudos?.join(", ")),
 "Desconhecido: frames não foram vistos nesta etapa; não inferir retenção/CTR externos. Duração, voz e CTA da referência não são regras do canal."].join("\n");
}

/** Narrative choices belong in ChannelFormat, not the shared identity paragraph. */
export function channelIdentity(text:string|null|undefined){
 return (text??"").replace(/,? com fato verificado:?/gi, "").split(/\r?\n|(?<=[.!?])\s+/).filter(s=>!/(?:quem narra|no formato|nas histórias|narra.*primeira pessoa|narrador e menino|você.*tempo todo|palavras por segundo|em todo vídeo|espectador sai|pergunta do fim)/i.test(s)).join("\n");
}
