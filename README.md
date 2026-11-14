# YouTube Radar

Aplicação web local para pesquisar nichos no YouTube: monitora canais, encontra vídeos
outliers, estuda título/thumbnail/roteiro com o Claude e gera temas e roteiros.

## Status das etapas

- [x] **Etapa 1** — estrutura, banco (schema completo da v1), nichos, canais monitorados, meus canais, resolução de canal pela API, controle de cota
- [x] **Etapa 2** — coleta de vídeos, snapshots diários, base do canal, velocidade, outliers, "Canal pequeno estourou", catálogo de títulos ("esse tema já foi feito?"), radar e favoritos
- [x] **Etapa 3** — estudo do vídeo: transcrição, diagnóstico medido, comentários, esqueleto de roteiro
- [x] **Etapa 4** — descoberta de canais (busca por palavra-chave, canais indicados, raio-x do canal)
- [x] **Etapa 5** — cartilha do nicho (por formato: Shorts e longos separados)
- [x] **Etapa 6** — perfil do meu canal, gerador de temas, títulos e roteiros adaptados ao formato do canal; banco de ideias
- [ ] Etapa 7 — meus vídeos publicados (marcos 1h/3h/24h/48h) e cruzamento com referências
- [ ] Etapa 8 — configurações e controle de cota

## Como rodar no Windows

