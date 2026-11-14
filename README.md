# YouTube Radar

Aplicação web local para pesquisar nichos no YouTube: monitora canais, encontra vídeos
outliers, estuda título/thumbnail/roteiro com o Claude e gera temas e roteiros.

## Status das etapas

- [x] **Etapa 1** — estrutura, banco (schema completo da v1), nichos, canais monitorados, meus canais, resolução de canal pela API, controle de cota
- [ ] Etapa 2 — coleta de vídeos, snapshots, médias, velocidade, outliers, catálogo de títulos, radar
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

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind 4, Prisma 6 + SQLite, SDK oficial da Anthropic.

## Decisões

- A chave do YouTube vai no cabeçalho `X-goog-api-key`, nunca na URL.
- Cada chamada à API registra seu custo em `QuotaLog`; o dia de cota segue o fuso do Pacífico.
- Dados de canais são atualizados em lote (50 canais = 1 unidade).
- Campo `platform` em canais e vídeos prepara o suporte futuro a TikTok.
- Colunas de CTR/impressões/retenção existem em `MyVideo`, vazias até a versão com OAuth.
