# Radar — Fase 1 do gerador

Entrega B–F + G mínimo, em branch radar/fase1-gerador, base master ba4a32a. PR sem merge.

## O que mudou

- Contexto por canal e formato; uma referência é exemplo, não regra. Vozes sem integridade confirmada, cortadas ou de outro formato ficam fora. Lições de outro formato e diagnósticos globais não entram.
- Ideias só com título, premissa, gancho, formato e interesse. Roteiro começa nas falas; uma chamada cria uma versão. Crítica é opcional e não reescreve. Regras fixas do canal continuam prioritárias.
- Correção natural limitada a uma fala, comparação, restauração sem apagar história e aprovação vinculada à versão. Código PQEA sequencial; 001–012 reservados conforme acervo.
- Exportação e campo de copiar usam a mesma fonte, com referência do canal e pendências. Aba de animação separada. Recorte manual do PR15: tabs/helper de falas, sem incorporar crítico/rewrite.
- Uma tabela nova ScriptVersion; campos e FKs aditivos em Idea, Generation e MyChannelScript. Versões antigas são capturadas sem geração e sem aprovação automática.

## Segurança e aplicação

Backup novo antes da migration: radar-pre-fase1-2026-11-15T17-20-02-791Z.db, em GUBS OS/.maestri/tmp/radar-missao; integrity_check=ok. Migration aplicada somente a prisma/radar.db da worktree luiz-gustavo-fase1. Produção e portas3000/3001 não alteradas. Banco e credencial não fazem parte do PR; nenhum .env foi aberto.

Após revisão e autorização de implantação, fazer outro backup do banco alvo; aplicar npx prisma migrate deploy com DATABASE_URL do ambiente correto e rodar npm run phase1:setup. O setup restringe preferências Thor ao canal Por Que É Assim? e ao formato Historinha com regra absurda, reserva códigos existentes e captura roteiros legados. Sem geração paga no setup. Não usar o banco de teste como produção. Rollback de código deve conservar banco e versões; não apagar tabela ou colunas para reverter.

## Validações

- npm test: 63/63; teste de legado ampliado passou separadamente.
- npm run typecheck, npm run lint e npm run build: sucesso. Build mantém quatro avisos preexistentes em backup.ts (tracing de filesystem).
- Porta3002, Edge headless: falas como aba inicial, animação separada, correção da mãe, comparação, aprovação persistente, restauração exata, export HTTP200 igual ao textarea, viewport390 sem overflow e sem pageerror.
- Teste encontrou textarea desatualizado após restauração; corrigido com valor controlado, reteste sem custo passou.
- Crítica opcional, contexto, histórico, versões desatualizadas e acesso cruzado entre projetos: testes automatizados com API simulada. Não foi feita crítica paga.

## Regressão real e evidências

Casos finais: PQEA-020 (Thor, Historinha com regra absurda) e PQEA-021 (Construir resolvendo problemas). Cada geração criou exatamente uma versão e não chamou crítico nem reescrita. No Thor, comandos são invertidos: sai faz deitar; fica faz descer; fica longe faz voltar ao sofá. A mãe arremessa e repõe imediatamente o chinelo. Pendências de voz/peças/direção permanecem explícitas. O exemplo literal vem cá está na premissa enviada; o roteiro demonstra a mesma regra com outros comandos.

Correção real: somente fala2 da mãe mudou; falas1 e3–19 preservadas. v1 e v2 permanecem imutáveis. Restaurações v3/v4 reproduzem v1; aprovação aponta v4. Essas aprovações são somente operações de teste, não aprovação editorial do Gubs.

Quatro pares de regressão foram necessários: os primeiros revelaram narração global conflitante, obrigação indevida de fato científico e risco de mãe sem chinelo. Ajustes de contexto/prompt feitos, sem esconder tentativas ou custos. Os quatro prompts finais não contêm as ordens conflitantes identificadas. O assert do runner final inicialmente contou a correção manual concorrente; ajustado para distingui-la e revalidado sobre o banco, sem nova geração.

Evidências neste repositório: [verificação](evidence/radar-fase1/verification.json), [custos](evidence/radar-fase1/costs.json), [Thor](evidence/radar-fase1/Thor.md), [outro formato](evidence/radar-fase1/Construção.md), [tela](evidence/radar-fase1/review-after.png), [móvel](evidence/radar-fase1/review-mobile.png). Prompts finais request-*.json no mesmo diretório, sem cabeçalhos de autenticação. Todos os ensaios e registros completos ficam no vault em .maestri/tmp/radar-missao/regressao/.

