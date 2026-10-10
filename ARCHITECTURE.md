# Arquitetura

Site estático gerado em lotes. Não há servidor nem banco: o "banco" é um JSON versionado no Git.

```mermaid
flowchart LR
  subgraph Fontes
    RSS[Feeds RSS: G1, BBC, DW, Agência Brasil, Tecmundo, Google Notícias]
    MD[content/*.json: guias originais]
  end
  CRON[GitHub Actions a cada hora] --> B[build.mjs]
  RSS --> B
  MD --> B
  CFG[config.json: categorias, ofertas, anúncios] --> B
  DB[(data/articles.json: histórico de 800 itens)] <--> B
  B --> DIST[dist: HTML, sitemap, RSS, /go]
  DIST --> PAGES[GitHub Pages: CDN grátis]
  PAGES --> U[Leitor]
  U -->|clique em oferta| GO[/go/oferta.html]
  GO -->|subid = página de origem| AFF[Rede de afiliados: CPA]
  U -->|visualiza anúncio| ADS[Google AdSense]
  U -->|eventos| GA[Google Analytics 4]
  U -->|e-mail| NL[Newsletter externa]
```

## Componentes

| Peça | Arquivo | Função |
|---|---|---|
| Coletor | `build.mjs` (`fetchFeed`) | Baixa RSS/Atom, normaliza, remove duplicados e acumula histórico |
| Gerador | `build.mjs` | Home, categorias, páginas de notícia, guias, sitemap, RSS, robots, ads.txt |
| Configuração | `config.json` | Fonte única de verdade: feeds, ofertas, IDs de anúncios e analytics |
| Redirecionador | `dist/go/<id>.html` | Esconde o link de afiliado, injeta `subid` da página e dispara evento GA4 |
| Front-end | `assets/app.js`, `style.css` | Barra de leitura, oferta fixa, modal de newsletter, medição de cliques |
| Automação | `.github/workflows/deploy.yml` | Cron horário, commit do histórico e deploy no Pages |

## Fluxo de receita

```
Notícia → página própria (resumo + fonte) → anúncio AdSense + oferta CPA + "Continue lendo" → mais páginas por visita
Guia original → busca orgânica → oferta CPA contextual no meio do texto
Newsletter → retorno recorrente → ofertas por e-mail
```

O `subid` registra de qual página veio cada conversão. A maioria das redes de afiliados mostra isso no relatório, o que permite dobrar a aposta nas páginas e categorias que mais convertem.

## Limites do plano gratuito

- GitHub Pages: site público, cerca de 1 GB e 100 GB de banda por mês.
- GitHub Actions: gratuito em repositório público.
- Sem backend: contagem de cliques e receita ficam no GA4, no AdSense e na rede de afiliados.

## Evolução sugerida

1. Domínio próprio (`.com.br`) com Cloudflare, gratuito.
2. Mais guias originais, pelo menos 20, para SEO e aprovação do AdSense.
3. Newsletter automática com Buttondown ou Brevo, usando o `feed.xml`.
4. Migração para Cloudflare Pages se o tráfego passar do limite do GitHub.