Pré-requisitos: [Node.js 22 LTS](https://nodejs.org) e [Git](https://git-scm.com).

No PowerShell:

```powershell
git clone https://github.com/gubss/luiz-gustavo.git
cd luiz-gustavo
npm install
copy .env.example .env
notepad .env          # cole suas chaves
npm run db:setup      # cria o banco SQLite (prisma/radar.db)
npm run dev
```

Abra http://localhost:3000.

### Onde pegar as chaves

- **YouTube Data API v3** (gratuita, 10.000 unidades/dia): console.cloud.google.com →
  crie um projeto → *APIs e serviços → Biblioteca* → ative "YouTube Data API v3" →
  *Credenciais → Criar credenciais → Chave de API*. Restrinja a chave a essa API.
- **Anthropic** (paga por uso, usada a partir da etapa 3): console.anthropic.com →
  *Settings → API Keys → Create Key*.

## Coleta diária

- Ao abrir o app, se a última coleta tiver mais de 20h, ele coleta sozinho (aviso no canto da tela).
- Botão **Coletar agora** no radar força a coleta de todos os canais.
- Para não ter buracos no histórico nos dias em que o app não for aberto, agende no Windows:
  1. Abra o **Agendador de Tarefas** → *Criar Tarefa Básica* → nome "YouTube Radar".
  2. Disparador: **Diariamente**, por exemplo às 7h.
  3. Ação: *Iniciar um programa* → Programa: `cmd.exe` →
     Argumentos: `/c cd /d C:\caminho\luiz-gustavo && npm run collect >> coleta.log 2>&1`
  4. Em Propriedades, marque "Executar estando o usuário conectado ou não" se quiser.

Custo típico: 3 a 4 unidades por canal por dia (≈ 400 para 100 canais, de 10.000).
Na primeira coleta de cada canal o catálogo completo de títulos é lido (1 unidade a cada 50 vídeos).

## Regras do radar

- **Base do canal**: mediana dos últimos N (padrão 15) vídeos do mesmo formato, com 48h+ de vida, sem o próprio vídeo. A média aritmética aparece no detalhe (passe o mouse).
- **x média** = views / base. **x inscritos** = views / inscritos. Outlier se qualquer um passar do mínimo e o vídeo tiver 10 mil+ views.
- **Views/dia** = views / dias desde a publicação (mínimo 1).
- **Subindo rápido**: até 7 dias de vida e views/dia ≥ 3x a velocidade mediana da base.
- **Canal pequeno estourou**: canal com até 50 mil inscritos e vídeo com 10x+ os inscritos.
- **Short**: até 60s é Short; entre 61s e 3 min confere pela URL `/shorts/` (sem gastar cota); acima é longo.

## Estudo do vídeo (etapa 3)

No radar ou nos favoritos, clique em **Estudar** no card (ou cole um link em *Estudos de vídeo*).

1. **Transcrição** — "Buscar legenda do YouTube" lê a legenda pública do vídeo (grátis, sem cota). Se o vídeo
   não tiver legenda ou o YouTube bloquear, cole a transcrição (painel "Mostrar transcrição" do YouTube, SRT, VTT
   ou texto corrido).
2. **Diagnóstico** — o Claude Opus 5.5 lê título, thumbnail, números e a transcrição com tempos e devolve:
   hipóteses de por que funcionou (com evidência), fórmula do título, gancho, esqueleto (gancho, virada,
   desenvolvimento, clímax, fecho), cada "momento novo" com o segundo exato, pontos de risco, como replicar e
   temas derivados. As **medidas** (palavras/s, ritmo, abertura, fecho, intervalo entre momentos novos, maior
   buraco sem novidade) são calculadas em código; o Claude só aponta onde estão os momentos.
3. **Comentários** — lê os 200 comentários mais relevantes (2 unidades de cota) e o Claude Sonnet 5.5 resume
   o que o público gostou, criticou, perguntou e pediu.

Cada botão mostra o **custo estimado** antes de rodar e grava o **custo real** depois (tabela `Generation`).
Referência: diagnóstico de Short ≈ US$ 0,05–0,15; de vídeo longo de 15 min ≈ US$ 0,10–0,30; comentários ≈ US$ 0,03.
O gasto do mês aparece em *Estudos de vídeo*. Modelos: `claude-opus-5-5` (diagnóstico) e `claude-sonnet-5-5`
(comentários), com reserva automática se o modelo recusar.

### Importação de estudos externos (preparado, ainda não feito)

`Transcript`, `Diagnosis` e `ScriptStructure` têm `source` (`youtube`/`manual`/`import` ou `app`/`import`),
`importSource` (ex.: `faro`) e `importKey` único (ex.: `faro:Olheiros/Canal X/video.md`). O script de importação
deve fazer `upsert` por `importKey`: rodar de novo atualiza em vez de duplicar. Para vídeos fora do radar, use
`ensureVideo(link)` de `src/lib/videos.ts` (grava o canal sem nicho, fora da coleta diária). Um diagnóstico
importado pode ter só `markdown` (o texto do estudo), sem o JSON estruturado.

## Descobrir canais (etapa 4)

Menu **Descobrir canais** (ou o botão *Descobrir canais parecidos* na página do nicho). Escolha o nicho e:

1. **Buscar por palavra-chave** — escreva até 5 palavras-chave (uma por linha) ou clique nas sugestões, que saem
   dos títulos que mais deram view no nicho. Escolha **Shorts** ou **Vídeos longos**: a busca pede ao YouTube só
   vídeos de até 4 min (Shorts) ou de 4–20 min / 20 min+ (longos), e depois o app confere cada vídeo como na coleta
   (duração e URL `/shorts/`) e descarta o formato errado e as lives. Os canais que publicaram esses vídeos entram na
   lista; os que você já monitora no nicho não entram (aparecem só como contagem).
   **Custo: ~102 unidades por palavra-chave** (100 da busca do YouTube + 1 lote de vídeos + 1 lote de canais).
   O custo aparece antes de buscar; se a cota restante não der, o botão fica bloqueado, e há um aviso quando a busca
   comeria a reserva da coleta diária (~4 unidades por canal monitorado).
2. **Canais indicados** — lê a seção "Canais" da página de cada canal monitorado do nicho (1 unidade por canal).
3. **Raio-x** (2 unidades) — lê os últimos 50 vídeos de um canal encontrado: quantos são Shorts e longos, mediana
   de views de cada formato, ritmo de postagem, último vídeo e outliers (3x+ a mediana do próprio formato).
4. **Monitorar** (1 unidade) põe o canal no nicho; ele entra no radar na próxima coleta. **Ignorar** tira o canal da
   lista para sempre (dá para voltar na aba *Ignorados*).

"Mais promissores" ordena por: views do melhor vídeo encontrado × quantas vezes ele passou os inscritos × quantas vezes
o canal apareceu × bônus para canal com menos de 1 ano. As abas Shorts/Longos usam os vídeos encontrados e, depois do
raio-x, a proporção real de Shorts do canal. Tudo fica salvo (`DiscoveredChannel`, `DiscoverySearch`): reabrir a tela
não gasta cota.

## Cartilha do nicho (etapa 5)

Menu **Cartilha do nicho** (ou o botão na página do nicho). Escolha o nicho e o formato: **Shorts** e **vídeos longos**
têm cartilhas separadas.

- **Base** — entram os vídeos com diagnóstico pronto (gerado aqui ou importado) cujo canal está no nicho. Vídeo estudado
  por link, de canal fora dos nichos, entra se você escolher o nicho em *Entra na cartilha de* na página do vídeo.
  Vídeos só com transcrição aparecem como pendentes.
- **Confiança** pela quantidade de estudos: 1–2 preliminar (rascunho), 3–4 inicial, 5–9 boa, 10+ sólida. Com 1–2 estudos
  o Claude é avisado para não generalizar e listar o que estudar a seguir.
- **Medidas dos estudos** (grátis, calculadas em código): mediana de views, x média do canal, duração, palavras/s,
  intervalo entre momentos novos, maior buraco, ritmo começo/meio/fim, padrões de título (pergunta, número, "você",
  "E se"), fecho com chamada e onde cada parte do esqueleto termina (% da duração).
- **Cartilha** (Claude Opus 5.5, custo estimado no botão; ≈ US$ 0,10–0,40 conforme o número de estudos): ganchos,
  fórmulas de título, thumbnail, estrutura, ritmo, fecho, temas, o que o público pede, o que evitar, checklist e lacunas.
  Cada item mostra em quantos estudos aparece (#1, #2… levam ao estudo).
- Cada geração é uma versão nova (`NichePlaybook`, com `format`, estudos usados e custo); as antigas ficam em
  *Versões anteriores*. Quando há estudo novo ou refeito, a tela avisa para gerar de novo.
  `latestPlaybook(nicheId, format)` em `src/lib/playbook.ts` fica pronto para a etapa 6.

## Gerador de roteiros (etapa 6)

1. **Meus canais → Perfil** — preencha do que o canal trata, personagens, formatos de história que se repetem
   (ex.: "o menino afirma algo errado e o pai corrige"), estilo visual, tom, público, sempre/nunca, duração alvo e
   cole os roteiros que você já publicou (com views, se souber). O gerador lê até 5 deles para copiar a voz do canal.
2. **Gerador** — escolha o canal, a cartilha (nicho + formato) e, se quiser, um vídeo estudado para adaptar.
   Escreva um ponto de partida (ex.: "mitos sobre dinossauros") ou deixe vazio. **Sugerir ideias** (Claude Opus 5.5,
   ≈ US$ 0,10–0,25 para 5 ideias, custo no botão) devolve para cada ideia: a cena no formato do canal, o gancho
   falado pelo personagem, 3–5 títulos com a fórmula da cartilha, o que veio da cartilha × o que é do canal e o risco.
3. **Ideia → Escrever roteiro** (≈ US$ 0,10–0,25 num Short) — roteiro cena a cena (tempo, quem fala, fala exata,
   o que aparece na animação, texto na tela), checklist da cartilha conferido, fatos para conferir, capa, descrição
   e hashtags. As **medidas do roteiro** (duração, palavras/s, tamanho das cenas, onde o gancho termina) são
   calculadas em código e comparadas com a mediana da cartilha.

**O que o seu canal já fez:** no perfil, *Ler os vídeos do meu canal* lê do YouTube todos os vídeos publicados
(pela URL do canal; ~1 unidade + 2 a cada 50 vídeos). O gerador recebe esses títulos, os roteiros cadastrados e as ideias
do banco e não repete o tema, mesmo que o vídeo antigo seja de outro estilo (ex.: 2D). Além disso, cada ideia é conferida
em código e ganha o aviso "⚠ Seu canal já fez algo parecido" com o vídeo/roteiro/ideia parecido. Repetir um tema que deu
certo em outros canais pode; repetir o que o próprio canal já contou, não.

**Seus vídeos × cartilha:** estude um vídeo seu pelo link (*Estudos de vídeo*) com *Estudar tudo*. A página do vídeo
mostra "Comparado com a cartilha" (grátis, em código): duração, palavras/s, abertura, algo novo a cada X s, fecho e
título, dentro ou fora da faixa dos estudos. Vídeos dos seus canais nunca entram na cartilha (ela é só das referências).

A regra central do gerador: da cartilha e da referência ele usa só o **como** (tipo de gancho, fórmula de título,
ritmo, virada, fecho); o **o quê** (personagens, cenário, tom, formato de história) vem sempre do perfil do canal.
Sem cartilha ainda, usa até 5 estudos direto; sem nicho, usa só o perfil.
O **Banco de ideias** guarda tudo com status (ideia, roteiro pronto, produzido, publicado, descartada) e mostra
títulos parecidos já feitos pelos canais monitorados (checagem grátis no catálogo).

**Banco de ideias:** cada cartão tem *Apagar*. Na página da ideia, *Virou vídeo no seu canal?* liga a ideia ao vídeo
publicado (lista do canal, com os mais parecidos primeiro, ou pelo link): a ideia fica "Publicado", mostra as views e o
gerador não repete o tema.

## Ordem do menu

O menu é numerado na ordem de uso: 1 Meus canais → 2 Nichos e canais → 3 Descobrir canais → 4 Radar (e Favoritos) →
5 Estudos de vídeo → 6 Cartilha → 7 Gerador → 8 Banco de ideias.

## Tarefas em segundo plano

Diagnóstico, comentários, "Estudar tudo", cartilha, ideias, roteiros, buscas do *Descobrir canais*, raio-x e
adicionar/atualizar canais num nicho rodam em segundo plano: o botão volta na hora e dá para usar o resto do app.
O aviso no canto inferior direito mostra cada tarefa com barra de progresso (por etapa quando dá para medir; senão
estimada pelo tempo típico) e avisa quando termina, com link para o resultado. Se você permitir, o Windows também
avisa quando o app está em outra aba. As tarefas ficam na tabela `Job`; se o app for fechado no meio, a tarefa é
marcada como interrompida depois de 15 min.

Na página do vídeo, **Estudar tudo** faz transcrição → diagnóstico → comentários num clique (sem legenda, segue sem
ela e avisa). Os botões de cada etapa continuam lá.

**Canais parecidos com um link** (*Descobrir canais*): cole um vídeo ou canal; o app tira palavras-chave dos títulos e
tags (dele e dos vídeos do mesmo formato do canal), busca por elas, junta os canais que o canal do link indica e põe o
próprio canal na lista. Formato automático (o do link) ou escolhido. Custo: ~5 unidades + ~102 por palavra-chave (1 a 3).

## Testes

`npm test` roda os testes de cálculo e uma coleta completa com a API do YouTube simulada
(usa `prisma/test.db`, nunca o seu banco). O estudo do vídeo é testado com YouTube e Anthropic simulados
(`prisma/test-study.db`, sem custo). A descoberta de canais é testada com a API simulada (`prisma/test-discover.db`). A cartilha é testada com a Anthropic simulada (`prisma/test-playbook.db`). O gerador também (`prisma/test-generator.db`).

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind 4, Prisma 6 + SQLite, SDK oficial da Anthropic.

## Decisões

- A chave do YouTube vai no cabeçalho `X-goog-api-key`, nunca na URL.
- Cada chamada à API registra seu custo em `QuotaLog`; o dia de cota segue o fuso do Pacífico.
- Dados de canais são atualizados em lote (50 canais = 1 unidade).
- Campo `platform` em canais e vídeos prepara o suporte futuro a TikTok.
- Colunas de CTR/impressões/retenção existem em `MyVideo`, vazias até a versão com OAuth.
