import { Collapsible } from "./ui";

/** Passo a passo curto (leigo) dos números dos meus vídeos. Usado na lista e nos insights de cada vídeo. */
export function InsightsGuide() {
  return (
    <Collapsible title="Passo a passo: como ler estes números" open className="card p-4" bodyClassName="mt-3">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
        <li>
          <b>Views nas primeiras horas</b> (1h, 3h, 6h, 12h, 24h, 48h, 3 dias, 7 dias): o app mede sozinho enquanto está aberto. É o melhor sinal de que o
          YouTube gostou do vídeo. Cada marco é comparado com os seus outros Shorts na mesma idade.
        </li>
        <li>
          <b>Cores</b>: <span className="text-emerald-300">bom</span> = acima do normal do canal; <span className="text-zinc-200">normal</span> = parecido;{" "}
          <span className="text-red-300">fraco</span> = abaixo. Embaixo de cada número vem o porquê em 1 linha. “Sem base” = ainda não há outros vídeos com
          esse número para comparar.
        </li>
        <li>
          <b>Retenção</b> (% médio visto, duração média, curva) e <b>origem do tráfego</b> vêm do YouTube Analytics, que atrasa 1 a 2 dias. Vídeo de hoje ainda
          aparece sem esses números: é normal.
        </li>
        <li>
          <b>Diagnóstico automático</b>: roda sozinho com 24 horas, 3 dias e 7 dias de vida de cada vídeo (com o app aberto em algum momento desses dias), até 6
          por dia. Ele diz o que funcionou e o que não funcionou e manda as lições para o Gerador.
        </li>
        <li>
          <b>Números do Studio</b> (“continuaram assistindo”, CTR, impressões): o YouTube não libera pela API. Abra o vídeo no YouTube Studio, aba Analytics,
          copie o número e cole na página do vídeo em “Colar números do YouTube Studio num marco”, escolhendo o marco (ex.: 24h).
        </li>
        <li>
          <b>Atualiza sozinho</b>: com o acompanhamento ligado (Configurações → Acompanhar meus vídeos), esta página recarrega os números a cada 2 minutos.
        </li>
      </ol>
    </Collapsible>
  );
}
