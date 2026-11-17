import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeInstructions,instructionSnapshot,instructionsFor} from "../src/lib/direction-instructions";
import {extractPqeaInstructions,literalSection,PQEA_WRITER_RULES} from "../src/lib/pqea-instructions";
test("limite por caixa sem truncamento; snapshot não vaza outras funções",()=>{
 const fields={directionGeneral:"GERAL",directionScene:"CENA",directionPhotography:"FOTO",directionSound:"S".repeat(30000)};
 assert.equal(normalizeInstructions(fields).directionSound?.length,30000);
 assert.throws(()=>normalizeInstructions({...fields,directionSound:"S".repeat(30001)}),/30.000/);
 assert.deepEqual(instructionsFor("scene",instructionSnapshot(fields)),{geralDeGravacao:"GERAL",funcao:"CENA"});
 assert.throws(()=>instructionsFor("scene","estudo antigo"),/antiga/);
});
test("extração preserva literalmente seções e exclui módulo 12",()=>{
 const v2=["1","2.1","2.2","2.3","2.4","2.5","3","4","10","11","12","13","14","15","16","18","19"].map(k=>(k.includes(".")?"### ":"## ")+k+". Título\nLiteral "+k+" **sem resumo**.").join("\n\n");
 const study="## B. Direção\n"+Array.from({length:11},(_,i)=>(i+1)+". Regra B"+(i+1)).join("\n")+"\n\n## C. Canal\nFamília e kit.\n\n## Mudanças\nFora";
 const result=extractPqeaInstructions(v2,study);
 assert.equal(result.narrativeRules,PQEA_WRITER_RULES);
 assert.ok(result.directionGeneral?.includes(literalSection(v2,"1")));
 assert.ok(result.directionPhotography?.includes(literalSection(v2,"2.1")));
 assert.ok(result.directionSound?.includes(literalSection(v2,"18")));
 assert.doesNotMatch(result.directionSound!,/Literal 12 |Literal 19 /);
 assert.doesNotMatch(result.directionGeneral!,/Fora/);
});
