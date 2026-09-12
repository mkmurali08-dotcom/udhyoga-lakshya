(function(){
  "use strict";
  const DATA_URL="notifications.json", DETAILS_URL="job-details.json";
  const pageKey=(document.body.dataset.notificationPage||"").trim();
  const page=({latest:"latest-notifications",upcoming:"upcoming-exams",results:"results-admit-cards"})[pageKey]||pageKey;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const norm=v=>String(v??"").trim().toLowerCase().replace(/&/g,"and").replace(/\s+/g," ");
  function parseDate(v){const s=String(v??"").trim();if(!s)return null;let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return new Date(+m[3],+m[2]-1,+m[1],23,59,59,999);m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);if(m)return new Date(+m[1],+m[2]-1,+m[3],23,59,59,999);const n=Number(s);if(Number.isFinite(n)&&n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),23,59,59,999)}const d=new Date(s.replace(/\bSept\b/i,"Sep").replace(/\./g,""));return Number.isNaN(d.getTime())?null:new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999)}
  const end=r=>parseDate(r.applicationEnd||r.end||r.date);
  const blob=r=>[r.type,r.category,r.title,r.status].map(norm).join(" ");
  const result=r=>/result|admit\s*card|answer\s*key|selection|allocation|call\s*letter|hall\s*ticket|e-admit|ecall|ranked\s*list/i.test(blob(r));
  const live=r=>/\b(open|live|active|apply|applications?\s+open|accepting\s+applications?)\b/i.test(norm(r.status));
  const upcomingStatus=r=>/\b(upcoming|scheduled|tentative|calendar|to\s*be\s*held|forthcoming)\b/i.test(norm(r.status));
  const category=r=>{
    if(result(r))return "results-admit-cards";
    if(live(r))return "latest-notifications";
    if(upcomingStatus(r))return "upcoming-exams";
    const pc=norm(r.portal_category);if(["latest-notifications","upcoming-exams","results-admit-cards"].includes(pc))return pc;
    const t=norm(r.type), b=blob(r);if(t==="exam"||/upcoming exam|exam calendar|scheduled exam/i.test(b))return "upcoming-exams";if(t==="job"||/job|recruitment|vacanc|application|engagement|hiring|notification/i.test(b))return "latest-notifications";return "latest-notifications";
  };
  function enrich(rows,details){const by={};if(details&&typeof details==="object")Object.values(details).forEach(d=>{if(!d||typeof d!=="object")return;const k=String(d.official_notification_url||d.source_url||d.officialLink||"").trim();if(k)by[k]=d});return rows.map(r=>{const d=by[String(r.officialLink||"").trim()];return d?Object.assign({},r,d,{title:r.title||d.title,type:r.type||d.type,state:r.state||d.state,status:r.status||d.status,portal_category:r.portal_category||d.portal_category}):r})}
  function detailLink(r){return "job-detail.html?title="+encodeURIComponent(String(r.title||""))}
  function dateText(r){const s=String(r.applicationStart||"").trim(),e=String(r.applicationEnd||"").trim();return s&&e&&s!==e?s+" – "+e:(e||s||String(r.date||""))}
  function statusInfo(r){const b=blob(r),s=norm(r.status);if(result(r)){if(/admit\s*card|call\s*letter|hall\s*ticket|e-admit|ecall/.test(b))return ["Admit Card","status-admit"];if(/answer\s*key/.test(b))return ["Answer Key","status-result"];return [/selection|allocation/.test(b)?"Selection Update":"Result","status-result"]}if(/live|active/.test(s))return ["Live","status-live"];if(/open|apply/.test(s))return ["Open","status-open"];if(upcomingStatus(r))return ["Upcoming","status-upcoming"];if(/closed|expired|over/.test(s))return ["Closed","status-closed"];return [r.status||"Open","status-open"]}
  function card(r){const c=document.createElement("article");c.className="notice-item";const d=dateText(r),[label,cls]=statusInfo(r);c.innerHTML='<div class="notice-main"><h2><a href="'+esc(detailLink(r))+'">'+esc(r.title)+'</a></h2><div class="meta"><span>'+esc(r.type||"Notification")+'</span><span>'+esc(r.state||"")+'</span>'+(r.category?'<span>'+esc(r.category)+'</span>':'')+(d?'<span>'+esc(d)+'</span>':'')+'<span class="'+cls+'">'+esc(label)+'</span></div></div><a class="details" href="'+esc(detailLink(r))+'">View Details →</a>';return c}
  Promise.all([fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}),fetch(DETAILS_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}))]).then(([rows,details])=>{rows=enrich(Array.isArray(rows)?rows:[],details);const f=rows.filter(r=>category(r)===page);f.sort((a,b)=>(end(b)?.getTime()||0)-(end(a)?.getTime()||0));document.getElementById("count").textContent=f.length+" notifications";const list=document.getElementById("list");if(!f.length){list.innerHTML='<div class="empty">No notifications available in this category.</div>';return}f.forEach(r=>list.appendChild(card(r)))}).catch(e=>{console.error(e);document.getElementById("list").innerHTML='<div class="empty">Notifications are temporarily unavailable.</div>'});
})();
