# Roteirista e diretores separados

## Problema e comportamento

O PR 17 enviava o estudo A/B/C para a chamada das falas, trocava a tarefa do roteirista por roteiro + plano e impunha 90 segundos. Esta mudança restaura o pedido/schema do PR 16, sem direção embutida, e cria etapas independentes após aprovação: cena → fotografia → som → integração em código. Cada chamada precisa de ação explícita com estimativa. Aprovar e integrar não chamam IA.

A prioridade do adendo foi manter o contrato do roteirista do PR 16. Não foi adicionado um novo campo obrigatório de mapa narrativo à resposta da IA: a encenação organiza os acontecimentos das falas aprovadas em intervalos contíguos. Uma cena pode conter várias falas. Regras narrativas adicionais ficam editáveis no formato e vazias por padrão; o estudo antigo não é automaticamente copiado para esse campo.

## Comparação real

- Rolimã: PQEA-003, geração `cmwie25j10022fs6kjjkcszap`, 2026-11-15 22:10:51 UTC, Opus 5.5, esforço medium, 31 falas, 125s estimados. V1 gerada; V4 atual/aprovada é normalização.
- Telefone: PQEA-004, geração `cmwie20ad001zfs6kx3n0idvy`, 2026-11-15 22:10:44 UTC. V1 aprovada, V3 atual corrigida. A divergência de aprovação foi preservada: a V3 não ganha aprovação automática.
- Gol: PQEA-007, geração `cmwk1wu5a000gfss4z64ruywc`, 2026-11-17 02:06:20 UTC, mesmo modelo/esforço, 20 falas, 95s estimados e 20 entradas de direção.
- A outra geração da rodada original foi PQEA-001, casinha do Thor, 22:10:20 UTC. É candidata ao terceiro exemplo mencionado, não confirmação de aprovação do usuário.

Os arquivos `comparison-system.diff` e `comparison-user.diff` são diferenças literais de `Generation.input`, consultado em SQLite somente leitura. A receita, as amostras de voz e o restante do contexto anterior ao bloco da ideia não mudaram, exceto perfil da mãe e duração. Entraram A/B/C, prioridade do estudo sobre fechamento/duração, pedido de plano e uma entrada por fala. O system passou de 1.376 a 1.417 caracteres; o user, de 11.852 a 15.894. Não saiu uma instrução explícita de humor: o que saiu foi a proibição de produzir direção na chamada narrativa.

No texto, o rolimã desenvolve cada problema mecânico e intercala piadas como a vassoura olhando para o menino e o raio pintado que não acelera. O gol ainda tem piadas (rede florida, alambrado molhado), mas sua própria resposta registra conflito de fechamento, narrador e duração. Portanto, a mistura de instruções está comprovada; atribuir toda diferença de qualidade exclusivamente a ela não é um experimento causal. Nenhuma nova geração paga/A-B foi feita.

O teste `PR16: prompt histórico do rolimã reproduzido literalmente` reconstrói o pedido com o contexto histórico e compara system/user integralmente. O perfil atual da mãe continua como está. A exceção atual autorizada é a faixa 60–180s, decidida pela história, sem alvo fixo 120s e sem aviso antigo de 90s.

## Dados e segurança

Duas migrations aditivas criam `DirectionRun`, regras narrativas opcionais e limites de duração. Apenas o canal PQEA identificado na missão recebe 60–180s; outros canais mantêm o comportamento anterior. Nenhuma migration foi aplicada ao banco real nesta entrega.

Cada direção guarda versão, hash do conteúdo, estudo e referência congelados, resultados separados, custo e erro. Antes de chamar e antes de salvar, verifica versão atual aprovada. Mudanças/restauração exigem nova aprovação e não reutilizam direção antiga. Schemas estritos não aceitam campos de fala; IDs e cobertura são validados. Respostas parciais não apagam etapas concluídas. Lock por versão evita chamadas duplicadas; execução expirada pode ser retomada após 15 minutos e a resposta antiga não pode sobrescrever a nova.

Os metadados da IA ainda precisam de revisão humana: validação estrutural não prova que toda decisão visual respeita semanticamente a história. A integração calcula tempos proporcionais às palavras, sempre marcados como estimados; não gera voz nem mede áudio.

O único write autorizado no master foi A.9 do estudo, sem IA, com SQLite backup antes e UPDATE condicional. Backup: `.maestri/tmp/radar-missao/radar-antes-a9-20261116-235735.db` no vault. Texto conferido: “Duração de 1 a 3 minutos; a história decide, sem cortar piada nem lógica para encurtar.” Perfil da mãe, roteiros e approval pointers não foram alterados.

## Validação

- Suíte completa: 82/82; depois da correção dos avisos, 14/14 testes afetados.
- Lint e TypeScript aprovados. Build de produção isolado em `.next-directors` aprovado; quatro avisos preexistentes de tracing em `backup.ts`.
- `node scripts/directors-ui.mjs`: navegador → Server Action → job → mock HTTP SSE → SQLite → UI → download. Três chamadas simuladas, zero chamadas na aprovação/integração; conteúdo imutável, nova versão bloqueada, edição de regras sem IA, desktop 1280×1000 e mobile 390×844 sem overflow/erros JS. `result.json` e PNGs nesta pasta.
- Servidor de teste 3018 encerrado pelo próprio teste. Portas 3000/3001 e servidor persistente 3016/PID6652 preservados. `RADAR_BUILD_DIR` evita sobrescrever o build usado por 3016.
- `prisma generate` atualizou o client, mas o rename da DLL em uso pelo servidor 3016 retornou EPERM. Não foi encerrado o servidor. O client gerado foi validado pelos testes Prisma, TypeScript, build e UI. Após merge, com o Radar fechado pelo usuário, rodar generate normalmente antes de iniciar.

## Aplicação após revisão

PR sem merge. Antes de migrar o banco real: backup consistente; `prisma migrate deploy`; `prisma generate` com o app fechado; iniciar como de costume. Não executar seed/reset/setup. Não substituir `.env` nem bancos. A faixa 1–3 min do roteirista passa a valer no código novo depois de aplicar as migrations; atualizar A.9 isoladamente no master antigo não separa as chamadas.
