# Estudo de direção no Radar — 16/11/2026

Formato com estudo agora gera `planoCenas` na mesma chamada do roteiro, separado das falas: intervalo de falas, tela, câmera, efeito e etiqueta. A validação exige cobertura completa e ordenada. A aba Animação e direção e o Markdown exportado exibem o plano. Falas e Referência do canal mantêm o fluxo anterior. Correções de fala preservam o plano e sinalizam a necessidade de revisá-lo.

A tela do formato permite colar ou subir Markdown e pedir estudo externo com 1–5 links. O pedido vira arquivo único em `GUBS OS/.maestri/tmp/radar-pedidos-estudo`; nenhuma API é chamada. Formato e gerador avisam quando falta estudo.

## Banco e importação

- Branch criada da `radar/fase1-gerador`, após `git pull --ff-only` (já atualizada); sem merge.
- Backup SQLite consistente (`VACUUM INTO`), antes da migration: `C:/Users/gubsB/Documents/GUBS OS/GUBS OS/.maestri/tmp/radar-missao/radar-antes-direcao-2026-11-16T18-22-21-577Z.db`.
- Migration aditiva `20261116160000_direction_study`: uma coluna nullable em VideoFormat; sem setup, seed ou reset do banco principal.
- `scripts/import-direction-dm.ts`: `--backup` cria backup; sem flag extrai literalmente as 14 regras e a seção Para o Por Que É Assim? da nota aprovada. Estudo importado tem 2.961 caracteres. Nenhuma IA na importação.
- Formato: `cmwid2w8d0001fsjobic0l9s5`.
- Neste clone, definir `DATABASE_URL=file:./radar.db` antes dos comandos Prisma/tsx (não há .env).

## Validações

- 74/74 testes em `node --import tsx --test --test-concurrency=1 tests/*.test.ts`.
- `npm run typecheck`, `npm run lint` e `npm run build`: passaram. Build mantém quatro avisos preexistentes de tracing em `src/lib/backup.ts`.
- Primeira suíte concorrente encontrou falhas na simulação nova (corrigidas) e no limite de tempo do teste de jobs; execução serial passou sem mudar o teste de jobs.
- Uma única geração real, exclusivamente em `prisma/test-direction-ui.db`: modelo configurado mais barato, `claude-sonnet-5-5`, 20 cenas, 26 falas, US$ 0,138848. Nenhuma alteração do modelo no banco principal.
- `scripts/direction-ui.mjs`: navegador desktop/mobile, aviso com/sem estudo, import por texto e arquivo com persistência após reload, botão gravando Markdown, plano na tela e na exportação; sem erros de página. Servidor de teste 3017 encerrado pelo próprio teste; portas 3000/3001 preservadas.
- O pedido produzido pelo teste foi movido da fila para a pasta de evidências para não virar trabalho real do GEPETO.
- Prints, resultado UI, roteiro de teste e custo: `C:/Users/gubsB/Documents/GUBS OS/GUBS OS/.maestri/tmp/radar-missao/direcao-evidencias/`.

## Uso

Abrir `http://localhost:3016/formatos/cmwid2w8d0001fsjobic0l9s5`. Os novos roteiros desse formato trazem plano; roteiros anteriores não são reescritos. Servidor de revisão usa o banco principal com acompanhamento automático desativado (`RADAR_NO_TRACKER=1`), evitando duplicar a rotina da instância existente.

Para reproduzir o smoke real, usar um caminho de banco de teste ainda inexistente conforme o script; ele recusa sobrescrever a cópia e nunca reseta `radar.db`. Não repetir sem autorização de custo. Os testes unitários usam respostas simuladas, sem custo de API.
