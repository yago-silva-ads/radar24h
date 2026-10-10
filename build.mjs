// Gerador estático: busca RSS, acumula histórico e escreve /dist
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const DIST = path.join(ROOT, 'dist');
const DB = path.join(ROOT, 'data', 'articles.json');
const MAX_KEEP = 800;
const BASE = cfg.basePath || '';
const SITE = cfg.siteUrl.replace(/\/$/, '');
const OFFERS = cfg.offers.filter(o => o.url && !/SEU-LINK/.test(o.url)); // só ofertas com link real

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const strip = s => decode(s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const id = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
const attr = (x, n, a) => { const m = x.match(new RegExp(`<${n}\\b[^>]*\\b${a}="([^"]+)"`, 'i')); return m ? decode(m[1]) : ''; };
const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// ---------- coleta ----------
async function fetchFeed(feed, cat) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(feed.url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 Radar24hBot' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = await r.text();
    const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
    return blocks.slice(0, 20).map(b => {
      let link = tag(b, 'link') || attr(b, 'link', 'href');
      if (!link) link = attr(b, 'link', 'href');
      const title = strip(tag(b, 'title'));
      let source = feed.name;
      const gsrc = tag(b, 'source');
      let clean = title;
      if (feed.url.includes('news.google.com')) { if (gsrc) source = strip(gsrc); clean = title.replace(/\s+-\s+[^-]+$/, ''); }
      const raw = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded');
      let summary = strip(raw); if (summary.startsWith(title)) summary = '';
      const img = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || (decode(raw).match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
      const d = new Date(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
      return { id: id(link), cat, title: clean, link, source, summary: summary.slice(0, 260), img: /^https:/.test(img) && !feed.url.includes('news.google.com') ? img : '', date: isNaN(d) ? new Date().toISOString() : d.toISOString() };
    }).filter(a => a.link && a.title);
  } catch (e) { console.warn(`! ${feed.name} (${cat}): ${e.message}`); return []; }
  finally { clearTimeout(t); }
}

let db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : [];
const known = new Set(db.map(a => a.id));
const results = await Promise.all(cfg.categories.flatMap(c => c.feeds.map(f => fetchFeed(f, c.slug))));
let added = 0;
for (const a of results.flat()) {
  if (known.has(a.id)) continue;
  if (db.some(x => x.cat === a.cat && x.title === a.title)) continue;
  a.slug = (slugify(a.title) || 'noticia') + '-' + a.id; db.push(a); known.add(a.id); added++;
}
db.sort((a, b) => b.date.localeCompare(a.date));
db = db.slice(0, MAX_KEEP);
fs.writeFileSync(DB, JSON.stringify(db));
console.log(`+${added} novas, total ${db.length}`);

// ---------- conteúdo original (guias em /content/*.json) ----------
const guides = fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'))).sort((a, b) => b.date.localeCompare(a.date));

// ---------- componentes ----------
const catName = s => cfg.categories.find(c => c.slug === s)?.name || s;
const adSlot = pos => {
  const a = cfg.ads, slot = a.slots[pos];
  if (a.adsenseClient && slot) return `<div class="ad ad-${pos}"><small>Publicidade</small><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(a.adsenseClient)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  return a.previewPlaceholders ? `<div class="ad ad-${pos} ad-ph"><small>Publicidade</small><span>Espaço de anúncio (${pos})</span></div>` : '';
};
const offerFor = (cat, page, n = 0) => {
  if (!OFFERS.length) return '';
  const list = OFFERS.filter(o => o.categories.includes(cat)), pool = list.length ? list : OFFERS, o = pool[n % pool.length];
  return `<aside class="offer" data-offer="${esc(o.id)}"><span class="badge">${esc(o.badge)} · Patrocinado</span><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p><a class="btn" rel="sponsored nofollow noopener" target="_blank" href="${BASE}/go/${esc(o.id)}.html?p=${esc(page)}" data-offer-click="${esc(o.id)}">${esc(o.cta)} →</a></aside>`;
};
const card = (a, big = false) => `<article class="card${big ? ' big' : ''}"><a href="${BASE}/n/${a.slug}.html">${a.img ? `<img loading="lazy" src="${esc(a.img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<div class="noimg c-${a.cat}"></div>`}<div class="meta"><span class="chip">${esc(catName(a.cat))}</span><h3>${esc(a.title)}</h3><small>${esc(a.source)} · ${fmtDate(a.date)}</small></div></a></article>`;
const nl = () => `<section class="newsletter"><h3>📬 Receba o resumo do dia</h3><p>As notícias e ofertas mais importantes no seu e-mail, grátis.</p>${cfg.newsletter.formAction ? `<form action="${esc(cfg.newsletter.formAction)}" method="post" target="_blank"><input type="email" name="email" placeholder="seu@email.com" required><button class="btn">Quero receber</button></form>` : `<small>(configure newsletter.formAction em config.json)</small>`}</section>`;

function layout({ title, desc, path: p, body, cat = '', ogImg = '', type = 'website', jsonld = '' }) {
  const url = SITE + p;
  const nav = cfg.categories.map(c => `<a href="${BASE}/${c.slug}/"${c.slug === cat ? ' class="on"' : ''}>${esc(c.name)}</a>`).join('');
  const a = cfg.ads, ga = cfg.analytics.ga4;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${type}"><meta property="og:url" content="${url}">${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">` : ''}<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.name)}" href="${BASE}/feed.xml"><link rel="stylesheet" href="${BASE}/assets/style.css"><link rel="stylesheet" href="${BASE}/assets/extra.css"><meta name="theme-color" content="#0b5fff"><link rel="manifest" href="${BASE}/manifest.webmanifest"><link rel="icon" href="${BASE}/assets/icon.svg" type="image/svg+xml">
