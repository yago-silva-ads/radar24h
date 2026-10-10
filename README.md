# Radar 24h — portal de notícias open source com monetização

Site de notícias (Brasil, mundo, política, esportes, educação, tecnologia, promoções, economia, mercado digital) que se atualiza sozinho, hospedado **de graça** no GitHub Pages, com anúncios (AdSense), links de afiliado/CPA e ferramentas de retenção.

- Zero dependências, zero servidor, zero custo.
- Licença MIT: faça fork, troque o nome e use.

## Início rápido

1. Faça fork e ative **Settings → Pages → Source: GitHub Actions**.
2. Edite `config.json` (nome, `siteUrl`, `basePath`, categorias/feeds, ofertas, anúncios).
3. `git push`. O workflow reconstrói o site a cada hora.
4. Local: `node build.mjs` e abra `dist/index.html`. Precisa do Node 18 ou superior.

## Como ganhar dinheiro

| Fonte | Onde configurar | Observação |
|---|---|---|
| Anúncios AdSense | `ads.adsenseClient` e `ads.slots` | Precisa de aprovação e de conteúdo original (`content/`) |
| CPA / afiliados | `offers[]` com `url` real | Veja [docs/CPA.md](docs/CPA.md) |
| Newsletter | `newsletter.formAction` | Gera tráfego recorrente e vende ofertas por e-mail |
| Simulador | `/painel.html` | Estime a receita com seus números |

Ofertas com `SEU-LINK` no endereço **não aparecem** no site. Só as com link real são exibidas.

## Estrutura

Veja [ARCHITECTURE.md](ARCHITECTURE.md).

## Boas práticas e legalidade

- Exiba apenas manchete e resumo curto, com link e crédito para a fonte.
- Mantenha o aviso de afiliado e a política de privacidade (LGPD).
- Nunca clique nos seus próprios anúncios nem induza cliques.
