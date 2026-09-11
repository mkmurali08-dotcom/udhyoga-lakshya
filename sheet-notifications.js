(function(){
  "use strict";
  const script=document.currentScript;
  const isHome=script&&script.dataset.home==="true";
  const DATA_URL="notifications.json";
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
  const norm=v=>String(v??"").trim().toLowerCase();
  function parseDate(value){
    const raw=String(value??"").trim(); if(!raw)return null;
    let m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1],23,59,59,999);
    m=raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3],23,59,59,999);
    const serial=Number(raw);
    if(Number.isFinite(serial)&&serial>20000&&serial<80000){const d=new Date(Date.UTC(1899,11,30)+serial*86400000);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),23,59,59,999);}
    const d=new Date(raw.replace(/\bSept\b/i,"Sep").replace(/\./g,""));
    return Number.isNaN(d.getTime())?null:new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
  }
  function endDate(r){return parseDate(r.applicationEnd||r.end||r.date);}
  function displayDate(r){const s=String(r.applicationStart||r.start||"").trim(),e=String(r.applicationEnd||r.end||"").trim(),d=String(r.date||"").trim();if(s&&e&&s!==e)return s+"–"+e;return e||s||d;}
  function expired(r){const d=endDate(r);return !!d&&d<new Date();}
  function closed(r){return /closed|expired|over|withdrawn/i.test(String(r.status||""));}
  function isJob(r){return norm(r.type)==="job"||/recruit|vacanc/i.test(norm(r.category));}
  function isExam(r){return norm(r.type)==="exam"||/upcoming\s*exam|exam/i.test(norm(r.category));}
  function isResult(r){return /result|admit\s*card|answer\s*key|selection/i.test(norm(r.type)+" "+norm(r.category));}
  function isNew(r){if(r.isNew===true||norm(r.isNew)==="true")return true;const d=parseDate(r.firstSeen);return !!d&&(Date.now()-d.getTime())<=7*86400000;}
  function link(r){return String(r.officialLink||r.applyLink||"").trim();}
  function sort(rows){return rows.slice().sort((a,b)=>(endDate(b)?.getTime()||0)-(endDate(a)?.getTime()||0));}
  function row(r,mode){const el=document.createElement("div");el.className="row";const l=link(r),t=esc(r.title||"Notification"),d=esc(displayDate(r));let right="";if(mode==="latest")right='<span class="row-date">'+(d?'<span class="latest-notification-date-yellow">'+d+'</span>':'')+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';else if(mode==="upcoming")right='<span class="yellow-tag">'+(d||"Upcoming")+'</span>';else{const m=norm(r.type)+" "+norm(r.category);const label=/admit\s*card/.test(m)?"Admit Card":/answer\s*key/.test(m)?"Answer Key":/selection/.test(m)?"Selection Update":"Result";right='<span class="red-tag">'+label+'</span>';}el.innerHTML=l?'<a class="row-title" href="'+esc(l)+'" rel="noopener noreferrer" target="_blank">'+t+'</a>'+right:'<span class="row-title">'+t+'</span>'+right;return el;}
  function fill(card,rows,mode){if(!card)return;card.querySelectorAll(".row,.sheet-home-loading").forEach(e=>e.remove());const f=document.createDocumentFragment();sort(rows).slice(0,6).forEach(r=>f.appendChild(row(r,mode)));const footer=card.querySelector(".card-footer");if(footer)card.insertBefore(f,footer);else card.appendChild(f);}
  function render(rows){const cards=document.querySelectorAll(".cards > .card");if(cards.length<3)return;fill(cards[0],rows.filter(r=>isJob(r)&&!closed(r)&&!expired(r)),"latest");fill(cards[1],rows.filter(r=>isExam(r)&&!closed(r)&&!expired(r)),"upcoming");fill(cards[2],rows.filter(isResult),"results");}
  fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("notifications.json HTTP "+r.status);return r.json();}).then(data=>{if(isHome)render(Array.isArray(data)?data:[]);}).catch(err=>{console.error("Udhyoga Lakshya Sheets:",err);document.querySelectorAll(".sheet-home-loading").forEach(e=>e.textContent="Notifications temporarily unavailable");});
})();