Custo total real registrado: US$ 1.680620 (18 chamadas; teto US$5).

| Chamada | Tipo | US$ |
|---|---|---:|
| 1 | ideas | 0.042604 |
| 2 | script | 0.126232 |
| 3 | ideas | 0.050720 |
| 4 | script | 0.166092 |
| 5 | ideas | 0.046180 |
| 6 | script | 0.137452 |
| 7 | ideas | 0.051864 |
| 8 | script | 0.144056 |
| 9 | ideas | 0.043456 |
| 10 | script | 0.108308 |
| 11 | ideas | 0.050408 |
| 12 | script | 0.131144 |
| 13 | ideas | 0.043524 |
| 14 | script | 0.108780 |
| 15 | ideas | 0.051900 |
| 16 | script-correction | 0.026772 |
| 17 | script | 0.261616 |
| 18 | script-correction | 0.089512 |

## Reproduzir

Usar cópia SQLite e porta3002, com coletas/tracker/backups automáticos desativados. Para gerar novos casos pagos: DATABASE_URL=file:./radar.db, RADAR_REAL_TEST=1, RADAR_EVIDENCE_DIR em diretório novo, RADAR_BUDGET_SINCE no início da janela cumulativa; npm run phase1:regression. O runner reserva custo conservador antes de cada chamada e não repete diretório já iniciado.

UI: node scripts/radar-phase1-ui.mjs com RADAR_EVIDENCE_DIR, RADAR_BROWSER_PATH e Playwright disponível (RADAR_PLAYWRIGHT_ROOT pode apontar para instalação existente). RADAR_UI_CORRECTION=1 faz uma chamada paga, somente com orçamento autorizado; RADAR_UI_RESTORE_FROM=1 retesta restauração sem IA. Rodar UI após finalizar geração evita intercalar registros.

## Limites

Conteúdo gerado continua sujeito à revisão humana: peças novas, coerência visual e narração listadas nas pendências não significam aprovação. Preferências são orientações ao modelo, não garantia semântica automática. Amostras antigas ficam desconhecidas e excluídas até verificação. O mínimo desta fase não inclui importação de devolução da produção, sincronização, retenção ou outro item de fases posteriores.


## Acréscimo do Gubs: Thor V3 → V4 real

A seção Roteiro de correcoes-thor-v3-gubs.md foi enviada literalmente pela UI, selecionando as 36 falas da transcrição do MP4 V3. A interface agora permite intervalo explícito (opcional; padrão uma fala). Fora do intervalo o código preserva as falas; há teste com reorganização de duas falas e preservação do restante.

Importação idempotente na cópia: PQEA-022, versão3; vozes identificadas por tempos.json/montar-thor.py. V1/V2 não foram importadas. Uma chamada script-correction (US$0,089512) criou versão4, mantendo V3 e sem aprovar V4. Exportação HTTP e texto para copiar conferidos.

[V4 entregue com pendências](evidence/radar-fase1/thor-roteiro-v4.md), [export bruto do Radar](evidence/radar-fase1/thor-v4-export-raw.md), [prompt/resultado/custo](evidence/radar-fase1/thor-v4-call.json), [base V3](evidence/radar-fase1/thor-v3-base.json). Arquivo pedido: GUBS OS/.maestri/tmp/radar-missao/thor-roteiro-v4.md.

Conferência: narrador virou Menino em primeira pessoa; três chamadas têm motivo; ração ganhou ação/reação; frase com o menino virou comigo; fala da avó solicitada aplicada; abraço ganhou interrupção/percepção; bola na esquina e fiquei até zonzo mantidos. Pendências reais: a resposta do Thor à fala da avó contrasta com a regra inversa; a ameaça do sítio foi substituída por castigo; terceira chamada foi atribuída ao menino. Não aprovar automaticamente.

O arquivo entregue acrescenta uma seção explicitamente identificada como conferência técnica, sem alterar falas ou a versão salva. O export bruto fica separado para comprovar exatamente o que saiu da UI. Música/chinelo e efeitos visuais não foram renderizados ou validados nesta missão de roteiro. Não houve mudança na seção Imagem, que é do Prisma.