${a.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(a.adsenseClient)}" crossorigin="anonymous"></script>` : ''}
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(ga)}')</script>` : ''}
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}</head><body>
<div id="progress"></div>
<header><div class="wrap bar"><a class="logo" href="${BASE}/">${esc(cfg.name)}<small>${esc(cfg.tagline)}</small></a><div class="search"><input id="q" type="search" placeholder="Buscar notícias…" autocomplete="off" aria-label="Buscar"><div id="qres" hidden></div></div></div><nav class="wrap"><a href="${BASE}/">Início</a>${nav}<a href="${BASE}/guias/">Guias</a></nav></header>
<main class="wrap">${body}</main>
<footer><div class="wrap"><p>© ${new Date().getFullYear()} ${esc(cfg.name)} — Agregamos manchetes de veículos citados, sempre com link para a fonte original. Alguns links são de afiliados: podemos receber comissão sem custo extra para você.</p><p><a href="${BASE}/sobre.html">Sobre</a> · <a href="${BASE}/privacidade.html">Privacidade</a> · <a href="${BASE}/contato.html">Contato</a> · <a href="${BASE}/feed.xml">RSS</a></p></div></footer>
<div id="stickybar" hidden></div>
<div id="exitmodal" hidden><div class="modal"><button id="xclose" aria-label="Fechar">×</button>${nl()}</div></div>
<script>window.__OFFERS=${JSON.stringify(OFFERS.map(o => ({ id: o.id, t: o.title, c: o.cta, u: BASE + '/go/' + o.id + '.html?p=sticky', cats: o.categories })))};window.__CAT=${JSON.stringify(cat)};window.__BASE=${JSON.stringify(BASE)};</script>
<script src="${BASE}/assets/app.js" defer></script><script src="${BASE}/assets/search.js" defer></script></body></html>`;
}

const write = (rel, content) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };

// ---------- páginas ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });

const trending = db.slice(0, 40).filter((_, i) => i % 3 === 0).slice(0, 7);
const sidebar = (cat, page) => `<aside class="side">${adSlot('sidebar')}${offerFor(cat, page, 0)}<section class="trend"><h3>🔥 Em alta</h3><ol>${trending.map(a => `<li><a href="${BASE}/n/${a.slug}.html">${esc(a.title)}</a></li>`).join('')}</ol></section>${nl()}</aside>`;

// home
{
  const top = db.slice(0, 1)[0], rest = db.slice(1, 13);
  const blocks = cfg.categories.slice(0, 8).map((c, i) => {
    const items = db.filter(a => a.cat === c.slug).slice(0, 4);
    return items.length ? `${i === 2 || i === 5 ? offerFor(c.slug, 'home-' + c.slug, i) : ''}<section class="block"><div class="bh"><h2>${esc(c.name)}</h2><a href="${BASE}/${c.slug}/">ver tudo →</a></div><div class="grid">${items.map(a => card(a)).join('')}</div></section>` : '';
  }).join('');
  write('index.html', layout({
    title: `${cfg.name} — ${cfg.tagline}`, desc: cfg.tagline, path: '/',
    body: `${adSlot('top')}<div class="cols"><div>${top ? `<section class="hero">${card(top, true)}</section>` : ''}<div class="grid">${rest.map(a => card(a)).join('')}</div>${adSlot('inArticle')}${blocks}</div>${sidebar('', 'home')}</div>`
  }));
}

// categorias
for (const c of cfg.categories) {
  const items = db.filter(a => a.cat === c.slug).slice(0, 60);
  const grid = items.map((a, i) => card(a) + (i === 5 ? `</div>${offerFor(c.slug, 'cat-' + c.slug, 0)}${adSlot('inArticle')}<div class="grid">` : '')).join('');
  write(`${c.slug}/index.html`, layout({ title: `${c.name} — últimas notícias | ${cfg.name}`, desc: `Últimas notícias de ${c.name}, atualizadas a cada hora.`, path: `/${c.slug}/`, cat: c.slug,
    body: `<h1>${esc(c.name)}</h1>${adSlot('top')}<div class="cols"><div><div class="grid">${grid}</div></div>${sidebar(c.slug, 'cat-' + c.slug)}</div>` }));
}

// artigos (página-ponte: manchete + resumo + anúncios + oferta + leitura relacionada)
for (const a of db) {
  const related = db.filter(x => x.cat === a.cat && x.id !== a.id).slice(0, 6);
  const more = db.filter(x => x.cat !== a.cat).slice(0, 3);
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.title, datePublished: a.date, image: a.img || undefined, publisher: { '@type': 'Organization', name: cfg.name } });
  write(`n/${a.slug}.html`, layout({
    title: `${a.title} | ${cfg.name}`, desc: a.summary || a.title, path: `/n/${a.slug}.html`, cat: a.cat, ogImg: a.img, type: 'article', jsonld: ld,
    body: `${adSlot('top')}<div class="cols"><article class="post"><span class="chip">${esc(catName(a.cat))}</span><h1>${esc(a.title)}</h1><p class="by">Fonte: <strong>${esc(a.source)}</strong> · ${fmtDate(a.date)}</p>
