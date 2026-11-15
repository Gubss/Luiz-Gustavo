import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { WorkSection } from "@/components/workflow";

export const metadata = { title: "Como usar · YouTube Radar" };

/** Manual curto dentro do app. Tudo aqui sai do código e do README; ao mudar uma regra, mude aqui também. */
const STEPS: { n: number; title: string; text: string; href: string; cta: string }[] = [
  { n: 1, title: "Pesquisar", text: "O Radar mostra os vídeos que foram muito melhor que o normal nos canais de referência.", href: "/radar", cta: "Abrir o Radar" },
  { n: 2, title: "Estudar a referência", text: "Escolha um vídeo que estourou e clique em Estudar: o app explica por que ele funcionou.", href: "/estudos", cta: "Ver estudos" },
  { n: 3, title: "Ideia", text: "No Gerador, escolha o canal e o formato: saem 5 ideias com gancho e títulos.", href: "/gerador", cta: "Gerar ideias" },
  { n: 4, title: "Roteiro", text: "Na ideia, clique em Escrever roteiro: sai cena a cena, já conferido (veja abaixo).", href: "/ideias", cta: "Ver ideias" },
  { n: 5, title: "Revisão do Estúdio", text: "Leia o roteiro. Não gostou? Devolver, cole os pontos e clique em Corrigir roteiro. Gostou? Siga para a produção.", href: "/ideias", cta: "Ver ideias" },
  { n: 6, title: "Produção", text: "Baixe o roteiro (.md), mande para o Estúdio e mude o estado para Produzido.", href: "/ideias", cta: "Ver ideias" },
  { n: 7, title: "Publicado e números", text: "Ligue a ideia ao vídeo publicado. Meus vídeos mostra como ele está indo e o que aprender.", href: "/meus-videos", cta: "Meus vídeos" },
];

const WORDS: { term: string; text: string }[] = [
  { term: "Formato", text: "Um jeito de contar que se repete no nicho (ex.: desastre em cadeia). É tirado de 3 a 8 vídeos estudados parecidos." },
  { term: "Receita", text: "O passo a passo de um formato: como abre, quem narra, a ordem, como fecha. O roteiro segue a receita do formato escolhido. Formato sem receita ainda: a tela avisa e pede confirmação antes de escrever." },
  { term: "Regra geral do nicho", text: "O que todos os formatos prontos têm em comum (gancho, ritmo, duração). Vai junto com a receita." },
  { term: "Perfil do canal", text: "Quem são os personagens, o tom, o estilo visual, o que sempre e o que nunca. O que acontece na história vem daqui; da referência só vem o jeito de contar." },
  { term: "Exemplos aprovados", text: "Campo no perfil do canal (Meus canais → Perfil). Cole os roteiros que você aprovou e o seu guia de correção. O gerador copia o ritmo e o humor, nunca as falas. Cabe até ~20 mil letras." },
  { term: "Aprendizados", text: "Cada ponto de uma devolução vira um aprendizado do canal e vale mais que a receita nos próximos roteiros. Dá para tirar no perfil." },
  { term: "Cartilha", text: "Versão antiga da receita, que juntava tudo. Fica só para consulta; o gerador não usa mais." },
  { term: "Outlier", text: "Vídeo que teve muito mais views que o normal do próprio canal (ex.: 5x a média). É o sinal de que o tema ou o jeito funcionou." },
];

const CHECKS: string[] = [
  "É um desenho contando uma historinha: antes de escrever, o roteiro diz em 1 frase quem quer o quê e o que atrapalha.",
  "Se o formato não combina com o tema (ex.: aula para um cachorro voando com balões), a tela avisa e sugere outro formato. Ele não troca sozinho.",
  "Cada ação tem motivo e o resultado nasce do passo anterior.",
  "No máximo 1 termo técnico explicado, dentro de uma piada. Nada de \"Esse é o…\" em série.",
  "Pelo menos 3 momentos engraçados, cada um com reação de alguém. Bordão no máximo 2 vezes. O fim não explica a piada.",
  "Tema absurdo não tem conta nem número.",
];

