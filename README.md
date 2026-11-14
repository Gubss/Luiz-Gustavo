# YouTube Radar

Aplicação web local para pesquisar nichos no YouTube: monitora canais, encontra vídeos
outliers, estuda título/thumbnail/roteiro com o Claude e gera temas e roteiros.

## Status das etapas

- [x] **Etapa 1** — estrutura, banco (schema completo da v1), nichos, canais monitorados, meus canais, resolução de canal pela API, controle de cota
- [x] **Etapa 2** — coleta de vídeos, snapshots diários, base do canal, velocidade, outliers, "Canal pequeno estourou", catálogo de títulos ("esse tema já foi feito?"), radar e favoritos
- [ ] Etapa 3 — estudo do vídeo: transcrição, diagnóstico medido, comentários, esqueleto de roteiro
- [ ] Etapa 4 — descoberta de canais
- [ ] Etapa 5 — cartilha do nicho
- [ ] Etapa 6 — gerador de temas, títulos e roteiros; banco de ideias
- [ ] Etapa 7 — meus vídeos publicados (marcos 1h/3h/24h/48h) e cruzamento com referências
- [ ] Etapa 8 — configurações e controle de cota

## Como rodar no Windows

Pré-requisitos: [Node.js 22 LTS](https://nodejs.org) e [Git](https://git-scm.com).

No PowerShell:

```powershell
git clone https://github.com/gubss/luiz-gustavo.git
cd luiz-gustavo
git checkout claude/youtube-radar-app-wfad9w
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

## Testes

`npm test` roda os testes de cálculo e uma coleta completa com a API do YouTube simulada
(usa `prisma/test.db`, nunca o seu banco).

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind 4, Prisma 6 + SQLite, SDK oficial da Anthropic.

## Decisões

- A chave do YouTube vai no cabeçalho `X-goog-api-key`, nunca na URL.
- Cada chamada à API registra seu custo em `QuotaLog`; o dia de cota segue o fuso do Pacífico.
- Dados de canais são atualizados em lote (50 canais = 1 unidade).
- Campo `platform` em canais e vídeos prepara o suporte futuro a TikTok.
- Colunas de CTR/impressões/retenção existem em `MyVideo`, vazias até a versão com OAuth.
