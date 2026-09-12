(function(){
  "use strict";
  const script=document.currentScript;
  const isHome=script && script.dataset.home === "true";
  const DATA_URL="notifications.json";
  const DETAILS_URL="job-details.json";
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
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
  const examDate=r=>parseDate(r.exam_date||r.examDate||r.exam_date_from_ai||r.exam_date_start||r.date);
  const resultBlob=r=>[r.type,r.category,r.title,r.status].map(norm).join(" ");
  function isResult(r){return /result|admit\s*card|answer\s*key|selection|allocation|call\s*letter|hall\s*ticket|e-admit|ecall|ranked\s*list/i.test(resultBlob(r));}
  function isLiveOrOpen(r){return /\b(open|live|active|apply|applications?\s+open|accepting\s+applications?)\b/i.test(norm(r.status));}
  function isUpcomingStatus(r){return /\b(upcoming|scheduled|tentative|calendar|to\s*be\s*held|forthcoming)\b/i.test(norm(r.status));}
  function isClosed(r){return /\b(closed|expired|over|withdrawn|cancelled|declared)\b/i.test(norm(r.status));}
  function active(r){if(isClosed(r))return false;const e=endDate(r);return !e||e>=new Date();}
  function category(r){
    if(r.portal_category && ["latest-notifications","upcoming-exams","results-admit-cards"].includes(norm(r.portal_category))){
      if(isResult(r)) return "results-admit-cards";
      if(isLiveOrOpen(r)) return "latest-notifications";
      if(isUpcomingStatus(r)) return "upcoming-exams";
      return norm(r.portal_category);
    }
    if(isResult(r)) return "results-admit-cards";
    if(isLiveOrOpen(r)) return "latest-notifications";
    const type=norm(r.type), blob=resultBlob(r);
    if(isUpcomingStatus(r)) return "upcoming-exams";
    if(type==="exam" || /\b(upcoming exam|exam calendar|scheduled exam)\b/i.test(blob)) return "upcoming-exams";
    if(type==="job" || /job|recruitment|vacanc|application|engagement|hiring|notification/i.test(blob)) return "latest-notifications";
    const ed=examDate(r); if(ed && ed>=new Date() && !isLiveOrOpen(r)) return "upcoming-exams";
    return "latest-notifications";
  }
  function enrich(rows,details){
    const by={};
    if(details && typeof details==="object") Object.values(details).forEach(d=>{if(!d||typeof d!=="object")return; const k=String(d.official_notification_url||d.source_url||d.officialLink||"").trim(); if(k)by[k]=d;});
    return rows.map(r=>{const d=by[String(r.officialLink||"").trim()]; return d?Object.assign({},r,d,{title:r.title||d.title,type:r.type||d.type,state:r.state||d.state,status:r.status||d.status,officialLink:r.officialLink||d.official_notification_url,applyLink:r.applyLink||d.apply_url,portal_category:d.portal_category||d.portal_category}):r;});
  }
  function isNew(r){if(r.isNew===true||norm(r.isNew)==="true")return true;const d=parseDate(r.firstSeen);return !!d&&(Date.now()-d.getTime())<=7*86400000;}
  function link(r){return "job-detail.html?title="+encodeURIComponent(String(r.title||""));}
  function displayDate(r){const s=String(r.applicationStart||r.start||"").trim(),e=String(r.applicationEnd||r.end||"").trim(),d=String(r.date||"").trim();if(s&&e&&s!==e)return s+"–"+e;return e||s||d;}
  function row(r,mode){
    const el=document.createElement("div"); el.className="row";
    const href=link(r), t=esc(r.title||"Notification"), d=esc(displayDate(r)); let right="";
    if(mode==="latest") right='<span class="row-date">'+(d?'<span class="latest-notification-date-yellow">'+d+'</span>':'')+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';
    else if(mode==="upcoming") right='<span class="yellow-tag">'+(d||"Upcoming")+'</span>';
    else {const m=resultBlob(r);const label=/admit\s*card|call\s*letter|hall\s*ticket|e-admit|ecall/.test(m)?"Admit Card":/answer\s*key/.test(m)?"Answer Key":/selection|allocation/.test(m)?"Selection Update":"Result";right='<span class="red-tag">'+label+'</span>';}
    el.innerHTML='<a class="row-title" href="'+esc(href)+'">'+t+'</a>'+right; return el;
  }
  function fill(card,rows,mode){if(!card)return;card.querySelectorAll(".row,.sheet-home-loading").forEach(e=>e.remove());const f=document.createDocumentFragment();rows.sort((a,b)=>(endDate(b)?.getTime()||0)-(endDate(a)?.getTime()||0)).slice(0,6).forEach(r=>f.appendChild(row(r,mode)));const footer=card.querySelector(".card-footer");if(footer)card.insertBefore(f,footer);else card.appendChild(f);}
  function renderHome(rows){const cards=document.querySelectorAll(".cards > .card");if(cards.length<3)return;const latest=rows.filter(r=>category(r)==="latest-notifications"&&active(r));const upcoming=rows.filter(r=>category(r)==="upcoming-exams"&&active(r));const results=rows.filter(r=>category(r)==="results-admit-cards");fill(cards[0],latest,"latest");fill(cards[1],upcoming,"upcoming");fill(cards[2],results,"results");}
  Promise.all([fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("notifications.json HTTP "+r.status);return r.json()}),fetch(DETAILS_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}))]).then(([rows,details])=>{if(isHome)renderHome(enrich(Array.isArray(rows)?rows:[],details));}).catch(err=>{console.error("Udhyoga Lakshya Sheets:",err);document.querySelectorAll(".sheet-home-loading").forEach(e=>e.textContent="Notifications temporarily unavailable")});
})();