const COSTS: { action: string; cost: string }[] = [
  { action: "Coletar (Radar)", cost: "Grátis em dinheiro. Gasta cota do YouTube: ~4 por canal por dia, de 10.000." },
  { action: "Descobrir canais", cost: "Grátis em dinheiro. ~102 de cota por palavra-chave." },
  { action: "Buscar legenda", cost: "Grátis." },
  { action: "Estudar (diagnóstico)", cost: "≈ US$ 0,05 a 0,30 por vídeo." },
  { action: "Comentários", cost: "≈ US$ 0,03 e 2 de cota." },
  { action: "Gerar ideias", cost: "≈ US$ 0,10 a 0,25 por 5 ideias." },
  { action: "Escrever ou corrigir roteiro", cost: "≈ US$ 0,10 a 0,25 num Short, mais ≈ US$ 0,04 da leitura de espectador. Se precisar reescrever, o teto do botão já inclui." },
  { action: "Diagnóstico do meu vídeo", cost: "≈ US$ 0,10 a 0,25." },
  { action: "Perfil a partir do meu canal", cost: "≈ US$ 0,15 a 0,30." },
  { action: "Devolver, copiar, baixar, mudar estado", cost: "Grátis." },
];

export default function ComoUsar() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Como usar" subtitle="O caminho do Radar em 7 etapas, o que cada palavra quer dizer e quanto cada botão gasta." />

      <ol className="space-y-2">
        {STEPS.map((s) => (
          <li key={s.n} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-zinc-600 text-sm font-semibold tabular-nums">{s.n}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-zinc-100">{s.title}</div>
              <p className="text-sm text-zinc-400">{s.text}</p>
            </div>
            <Link href={s.href} className="btn-ghost btn-sm">{s.cta}</Link>
          </li>
        ))}
      </ol>

      <WorkSection id="dia" title="A ordem que funciona melhor no dia" open>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
          <li>Abra o Radar e veja o que estourou (a coleta roda sozinha ao abrir).</li>
          <li>Estude 1 ou 2 vídeos do formato que você quer fazer.</li>
          <li>Gere ideias nesse formato e escolha uma.</li>
          <li>Escreva o roteiro e leia inteiro.</li>
          <li>Não ficou bom? Devolva com os pontos, um por linha, e clique em Corrigir roteiro.</li>
          <li>Ficou bom? Baixe o .md e mande para o Estúdio.</li>
        </ol>
      </WorkSection>

      <WorkSection id="conferencia" title="O que o app confere no roteiro antes de mostrar">
        <p className="text-sm text-zinc-400">São duas conferências, automáticas, depois que o roteiro é escrito:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li><b className="font-medium text-zinc-100">Conferência em código (grátis):</b> conta frases-aula (&quot;Esse é o…&quot;), bordão repetido, conta e número em tema absurdo e fim que explica a piada.</li>
          <li><b className="font-medium text-zinc-100">Leitura de espectador (segunda passada):</b> um modelo mais barato lê como uma criança assistindo e marca onde riu, onde não entendeu o motivo, frases-aula e bordões.</li>
          <li>Se tiver menos de 3 risadas ou algum problema, o app reescreve <b className="font-medium text-zinc-100">uma vez</b> só esses trechos. O que sobrar aparece como aviso na tela da ideia.</li>
        </ul>
        <p className="text-sm text-zinc-400">A regra que vale para todo roteiro, com formato ou sem:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          {CHECKS.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </WorkSection>

      <WorkSection id="palavras" title="O que cada palavra quer dizer">
        <dl className="space-y-3 text-sm">
          {WORDS.map((w) => (
            <div key={w.term}>
              <dt className="font-medium text-zinc-100">{w.term}</dt>
              <dd className="text-zinc-400">{w.text}</dd>
            </div>
          ))}
        </dl>
      </WorkSection>

      <WorkSection id="custos" title="Quanto cada botão gasta">
        <p className="text-sm text-zinc-400">Todo botão que gasta mostra o custo antes de rodar. O gasto do mês fica em <Link href="/configuracoes" className="underline">Configurações</Link>, com limite por mês.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {COSTS.map((c) => (
                <tr key={c.action} className="border-t border-line align-top">
                  <td className="py-2 pr-4 font-medium text-zinc-200">{c.action}</td>
                  <td className="py-2 text-zinc-400">{c.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkSection>
    </div>
  );
}
