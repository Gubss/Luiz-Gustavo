/**
 * Conferência de lógica e graça em código (sem IA): aula disfarçada, bordão repetido e fecho que explica a piada.
 * Fixture reprovada: roteiro dos balões (v3) que o Gubs reprovou em 15/11/2026 ("sem pé nem cabeça").
 * Fixture aprovada: trecho do vulcão publicado em 14/11/2026, que nomeia as peças e repete "Chinelada." e passa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScriptText, limitsFromApproved, shortRepeats } from "../src/lib/script-check";

const BALOES = [
  "Se você amarra um balão de gás no Thor, ele sai voando.",
  "Mas ele só boceja.",
  "O Thor? Nem um pelo.",
  "Então você solta o balão, pra ver se ele presta. Ele dispara e bate no teto.",
  "Dentro tem hélio, um gás mais leve que o ar.",
  "O ar empurra ele pra cima, igual rolha no balde. Esse é o empuxo.",
  "É por isso que balão de assopro cai, e o de gás sobe.",
  "Mas um balão desses levanta uns dez gramas. Quase nada.",
  "Então você sobe na cadeira e pega os balões do teto.",
  "Vinte. Na coleira.",
  "Então você abre a válvula do cilindro de gás da festa e enche balão novo.",
  "Essa é a válvula.",
  "Mas cada balão que você larga, pra encher o próximo, sobe pro teto.",
  "É por isso que balão de festa vem preso num pesinho.",
  "Então você amarra o cacho na caixa do bolo da sua avó.",
  "Peso que segura, igual tijolo em cima da lona. Esse é o lastro.",
  "Mas balão na coleira puxa pelo pescoço.",
  "Então você põe um peitoral, que abraça o peito igual mochila. Esse é o peitoral.",
  "Um balão de teste.",
  "O cacho já quase empata com o bolo. A caixa fica leve, leve.",
  "E amarra o dela na caixa.",
  "Quem voou foi o bolo.",
  "Pra levantar o Thor, com trinta quilos, você ia precisar de uns três mil balões.",
  "Mais balão do que cabe na sala.",
  "Parabéns: você construiu um bolo voador.",
  "Primeiro pedaço: da vó ou do Thor? Comenta.",
  "E se inscreve: esse bolo ainda tem que descer.",
].map((text) => ({ who: "Narrador", text }));

const VULCAO = `Cadê o trabalho da escola?
…que trabalho?
É um vulcão.
É pra amanhã.
Você faz o óbvio: um monte de massinha, vinagre e bicarbonato por cima.
A espuma escorre pro tapete.
Chinelada.
Então você faz a mistura dentro de um pote, no meio da montanha.
Agora ela só sai por cima.
Essa é a câmara.
Mas montanha de massinha leva três dias pra secar.
Então você faz ela de jornal e cola.
Seca até de manhã.
Esse é o cone.
Mas na primeira erupção o jornal molha, amolece e a montanha deita.
No tapete.
De novo.
Chinelada.
Então você troca o pote por uma garrafa.
Pelo gargalo, ela sai jorrando.
Essa é a chaminé.
Mas jorra branca.
Parece que o vulcão tá escovando os dentes.
Então você pinga corante vermelho.
Essa é a lava.
Agora ela jorra vermelha.
No sofá.
No Thor.
E o que você acha que acontece?
Chinelada.
Você põe uma panela na cabeça pra se proteger.
Chinelada.
Sete da manhã.
Câmara, cone, chaminé e lava.
Parabéns: você construiu um vulcão.
A professora olha, sorri e fala: Lindo.
Mas o trabalho era o sistema solar.
E lá de casa... vem vindo um chinelo.
Comenta aí: tirei dez ou tomei chinelada?
E se inscreve.`;

const lines = (t: string) => t.split("\n").map((text) => ({ text }));

test("balões v3 (reprovado pelo Gubs) é reprovado: aula disfarçada e fecho que explica", () => {
  const r = checkScriptText(BALOES);
  assert.equal(r.ok, false);
  assert.equal(r.namings.length, 4, "empuxo, válvula, lastro, peitoral");
  assert.deepEqual(
    r.namings.filter((n) => n.explained).map((n) => n.sentence),
    ["Esse é o empuxo.", "Esse é o lastro.", "Esse é o peitoral."],
    "os três com comparação (igual rolha, igual tijolo, igual mochila)",
  );
  assert.ok(r.problems.some((p) => p.startsWith("Aula disfarçada: 3 termos explicados")));
  assert.ok(r.problems.some((p) => p.startsWith("Nomes demais: 4")));
  assert.equal(r.explainingEnd?.sentence, "Parabéns: você construiu um bolo voador.");
});

test("balões v3 continua reprovado mesmo com os limites do vulcão aprovado", () => {
  const r = checkScriptText(BALOES, limitsFromApproved([VULCAO]));
  assert.equal(r.ok, false, "3 termos explicados passam do máximo de 1, seja qual for o formato");
  assert.ok(r.explainingEnd, "o vulcão tem 'Mas o trabalho era…' depois do Parabéns; os balões não");
});

test("vulcão aprovado passa com os próprios limites: nomes de peça sem aula, bordão do formato, fecho com virada", () => {
  const lim = limitsFromApproved([VULCAO]);
  assert.deepEqual(lim, { namingLimit: 4, catchphraseLimit: 4 });
  const r = checkScriptText(lines(VULCAO), lim);
  assert.equal(r.explained, 0, "dar nome à peça que o menino acabou de construir não é explicar conceito");
  assert.equal(r.explainingEnd, null);
  assert.deepEqual(r.problems, []);
  // Sem roteiro aprovado no formato, o padrão é rígido (1 nome, bordão 2 vezes).
  const strict = checkScriptText(lines(VULCAO));
  assert.ok(strict.problems.some((p) => p.includes('"Chinelada" 4 vezes')));
});

test("bordão repetido: frase curta acima de 2 vezes vira problema", () => {
  const r = checkScriptText(lines("O Thor? Nem um pelo.\nVocê puxa mais forte.\nNem um pelo.\nVocê usa o aspirador.\nNem um pelo."));
  assert.deepEqual(r.catchphrases, [{ phrase: "Nem um pelo", times: 3 }]);
  assert.ok(r.problems.some((p) => p === 'Bordão repetido: "Nem um pelo" 3 vezes (máximo 2).'));
  assert.equal(checkScriptText(lines("Nem um pelo.\nVocê puxa.\nNem um pelo.")).catchphrases.length, 0, "2 vezes pode");
  assert.equal(shortRepeats(["Uma frase bem comprida que não é bordão nenhum. Uma frase bem comprida que não é bordão nenhum."]).length, 0, "frase longa não conta");
});

test("1 termo explicado dentro da piada passa", () => {
  const r = checkScriptText(lines("O balão sobe igual rolha no balde. Esse é o empuxo.\nMas o Thor nem se mexe.\nA avó grita: meu bolo!"));
  assert.equal(r.explained, 1);
  assert.deepEqual(r.problems, []);
});
