import {test} from "node:test";import assert from "node:assert/strict";
import {channelIdentity,completeSample,recipeEvidence,scopedRules} from "../src/lib/script-context";
import {voiceScripts} from "../src/lib/generator";
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
 assert.match(recipeEvidence('{"motor":[{"passo":"causa e consequência"}]}','["video"]'),/1 exemplo, não é regra/);
 assert.equal(narrationWarnings([{personagem:"Narrador",fala:"Eu caí. O menino sentou."}]).length,1);
});
