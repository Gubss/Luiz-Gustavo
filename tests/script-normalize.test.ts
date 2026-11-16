import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpokenEntries as normalize } from "../src/lib/script-normalize";

test("fala nova sem rótulo herda o personagem corrigido",()=>{
 assert.deepEqual(normalize([{personagem:"Menino",fala:"Mas parece.\nKachau!"}]),[{personagem:"Menino",fala:"Mas parece."},{personagem:"Menino",fala:"Kachau!"}]);
});
test("fala de outro personagem e rótulos repetidos não se misturam",()=>{
 const input=[{personagem:"Menino",fala:"**Menino:** Menino: Botei o pé.\r\nAvó: Taca-lhe pau!\nKachau!"}];
 const expected=[{personagem:"Menino",fala:"Botei o pé."},{personagem:"Avó",fala:"Taca-lhe pau!"},{personagem:"Menino",fala:"Kachau!"}];
 assert.deepEqual(normalize(input),expected);
 assert.deepEqual(normalize(expected),expected);
 assert.match(input[0].fala,/Menino: Botei/,"não altera a entrada");
});
test("objetos separados, personagem omitido e dois-pontos no texto",()=>{
 assert.deepEqual(normalize([{personagem:"",fala:"Eu pensei: agora vai."},{personagem:"Avó",fala:"**Avó**: Bora!"}],"Menino"),[{personagem:"Menino",fala:"Eu pensei: agora vai."},{personagem:"Avó",fala:"Bora!"}]);
});
