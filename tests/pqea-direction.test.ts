import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPqeaStudy, directionPrompt, ScenePlanSchema, validateScenePlan } from "../src/lib/direction-study";
import { directionWarnings } from "../src/lib/script-direction-check";
test("import PQEA somente A/B/C e precedência das falas", () => {
 const source = "---\nfontes: não importar\n---\n# Título\n## A. Estrutura\n1. Gancho\n## B. Direção\n1. Câmera\n## C. Canal\n- Família\n## Mudanças\nNão importar";
 const study = extractPqeaStudy(source);
 assert.doesNotMatch(study, /fontes|Mudanças|Não importar/);
 assert.match(directionPrompt(study), /A seção A rege as FALAS/);
 assert.match(directionPrompt(study), /prevalecem sobre fechos/);
 assert.match(directionPrompt(study), /exatamente uma entrada por fala/);
 assert.throws(()=>extractPqeaStudy("## A. Estrutura\nGancho"), /Seção B/);
 assert.equal(directionPrompt(null),"");
});
test("plano requer seis componentes e uma entrada por fala", () => {
 const scene={falaInicial:1,falaFinal:1,tela:"Barbante",plano:"close",camera:"fixa",acao:"amarra",efeito:"fio",trilha:"continua",etiqueta:"nenhuma"};
 const plan=ScenePlanSchema.parse([scene,{...scene,falaInicial:2,falaFinal:2}]);
 validateScenePlan(plan,2);
 assert.throws(()=>validateScenePlan([{...scene,falaFinal:2}],2));
 assert.throws(()=>ScenePlanSchema.parse([{...scene,plano:undefined}]));
 assert.throws(()=>ScenePlanSchema.parse([{...scene,trilha:" "}]));
});
test("avisos determinísticos do fim e duração; só a última fala", () => {
 for(const text of ["Comenta aí!","Inscreva-se!","Se inscreve","Segue o canal","Tchau!","Até a próxima!","Até mais!","Adeus!"]) assert.equal(directionWarnings([{text}],90).length,1,text);
 assert.deepEqual(directionWarnings([{text:"Tchau!"},{text:"Quem puxou meu fio?"}],100),[]);
 assert.equal(directionWarnings([{text:"Quem puxou meu fio?"}],101).length,1);
 assert.equal(directionWarnings([{text:"Tchau!"}],101).length,2);
 assert.deepEqual(directionWarnings([],0),[]);
});