${a.img ? `<img class="cover" src="${esc(a.img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
${a.summary ? `<p class="lead">${esc(a.summary)}</p>` : ''}
<div class="share"><a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(a.title + ' ' + SITE + '/n/' + a.slug + '.html')}">WhatsApp</a><a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.title)}&url=${encodeURIComponent(SITE + '/n/' + a.slug + '.html')}">X</a><button type="button" data-copy="${SITE}/n/${a.slug}.html">Copiar link</button></div>
${adSlot('inArticle')}
<a class="btn big" id="readsrc" target="_blank" rel="noopener nofollow" href="${esc(a.link)}">Ler matéria completa em ${esc(a.source)} ↗</a>
${offerFor(a.cat, 'post-' + a.id, 1)}
<h2>Continue lendo</h2><div class="grid">${related.map(x => card(x)).join('')}</div>
${adSlot('bottom')}
<h2>Mais do ${esc(cfg.name)}</h2><div class="grid">${more.map(x => card(x)).join('')}</div></article>${sidebar(a.cat, 'post-side-' + a.id)}</div>`
  }));
}

// guias originais
write('guias/index.html', layout({ title: `Guias | ${cfg.name}`, desc: 'Guias práticos sobre dinheiro, tecnologia e negócios digitais.', path: '/guias/',
  body: `<h1>Guias práticos</h1><div class="grid">${guides.map(g => `<article class="card"><a href="${BASE}/guias/${g.slug}.html"><div class="noimg c-${g.cat}"></div><div class="meta"><span class="chip">${esc(catName(g.cat))}</span><h3>${esc(g.title)}</h3><small>${esc(g.desc)}</small></div></a></article>`).join('')}</div>` }));
