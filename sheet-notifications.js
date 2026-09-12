(function(){
  "use strict";
  const script=document.currentScript;
  const isHome=script && script.dataset.home === "true";
  const DATA_URL="notifications.json";
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=v=>String(v??"").trim().toLowerCase().replace(/&/g,"and").replace(/\s+/g," ");
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
  const startDate=r=>parseDate(r.applicationStart||r.start);
  const endDate=r=>parseDate(r.applicationEnd||r.end||r.date);
  const examDate=r=>parseDate(r.exam_date||r.examDate||r.exam_date_from_ai||r.date);
  function active(r){const s=norm(r.status);if(/closed|expired|over|withdrawn|cancelled/.test(s))return false;const e=endDate(r);return !e||e>=new Date();}
  function result(r){return /result|admit\s*card|answer\s*key|selection|allocation|call\s*letter|hall\s*ticket/i.test([r.type,r.category,r.title,r.status].map(norm).join(" "));}
  function latest(r){
    if(result(r))return false;
    const blob=[r.type,r.category,r.title,r.status].map(norm).join(" ");
    const open=/open|live|active|apply|application|recruitment|notification|engagement/i.test(blob);
    const s=startDate(r), e=endDate(r);
    if(e && e>=new Date() && (open || norm(r.type)==="job" || /recruit|vacanc|job|application|engagement/i.test(norm(r.category)))) return true;
    return /latest-notifications/.test(norm(r.portal_category)) && active(r);
  }
  function upcoming(r){
    if(result(r)||latest(r)||!active(r))return false;
    if(norm(r.portal_category)==="upcoming-exams")return true;
    const blob=[r.type,r.category,r.title,r.status].map(norm).join(" ");
    const explicit=/upcoming\s*exam|exam\s*calendar|scheduled\s*exam/.test(blob);
    const ed=examDate(r);
    return explicit && !!ed && ed>=new Date();
  }
  function isNew(r){if(r.isNew===true||norm(r.isNew)==="true")return true;const d=parseDate(r.firstSeen);return !!d&&(Date.now()-d.getTime())<=7*86400000;}
  function link(r){const key=String(r._identity_key||r._identity||r.title||"");return "job-detail.html?title="+encodeURIComponent(String(r.title||key));}
  function displayDate(r){const s=String(r.applicationStart||r.start||"").trim(),e=String(r.applicationEnd||r.end||"").trim(),d=String(r.date||"").trim();if(s&&e&&s!==e)return s+"–"+e;return e||s||d;}
  function row(r,mode){
    const el=document.createElement("div"); el.className="row";
    const href=link(r), t=esc(r.title||"Notification"), d=esc(displayDate(r)); let right="";
    if(mode==="latest")right='<span class="row-date">'+(d?'<span class="latest-notification-date-yellow">'+d+'</span>':'')+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';
    else if(mode==="upcoming")right='<span class="yellow-tag">'+(d||"Upcoming")+'</span>';
    else {const m=norm(r.type)+" "+norm(r.category)+" "+norm(r.title);const label=/admit\s*card|call\s*letter|hall\s*ticket/.test(m)?"Admit Card":/answer\s*key/.test(m)?"Answer Key":/selection|allocation/.test(m)?"Selection Update":"Result";right='<span class="red-tag">'+label+'</span>';}
    el.innerHTML='<a class="row-title" href="'+esc(href)+'">'+t+'</a>'+right; return el;
  }
  function fill(card,rows,mode){if(!card)return;card.querySelectorAll(".row,.sheet-home-loading").forEach(e=>e.remove());const f=document.createDocumentFragment();rows.sort((a,b)=>(endDate(b)?.getTime()||0)-(endDate(a)?.getTime()||0)).slice(0,6).forEach(r=>f.appendChild(row(r,mode)));const footer=card.querySelector(".card-footer");if(footer)card.insertBefore(f,footer);else card.appendChild(f);}
  function renderHome(rows){const cards=document.querySelectorAll(".cards > .card");if(cards.length<3)return;fill(cards[0],rows.filter(r=>latest(r)&&active(r)),"latest");fill(cards[1],rows.filter(r=>upcoming(r)),"upcoming");fill(cards[2],rows.filter(r=>result(r)),"results");}
  fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("notifications.json HTTP "+r.status);return r.json()}).then(data=>{if(isHome)renderHome(Array.isArray(data)?data:[])}).catch(err=>{console.error("Udhyoga Lakshya Sheets:",err);document.querySelectorAll(".sheet-home-loading").forEach(e=>e.textContent="Notifications temporarily unavailable")});
})();
