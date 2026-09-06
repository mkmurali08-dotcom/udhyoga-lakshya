/* Adds a safe "View Full Details" action to Sheet-generated notification cards. */
(function(){
  const DATA='job-details.json';
  let details={};
  const slug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch(DATA+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(x=>{details=x||{}; scan(); new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});}).catch(()=>{});
  function scan(){
    document.querySelectorAll('.sheet-live-list article, .sheet-live-notifications article, .sheet-live-section article').forEach(card=>{
      if(card.querySelector('.full-details-link')) return;
      const title=card.querySelector('h3'); if(!title) return;
      const text=title.textContent.trim(); let key=slug(text);
      if(!details[key]){
        const found=Object.keys(details).find(k=>String(details[k].title||'').trim().toLowerCase()===text.toLowerCase());
        if(found) key=found;
      }
      if(!details[key]) return;
      const right=card.querySelector('.right')||card;
      const a=document.createElement('a'); a.className='official full-details-link'; a.href='notification-details.html?id='+encodeURIComponent(key); a.textContent='View Full Details ↗'; a.target='_self';
      right.appendChild(a);
    });
  }
})();
