# Direção PQEA — padrão telefone

O estudo aprovado do Por Que É Assim? substitui o estudo DM no formato usado pelo canal: Desmontando o Mundo (`cmwid2w8d0001fsjobic0l9s5`). Importação literal das seções A/B/C, sem IA, metadados ou histórico. A seção A rege falas, loop, proibições e duração; B/C regem direção. A duração do pedido fica limitada a 90s quando há seção A, preservando perfil, voz e Referência do canal.

Cada fala nova tem uma entrada própria em planoCenas com tela, plano, câmera, ação, efeito e trilha. Falas e direção permanecem separadas; planos antigos continuam legíveis. A revisão mostra aviso determinístico para chamada/despedida na última fala ou duração declarada acima de 100s, recalculado sobre a versão atual (inclusive após correção/restauração). Não garante qualidade semântica nem mede áudio.

## Banco
- Backup consistente antes do import: `GUBS OS/.maestri/tmp/radar-missao/radar-antes-pqea-2026-11-17T00-57-51-384Z.db`; integrity_check do banco original: ok.
- Estudo importado: 2.772 caracteres. Script: `DATABASE_URL=file:./radar.db node --import tsx scripts/import-direction-pqea.ts --apply`. Sem --apply é só conferência. O script exige vínculo único do canal e cria backup antes de escrever.
- Reutiliza migration aditiva do commit 1be2e76; nenhum setup, seed, reset ou nova migration nesta continuação. Banco, backup e credenciais não entram no PR.
- Portas 3000/3001 preservadas. Testes usam test-pqea-ui.db e 3017.

## Validação
- Suíte completa: 77/77. Após corrigir conflito de duração observado no teste real: os 7 testes do gerador passaram, incluindo nova regressão de 120→90s; demais testes inalterados.
- typecheck, lint e build finais verdes; quatro avisos preexistentes de tracing em backup.ts.
- UI desktop/mobile: import por texto e arquivo, persistência, aviso sem estudo, pedido externo .md, plano por fala, exportação, avisos de fim/duração e remoção dos avisos após ajuste. Sem erros de página.
- Uma geração real, no modelo configurado mais barato (claude-sonnet-5-5): 20 falas / 20 direções, US$ 0,156292. Não houve segunda geração paga.
- O ensaio real revelou pedido antigo de 120s: removido do prompt na versão final e coberto por teste simulado. O resultado real anterior estimou 100s e mantém pendências editoriais; não foi aprovado nem usado como roteiro de produção.
- Evidências locais: `GUBS OS/.maestri/tmp/radar-missao/pqea-evidencias/` (roteiro-teste.md, generation.json, ui-result.json e prints). O print de avisos usa versão sintética só no banco isolado, restaurada após o teste.
- Scripts reproduzíveis: pqea-smoke.ts recusa banco existente e faz uma geração paga; pqea-ui.mjs não chama IA. Não repetir smoke sem autorização de custo.

## Revisão
http://localhost:3016/formatos/cmwid2w8d0001fsjobic0l9s5

Sem merge. A revisão criativa do roteiro continua humana; regras no prompt não garantem execução literal de cada gag, movimento ou duração.