for (const g of guides) {
  write(`guias/${g.slug}.html`, layout({ title: `${g.title} | ${cfg.name}`, desc: g.desc, path: `/guias/${g.slug}.html`, cat: g.cat, type: 'article',
    body: `${adSlot('top')}<div class="cols"><article class="post"><span class="chip">${esc(catName(g.cat))}</span><h1>${esc(g.title)}</h1><p class="by">${fmtDate(g.date)} · ${esc(cfg.name)}</p>${g.html.split('<!--OFFER-->').map((part, i, arr) => part + (i < arr.length - 1 ? offerFor(g.cat, 'guia-' + g.slug, i) + adSlot('inArticle') : '')).join('')}${offerFor(g.cat, 'guia-fim-' + g.slug, 2)}${adSlot('bottom')}</article>${sidebar(g.cat, 'guia-side-' + g.slug)}</div>` }));
}

// páginas institucionais (exigidas para AdSense)
const page = (slug, title, html) => write(`${slug}.html`, layout({ title: `${title} | ${cfg.name}`, desc: title, path: `/${slug}.html`, body: `<article class="post narrow"><h1>${title}</h1>${html}</article>` }));
page('sobre', 'Sobre', `<p>O ${esc(cfg.name)} reúne as principais manchetes do Brasil e do mundo — política, esportes, educação, tecnologia, economia, promoções e mercado digital — e publica guias próprios para ajudar você a economizar e crescer.</p><p>As notícias exibidas são manchetes e pequenos resumos com link direto para a matéria completa na fonte original, que sempre recebe o crédito.</p><p>Parte do conteúdo contém links de afiliados e anúncios, que ajudam a manter o site gratuito.</p>`);
page('privacidade', 'Política de Privacidade', `<p>Este site usa cookies e tecnologias semelhantes para exibir anúncios e medir audiência. Fornecedores terceiros, incluindo o Google, usam cookies para exibir anúncios com base em visitas anteriores. Você pode desativar a personalização em <a href="https://adssettings.google.com">adssettings.google.com</a>.</p><p>Coletamos o e-mail apenas se você se inscrever na newsletter, e você pode cancelar a qualquer momento. Em conformidade com a LGPD, você pode solicitar a exclusão de seus dados em ${esc(cfg.contactEmail)}.</p><p>Links marcados como "Patrocinado" são de afiliados; podemos receber comissão por compras ou cadastros realizados.</p>`);
page('contato', 'Contato', `<p>Fale com a gente: <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></p>`);
write('404.html', layout({ title: 'Página não encontrada', desc: '404', path: '/404.html', body: `<h1>Página não encontrada</h1><p><a href="${BASE}/">Voltar ao início</a></p>` }));

