(()=>{
const $=s=>document.querySelector(s),ls={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
const track=(n,p)=>{try{window.gtag&&gtag('event',n,p)}catch{}};
// barra de leitura
const bar=$('#progress');addEventListener('scroll',()=>{const h=document.documentElement;bar.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight||1)*100)+'%'},{passive:true});
// cliques: CPA e fonte
document.addEventListener('click',e=>{const o=e.target.closest('[data-offer-click]');if(o)track('offer_click',{offer_id:o.dataset.offerClick,page:location.pathname});if(e.target.closest('#readsrc'))track('source_click',{page:location.pathname})});
// barra de oferta fixa após 8s (1x por sessão)
setTimeout(()=>{try{if(sessionStorage.getItem('sb'))return}catch{}const list=window.__OFFERS.filter(o=>o.cats.includes(window.__CAT));const o=(list[0]||window.__OFFERS[0]);if(!o)return;const b=$('#stickybar');
b.innerHTML=`<span>🔥 ${o.t}</span><a class="btn" rel="sponsored nofollow noopener" target="_blank" href="${o.u}" data-offer-click="${o.id}">${o.c}</a><button aria-label="Fechar">×</button>`;b.hidden=false;b.querySelector('button').onclick=()=>{b.hidden=true;try{sessionStorage.setItem('sb',1)}catch{}}},8000);
// modal de newsletter: intenção de saída (desktop) ou 40s (mobile), 1x a cada 3 dias
const m=$('#exitmodal'),seen=+ls.get('nlseen')||0,show=()=>{if(Date.now()-seen<2592e5||!m.hidden)return;m.hidden=false;ls.set('nlseen',Date.now())};
document.addEventListener('mouseout',e=>{if(e.clientY<=0)show()});setTimeout(()=>{if(matchMedia('(max-width:900px)').matches)show()},40000);
$('#xclose').onclick=()=>m.hidden=true;m.onclick=e=>{if(e.target===m)m.hidden=true};
})();
