import {test} from "node:test";import assert from "node:assert/strict";
import {channelIdentity,completeSample,recipeEvidence,scopedRules} from "../src/lib/script-context";
import {profileBlock,voiceScripts} from "../src/lib/generator";
import {narrationWarnings} from "../src/lib/script-check";
import type {MyChannelScript} from "@prisma/client";
test("context excludes unknown, wrong-format and cut voice; preserves complete samples",()=>{
 const sample={formatId:"family",integrity:"complete",script:"Mãe: Volta aqui agora, garoto!"} as MyChannelScript;
 assert.equal(voiceScripts([sample,{...sample,formatId:"build"},{...sample,formatId:null},{...sample,integrity:"unknown"},{...sample,script:"Ela disse que a"}],"family").scripts.length,1);
 assert.doesNotMatch(channelIdentity('Leve e engraçado. Você o tempo todo. Nas histórias, narra em primeira pessoa.'),/tempo todo|primeira pessoa/);
 assert.equal(completeSample("Era uma vez alguma coisa..."),false);
 assert.equal(completeSample("Era uma vez alguma coisa… (cortado)"),false);
 assert.match(scopedRules("Mãe só braço.\nSempre inscrição\nPai só pernas."),/Mãe só braço/);
 assert.doesNotMatch(scopedRules("Sempre inscrição"),/inscrição/);
 // Cotas saem; regras contra repetição ficam ("publicado" contém "cada").
 assert.match(scopedRules("- Nunca: repetir frase ou bordão de vídeo publicado."),/publicado/);
 assert.match(scopedRules("O bordão muda a cada episódio."),/episódio/);
 assert.doesNotMatch(scopedRules("Bordão a cada 20–30 s.\nBordão no máximo 2 vezes."),/Bordão/);
 assert.match(recipeEvidence('{"motor":[{"passo":"causa e consequência"}]}','["video"]'),/1 exemplo, não é regra/);
 assert.equal(narrationWarnings([{personagem:"Narrador",fala:"Eu caí. O menino sentou."}]).length,1);
});

test("perfil tem teto de tamanho e omite amostras inteiras em vez de cortá-las",()=>{
 const sample={formatId:"family",integrity:"complete",title:"Grande",script:"AMOSTRA_GRANDE "+"texto ".repeat(5000)+"Fim."} as MyChannelScript;
 const channel={name:"Teste",format:"short",concept:"identidade ".repeat(5000),scripts:[sample,{...sample,title:"Curta",script:"Uma amostra curta, completa e preservada!"}]} as Parameters<typeof profileBlock>[0];
 const block=profileBlock(channel,"short",{formatId:"family",formatName:"Historinha"});
 assert.ok(block.length<=20000);
 assert.match(block,/cortado/);
 assert.doesNotMatch(block,/AMOSTRA_GRANDE/);
 assert.match(block,/Uma amostra curta, completa e preservada!/);
 assert.match(block,/Amostras de voz omitidas/);
});