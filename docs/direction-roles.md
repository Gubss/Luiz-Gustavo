# Instruções por função e preparação da direção

O formato guarda quatro caixas de direção (Geral, Cena, Fotografia, Som), até 30.000 caracteres cada, além das regras do roteirista já existentes. Receita, estudos, perfil e referência do canal continuam na base do roteirista. As quatro caixas não entram nas falas.

Cada chamada de diretor recebe apenas Geral + sua função, como instrução do usuário; as tarefas fixas continuam em directors.ts. Ao iniciar, as caixas ficam congeladas em um snapshot JSON versionado em DirectionRun.study. Resultados e snapshots antigos não são apagados. Ao retomar uma direção legada incompleta, carrega-se o novo snapshot por função sem refazer resultados concluídos.

Preparar direção executa cena → fotografia → som → integração; a integração não chama IA. A estimativa soma as etapas restantes e reserva tokens para resultados intermediários ainda desconhecidos. Erro interrompe a sequência, mantém as etapas concluídas e permite retomar da primeira pendente. O progresso vem do estado persistido, com atualização de tela a cada 3 segundos durante execução.

Aprovação do roteiro e da direção são explícitas e vinculadas à versão. DirectionRun.approvedAt só é gravado após integração, hash íntegro e versão atual aprovada. O download para produção usa ?estudio=1 e responde 409 sem aprovação. O download de leitura continua disponível, sem metadados não aprovados.

## Dados e migration

Migration aditiva: 20261117040000_direction_roles. Quatro colunas nullable em VideoFormat e approvedAt em DirectionRun; sem seed, reset ou remoção de dados.

scripts/import-direction-roles.ts extrai literalmente as seções indicadas nas duas fontes do vault. Modo padrão: prévia; --apply: backup consistente VACUUM INTO, atualização de um único formato identificado pelo vínculo com o canal e conferência literal depois. DATABASE_URL explícita é obrigatória. Não aprova roteiros.

Tamanhos: roteirista 316; geral 2.764; cena 2.896; fotografia 5.037; som 21.074 caracteres. Limite de 30.000 aprovado pelo Gubs via GEPETO. §12 não importado. Estudo anterior preservado para consulta.

## Validação

- 86 testes passaram (API simulada, bancos isolados), incluindo separação, aprovação, dependências, falha parcial, retomada, imutabilidade e regressão do roteirista.
- Typecheck, lint e build passaram. Build mantém quatro avisos preexistentes de tracing em src/lib/backup.ts.
- scripts/direction-roles-ui.mjs: Chrome 1360px/390px; cópia consistente do banco, telefone PQEA-004 v3 com aprovação anterior v1; campos integrais salvos e relidos; aprovação explícita; erro proposital em fotografia; retomada preservando cena; aprovação final; exportação bloqueada/liberada. Quatro chamadas simuladas, custo real US$ 0, nenhum erro de página.
- Prints e resultado: [evidências](evidence/direction-roles/result.json). Dados de direção nas imagens são simulados para homologação, não uma produção final do vídeo.

Para repetir o teste UI, preparar uma cópia fresca do banco em prisma/roles-preview.db, aplicar migrations, desabilitar autoCollect/tracker/autoBackup e substituir a chave da cópia por sk-ant-test. Importar as instruções na cópia, compilar e executar node scripts/direction-roles-ui.mjs. O teste usa 3026 e encerra apenas seus próprios processos. Nunca apontar esse ensaio para o banco real.

## Limitações

A qualidade criativa da direção com o modelo real não foi avaliada: não houve chamadas pagas. Após merge, o Gubs ainda deve aprovar o roteiro atual e iniciar a direção no Radar. Servidores 3000/3001 não foram modificados.

## Aplicação local autorizada

Migration e importação já aplicadas no banco local do Radar, após backup; integridade SQLite OK. Formato preenchido literalmente. Telefone continua com v1 aprovada e v3 atual; contagens de ideias, versões e formatos inalteradas. [Registro](evidence/direction-roles/live-import.json). A interface nova depende do merge; nenhum servidor foi reiniciado.
