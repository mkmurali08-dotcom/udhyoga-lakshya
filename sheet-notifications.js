if (!document.getElementById('udyoga-sheet-status-styles')) {
  const style = document.createElement('style');
  style.id = 'udyoga-sheet-status-styles';
  style.textContent = `
  .sheet-live-items{margin-top:18px}
  .sheet-new-badge{display:inline-block;background:#e60000;color:#fff;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;margin-left:7px;vertical-align:middle}
  .sheet-latest-title{font-size:20px;font-weight:900;margin:0 0 12px}
  .sheet-latest-sub{font-size:11px;color:#666;margin:-4px 0 14px}
  .sheet-dynamic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;margin-top:20px}
  .sheet-dynamic-card{background:#fff;border-radius:12px;padding:19px;box-shadow:0 5px 20px rgba(0,0,0,.07);border:1px solid #eee;min-height:150px}
  .sheet-dynamic-card h3{margin:0;font-size:16px;line-height:1.4}
  .sheet-dynamic-meta{font-size:10px;color:#444;margin:8px 0;line-height:1.5}
  .sheet-dynamic-btn{display:inline-block;margin-top:5px;background:#111;color:#fff;text-decoration:none;padding:9px 13px;border-radius:6px;font-size:10px;font-weight:900}
  .sheet-dynamic-btn.yellow{background:#ffc400;color:#111}
  .sheet-dynamic-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
  .sheet-dynamic-badge{background:#ed1111;color:#fff;border-radius:5px;padding:5px 7px;font-size:9px;font-weight:900;white-space:nowrap}
  .sheet-dynamic-badge.yellow{background:#ffc400;color:#111}
  .sheet-card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0}
  .sheet-status{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:800;font-size:11px}
  .sheet-status.closed{background:#e5e7eb;color:#374151}.sheet-status.declared{background:#dcfce7;color:#166534}.sheet-status.admit{background:#ede9fe;color:#6b21a8}.sheet-status.upcoming{background:#ffedd5;color:#9a3412}.sheet-status.open{background:#dbeafe;color:#1d4ed8}.sheet-status.default{background:#f3f4f6;color:#374151}
  @media(max-width:850px){.sheet-dynamic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:600px){.sheet-dynamic-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

(function(){
  const DATA_URL='notifications.json';
  const script=document.currentScript;
  const wantedState=(script?.dataset.state||'').trim().toLowerCase();
  const latestMode=script?.dataset.latest==='true';
  const typeMode=(script?.dataset.type||'').trim().toLowerCase();
  const homeMode=script?.dataset.home==='true';

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function seenTime(r){const t=Date.parse(r.FirstSeen||'');return Number.isFinite(t)?t:0;}
  function fresh(r){return r.IsNew===true||r.IsNew==='true'||r.IsNew===1||r.IsNew==='1';}
  function type(r){return String(r.Type||'').trim().toLowerCase();}
  function link(r){return String(r['Apply Link']||r['Official Link']||'').trim();}
  function statusClass(s){const k=String(s||'').toLowerCase();if(/closed/.test(k))return'closed';if(/declared|live|result|selection/.test(k))return'declared';if(/admit|call letter|hall ticket/.test(k))return'admit';if(/upcoming|exam/.test(k))return'upcoming';if(/open|available|current/.test(k))return'open';return'default';}
  function card(r){
    const t=esc(r.Title), st=String(r.Status||'').trim(), ty=String(r.Type||'').trim();
    const start=String(r['Application Start']||'').trim(), end=String(r['Application End']||'').trim();
    const official=String(r['Official Link']||'').trim(), apply=String(r['Apply Link']||'').trim();
    const badge=fresh(r)?'<span class="sheet-new-badge">NEW</span>':'';
    const tag=st?`<span class="sheet-dynamic-badge">${esc(st)}</span>`:(ty?`<span class="sheet-dynamic-badge yellow">${esc(ty)}</span>`:'');
    let meta=''; if(start)meta+=`<div class="sheet-dynamic-meta"><b>Application Start:</b> ${esc(start)}</div>`; if(end)meta+=`<div class="sheet-dynamic-meta"><b>Application End:</b> ${esc(end)}</div>`;
    return `<article class="sheet-dynamic-card"><div class="sheet-dynamic-top"><h3>${t}${badge}</h3>${tag}</div>${meta}${official||apply?`<a class="sheet-dynamic-btn yellow" href="${esc(apply||official)}" target="_blank" rel="noopener noreferrer">${apply?'Apply / View Details':'Official Source ↗'}</a>`:''}</article>`;
  }
  function row(r,tagText){return `<div class="row"><a class="row-title" href="${esc(link(r))}" target="_blank" rel="noopener noreferrer">${esc(r.Title)}</a><span class="yellow-tag">${esc(tagText||'NEW')}</span></div>`;}

  fetch(DATA_URL+'?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('notifications.json HTTP '+r.status);return r.json();}).then(rows=>{
    let data=(Array.isArray(rows)?rows:[]).filter(r=>String(r.Title||'').trim());
    data.sort((a,b)=>seenTime(b)-seenTime(a));

    if(homeMode){
      const latestBox=document.querySelector('[data-sheet-home="latest"]');
      const upcomingBox=document.querySelector('[data-sheet-home="upcoming"]');
      const resultsBox=document.querySelector('[data-sheet-home="results"]');
      const freshData=data.filter(fresh);
      // Latest Notifications: new jobs + results + admit cards (not upcoming, which has its own box).
      if(latestBox){
        const latest=freshData.filter(r=>!['upcoming','exam'].includes(type(r))).slice(0,6);
        if(latest.length) latestBox.innerHTML=latest.map(r=>row(r,'NEW')).join('');
      }
      // Upcoming Exams: new Sheet upcoming/exam rows for the first 7 days.
      if(upcomingBox){
        const ups=freshData.filter(r=>['upcoming','exam'].includes(type(r))).slice(0,5);
        if(ups.length) upcomingBox.innerHTML=ups.map(r=>row(r,'NEW')).join('');
      }
      // Results & Admit Cards: new result/admit rows, also visible in Latest Notifications.
      if(resultsBox){
        const ra=freshData.filter(r=>['result','admit card'].includes(type(r))).slice(0,6);
        if(ra.length) resultsBox.innerHTML=ra.map(r=>`<div class="row"><a class="row-title" href="${esc(link(r))}" target="_blank" rel="noopener noreferrer">${esc(r.Title)}</a><span class="red-tag">${fresh(r)?'NEW':esc(r.Status||r.Type||'UPDATE')}</span></div>`).join('');
      }
      return;
    }

    if(latestMode) data=data.filter(fresh).slice(0,20);
    else {
      if(wantedState) data=data.filter(r=>String(r.State||'').trim().toLowerCase()===wantedState);
      if(typeMode==='upcoming') data=data.filter(r=>['upcoming','exam'].includes(type(r)));
      else if(typeMode) data=data.filter(r=>type(r)===typeMode);
    }
    if(!data.length)return;
    const target=document.querySelector('.sheet-dynamic-target');
    if(target){target.innerHTML=data.map(card).join('');return;}
    const main=document.querySelector('main'); if(!main)return;
    const wrap=document.createElement('section');wrap.className='sheet-live-items';
    const heading=document.createElement('h2');heading.className='sheet-latest-title';heading.textContent=latestMode?'Latest Notifications':typeMode==='result'?'Latest Results':typeMode==='admit card'?'Latest Admit Cards':typeMode==='upcoming'?'Latest Upcoming Exams':'Latest Updates';wrap.appendChild(heading);
    const sub=document.createElement('div');sub.className='sheet-latest-sub';sub.textContent=latestMode?'New updates added in the last 7 days':'Updated automatically from Google Sheets';wrap.appendChild(sub);
    const grid=document.createElement('div');grid.className='sheet-dynamic-grid';grid.innerHTML=data.map(card).join('');wrap.appendChild(grid);
    const anchor=main.querySelector('.list,.grid,.back');if(anchor)anchor.before(wrap);else main.appendChild(wrap);
  }).catch(e=>console.warn('Sheet notifications:',e));
})();