// redirecionador rastreável /go/<oferta>.html (para trocar um link, edite só o config.json)
for (const o of OFFERS) {
  const ga = cfg.analytics.ga4;
  write(`go/${o.id}.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Redirecionando…</title>${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script>` : ''}<noscript><meta http-equiv="refresh" content="0;url=${esc(o.url.replace('{page}', 'nojs'))}"></noscript></head><body style="font-family:system-ui;text-align:center;padding:3rem">Levando você à oferta…<script>var p=new URLSearchParams(location.search).get('p')||'direto',u=${JSON.stringify(o.url)}.replace('{page}',encodeURIComponent(p)),done=0;function go(){if(!done){done=1;location.replace(u)}}try{window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());${ga ? `gtag('config','${esc(ga)}');` : ''}gtag('event','affiliate_redirect',{offer_id:'${o.id}',page:p,event_callback:go})}catch(e){}setTimeout(go,400)</script></body></html>`);
}
// simulador de receita
write('painel.html', layout({ title: `Painel de receita | ${cfg.name}`, desc: 'Simulador de receita', path: '/painel.html', body: `<article class="post narrow"><h1>Painel de receita</h1><p>Simule quanto o site pode gerar. Use seus números reais do AdSense e dos programas de afiliados.</p>
<p><label>Visitas por mês <input id="v" type="number" value="30000"></label></p><p><label>Páginas por visita <input id="pp" type="number" step="0.1" value="1.6"></label></p><p><label>RPM do AdSense (R$ por mil páginas) <input id="rpm" type="number" step="0.5" value="6"></label></p><p><label>% de visitas que clicam em ofertas CPA <input id="ctr" type="number" step="0.1" value="1.5"></label></p><p><label>% desses cliques que convertem <input id="cv" type="number" step="0.1" value="3"></label></p><p><label>Comissão média por conversão (R$) <input id="com" type="number" value="25"></label></p>
<h2 id="out"></h2><p id="det"></p><script>(function(){var f=['v','pp','rpm','ctr','cv','com'].map(function(i){return document.getElementById(i)});function c(){var x=f.map(function(e){return +e.value||0}),ads=x[0]*x[1]/1000*x[2],cl=x[0]*x[3]/100,conv=cl*x[4]/100,cpa=conv*x[5],t=ads+cpa,b=function(n){return 'R$ '+n.toLocaleString('pt-BR',{maximumFractionDigits:0})};document.getElementById('out').textContent='Total estimado: '+b(t)+'/mês';document.getElementById('det').textContent='Anúncios: '+b(ads)+' · CPA: '+b(cpa)+' ('+Math.round(cl)+' cliques, '+conv.toFixed(1)+' conversões)'}f.forEach(function(e){e.oninput=c});c()})()</script></article>` }));

// busca no cliente, manifesto PWA
write('search.json', JSON.stringify([...guides.map(g => [g.title, `guias/${g.slug}.html`, catName(g.cat)]), ...db.map(a => [a.title, `n/${a.slug}.html`, catName(a.cat)])]));
write('manifest.webmanifest', JSON.stringify({ name: cfg.name, short_name: cfg.name, start_url: BASE + '/', scope: BASE + '/', display: 'standalone', background_color: '#f6f7fb', theme_color: '#0b5fff', icons: [{ src: BASE + '/assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] }));

// feed, sitemap, robots, ads.txt
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(cfg.name)}</title><link>${SITE}/</link><description>${esc(cfg.tagline)}</description>${db.slice(0, 40).map(a => `<item><title>${esc(a.title)}</title><link>${SITE}/n/${a.slug}.html</link><guid>${a.id}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${esc(a.summary)}</description></item>`).join('')}</channel></rss>`);
const urls = ['/', ...cfg.categories.map(c => `/${c.slug}/`), '/guias/', ...guides.map(g => `/guias/${g.slug}.html`), ...db.map(a => `/n/${a.slug}.html`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${SITE}${u}</loc></url>`).join('')}</urlset>`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
if (cfg.ads.adsenseClient) write('ads.txt', `google.com, ${cfg.ads.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
console.log(`Site gerado em ${DIST}: ${urls.length} URLs`);
