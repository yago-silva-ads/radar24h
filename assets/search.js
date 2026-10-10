// busca no site (índice carregado só no primeiro foco) e botão "copiar link"
(()=>{
const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const q=document.getElementById('q'),r=document.getElementById('qres');
if(q){
  let idx=null;
  const load=()=>idx||(idx=fetch(window.__BASE+'/search.json').then(x=>x.json()).then(a=>a.map(i=>({t:i[0],u:i[1],c:i[2],n:norm(i[0])}))).catch(()=>[]));
  q.addEventListener('focus',load);
  q.addEventListener('input',async()=>{
    const v=norm(q.value.trim());
    if(v.length<2){r.hidden=true;return}
    const words=v.split(/\s+/),d=await load(),hits=d.filter(i=>words.every(w=>i.n.includes(w))).slice(0,8);
    r.textContent='';
    if(!hits.length){const a=document.createElement('a');a.textContent='Nenhum resultado';r.appendChild(a)}
    for(const i of hits){const a=document.createElement('a');a.href=window.__BASE+'/'+i.u;a.textContent=i.t;const s=document.createElement('small');s.textContent=i.c;a.appendChild(s);r.appendChild(a)}
    r.hidden=false;
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.search'))r.hidden=true});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(b){try{navigator.clipboard.writeText(b.dataset.copy)}catch{}b.textContent='Copiado ✓'}});
})();
