(function(){
  "use strict";

  const script = document.currentScript;
  const isHome = script && script.dataset.home === "true";
  const stateTarget = script ? String(script.dataset.state || "").trim() : "";
  const DATA_URL = "notifications.json";
  const DETAILS_URL = "job-details.json";

  if (!document.getElementById("udhyoga-home-notification-layout")) {
    const style = document.createElement("style");
    style.id = "udhyoga-home-notification-layout";
    style.textContent = `
      .cards > .card .sheet-home-notification-row{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:8px!important;width:100%!important;height:auto!important;min-height:0!important;padding:12px 15px!important;overflow:visible!important}
      .cards > .card .sheet-home-notification-row .row-title{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;word-break:normal!important;overflow-wrap:anywhere!important;line-height:1.28!important}
      .cards > .card .sheet-home-notification-row .row-date{display:flex!important;width:100%!important;flex-wrap:wrap!important;justify-content:flex-end!important;align-items:center!important;gap:6px!important;margin:0!important;min-height:0!important}
      .cards > .card .sheet-home-notification-row .latest-notification-date-yellow,
      .cards > .card .sheet-home-notification-row .yellow-tag,
      .cards > .card .sheet-home-notification-row .red-tag{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 1 auto!important;max-width:100%!important;min-width:0!important;height:auto!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;line-height:1.18!important;text-align:center!important}
      .cards > .card .sheet-home-notification-row .new,.sheet-state-notification-row .sheet-new{flex:0 0 auto!important;white-space:nowrap!important;margin-left:0!important}
      .sheet-state-notification-row .sheet-new{display:inline-flex;align-items:center;justify-content:center;background:#e60000;color:#fff;border-radius:5px;padding:5px 7px;font-size:8px;font-weight:900;margin-left:4px}
      .sheet-state-notification-row .sheet-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
      .sheet-state-notification-row .sheet-date{color:#666;font-size:10px;line-height:1.5}
      @media(max-width:700px){.cards > .card .sheet-home-notification-row{padding:11px 12px!important;gap:7px!important}.cards > .card .sheet-home-notification-row .row-date{justify-content:flex-start!important}}
    `;
    document.head.appendChild(style);
  }

  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const norm = v => String(v ?? "").trim().toLowerCase().replace(/&/g,"and").replace(/\s+/g," ");

  function parseDate(value){
    const raw=String(value ?? "").trim();
    if(!raw)return null;
    let m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1],23,59,59,999);
    m=raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3],23,59,59,999);
    const serial=Number(raw);
    if(Number.isFinite(serial)&&serial>20000&&serial<80000){
      const d=new Date(Date.UTC(1899,11,30)+serial*86400000);
      return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),23,59,59,999);
    }
    const d=new Date(raw.replace(/\bSept\b/i,"Sep").replace(/\./g,""));
    return Number.isNaN(d.getTime())?null:new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
  }

  const startDate=r=>parseDate(r.applicationStart||r.start);
  const endDate=r=>parseDate(r.applicationEnd||r.end||r.date);
  const examDate=r=>String(r.examDate||r.exam_date||r.exam_date_from_ai||r.exam_date_start||"").trim();
  const editCorrection=r=>String(r.editCorrection||r.edit_correction||r.editCorrectionDate||r.edit_correction_date||"").trim();
  const resultBlob=r=>[r.type,r.category,r.title,r.status].map(norm).join(" ");

  function isResult(r){return /result|admit\s*card|answer\s*key|selection|allocation|call\s*letter|hall\s*ticket|e-admit|ecall|ranked\s*list/i.test(resultBlob(r));}
  function isLiveOrOpen(r){return /\b(open|live|active|apply|applications?\s+open|accepting\s+applications?)\b/i.test(norm(r.status));}
  function isUpcomingStatus(r){return /\b(upcoming|scheduled|tentative|calendar|to\s*be\s*held|forthcoming)\b/i.test(norm(r.status));}
  function isClosed(r){return /\b(closed|expired|over|withdrawn|cancelled|declared)\b/i.test(norm(r.status));}
  function isSpecialLatestStatus(r){return /\b(extended|closing\s*soon)\b/i.test(norm(r.status));}
  function active(r){if(isClosed(r))return false;const e=endDate(r);return !e||e>=new Date();}

  function category(r){
    if(r.portal_category&&["latest-notifications","upcoming-exams","results-admit-cards"].includes(norm(r.portal_category))){
      if(isSpecialLatestStatus(r))return "latest-notifications";
      if(isResult(r))return "results-admit-cards";
      if(isLiveOrOpen(r))return "latest-notifications";
      if(isUpcomingStatus(r))return "upcoming-exams";
      return norm(r.portal_category);
    }
    if(isSpecialLatestStatus(r))return "latest-notifications";
    if(isResult(r))return "results-admit-cards";
    if(isLiveOrOpen(r))return "latest-notifications";
    const type=norm(r.type),blob=resultBlob(r);
    if(isUpcomingStatus(r))return "upcoming-exams";
    if(type==="exam"||/\b(upcoming exam|exam calendar|scheduled exam)\b/i.test(blob))return "upcoming-exams";
    if(type==="job"||/job|recruitment|vacanc|application|engagement|hiring|notification/i.test(blob))return "latest-notifications";
    const ed=examDate(r);
    if(ed&&!isLiveOrOpen(r))return "upcoming-exams";
    return "latest-notifications";
  }

  function enrich(rows,details){
    const by={};
    if(details&&typeof details==="object")Object.values(details).forEach(d=>{
      if(!d||typeof d!=="object")return;
      const k=String(d.official_notification_url||d.source_url||d.officialLink||"").trim();
      if(k)by[k]=d;
    });
    return rows.map(r=>{
      const d=by[String(r.officialLink||"").trim()];
      return d?Object.assign({},r,d,{
        title:r.title||d.title,
        type:r.type||d.type,
        state:r.state||d.state,
        status:r.status||d.status,
        officialLink:r.officialLink||d.official_notification_url,
        applyLink:r.applyLink||d.apply_url,
        portal_category:r.portal_category||d.portal_category,
        examDate:String(r.examDate??"").trim(),
        editCorrection:String(r.editCorrection??"").trim()
      }):r;
    });
  }

  function isNew(r){
    if(r.isNew===true||norm(r.isNew)==="true")return true;
    const raw=String(r.firstSeen||"").trim();
    if(!raw)return false;
    const t=new Date(raw).getTime();
    return Number.isFinite(t)&&(Date.now()-t)<=7*86400000;
  }

  function firstSeenTime(r){
    const raw=String(r.firstSeen||"").trim();
    if(!raw)return 0;
    const d=new Date(raw);
    return Number.isNaN(d.getTime())?0:d.getTime();
  }

  function sortNewestFirst(rows){
    return rows.sort((a,b)=>{
      const af=firstSeenTime(a),bf=firstSeenTime(b);
      if(bf!==af)return bf-af;
      const ad=endDate(a)?.getTime()||0,bd=endDate(b)?.getTime()||0;
      return bd-ad;
    });
  }

  function displayDate(r){
    const s=String(r.applicationStart||r.start||"").trim(),e=String(r.applicationEnd||r.end||"").trim(),ex=examDate(r),ec=editCorrection(r);
    if(s&&e&&s!==e)return s+"–"+e;
    if(e||s)return e||s;
    if(ex)return "Exam Date: "+ex;
    if(ec)return "Edit / Correction: "+ec;
    return "";
  }

  function homeLink(r){return "job-detail.html?title="+encodeURIComponent(String(r.title||""));}

  function homeRow(r,mode){
    const el=document.createElement("div");el.className="row sheet-home-notification-row";
    const href=homeLink(r),t=esc(r.title||"Notification"),d=esc(displayDate(r));let right="";
    if(mode==="latest"){
      right='<span class="row-date">'+(d?'<span class="latest-notification-date-yellow">'+d+'</span>':'')+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';
    }else if(mode==="upcoming"){
      right='<span class="row-date"><span class="yellow-tag">'+(d||"Upcoming")+'</span>'+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';
    }else{
      const m=resultBlob(r);
      const label=/admit\s*card|call\s*letter|hall\s*ticket|e-admit|ecall/.test(m)?"Admit Card":/answer\s*key/.test(m)?"Answer Key":/selection|allocation/.test(m)?"Selection Update":"Result";
      right='<span class="row-date"><span class="red-tag">'+label+'</span>'+(isNew(r)?'<span class="new">NEW</span>':'')+'</span>';
    }
    el.innerHTML='<a class="row-title" href="'+esc(href)+'">'+t+'</a>'+right;
    return el;
  }

  function fillHome(card,rows,mode){
    if(!card)return;
    card.querySelectorAll(".row,.sheet-home-loading").forEach(e=>e.remove());
    const f=document.createDocumentFragment();
    sortNewestFirst(rows).slice(0,6).forEach(r=>f.appendChild(homeRow(r,mode)));
    const footer=card.querySelector(".card-footer");
    if(footer)card.insertBefore(f,footer);else card.appendChild(f);
  }

  function renderHome(rows){
    const cards=document.querySelectorAll(".cards > .card");
    if(cards.length<3)return;
    fillHome(cards[0],rows.filter(r=>category(r)==="latest-notifications"&&active(r)),"latest");
    fillHome(cards[1],rows.filter(r=>category(r)==="upcoming-exams"&&active(r)),"upcoming");
    fillHome(cards[2],rows.filter(r=>category(r)==="results-admit-cards"),"results");
  }

  function isCentralState(state){
    const s=norm(state);
    return s==="central government"||s==="central goverment"||s==="central govt"||s==="central gov";
  }

  function stateRows(rows,target){return sortNewestFirst(rows.filter(r=>active(r)&&norm(r.state)===norm(target)));}
  function centralRows(rows){return sortNewestFirst(rows.filter(r=>active(r)&&isCentralState(r.state)));}

  function stateItem(r){
    const item=document.createElement("article");item.className="item sheet-state-notification-row";
    const title=esc(r.title||"Notification"),org=esc(r.category||r.type||"Notification"),date=esc(displayDate(r)),status=esc(String(r.status||"Open").trim());
    const official=String(r.officialLink||"").trim();
    const officialHtml=official?'<a class="official" href="'+esc(official)+'" target="_blank" rel="noopener">Official Link ↗</a>':"";
    const newHtml=isNew(r)?'<span class="sheet-new">NEW</span>':"";
    item.innerHTML='<div><span class="org">'+org+'</span><h3>'+title+'</h3><div class="sheet-meta">'+(date?'<span class="sheet-date">'+date+'</span>':"")+newHtml+'</div></div><div class="right"><span class="status">'+status+'</span>'+officialHtml+'</div>';
    return item;
  }

  function buildStateSection(title,rows){
    const section=document.createElement("section");section.className="section";
    const h2=document.createElement("h2");h2.textContent=title;section.appendChild(h2);
    const list=document.createElement("div");list.className="list";
    if(!rows.length)list.innerHTML='<div style="padding:18px 20px;color:#666;font-size:11px">No Sheet notifications available.</div>';
    else{const f=document.createDocumentFragment();rows.forEach(r=>f.appendChild(stateItem(r)));list.appendChild(f);}
    section.appendChild(list);return section;
  }

  function renderState(rows,target){
    const wrap=document.querySelector("main.wrap");if(!wrap)return;
    // State pages must contain ONLY the state selected in the page URL/data-state.
    // Central Government jobs stay on the dedicated Central Government page and
    // must not leak into Telangana, Andhra Pradesh, or any other state page.
    wrap.querySelectorAll(":scope > .section, :scope > .list").forEach(e=>e.remove());
    const before=wrap.querySelector(".note, .back");
    const insert=node=>{if(before)wrap.insertBefore(node,before);else wrap.appendChild(node);};

    const rowsForPage=isCentralState(target)
      ? centralRows(rows)
      : stateRows(rows,target);

    const title=isCentralState(target)
      ? "Central Government Jobs"
      : target+" Government Jobs";

    insert(buildStateSection(title,rowsForPage));
  }

  function run(){
    Promise.all([
      fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("notifications.json HTTP "+r.status);return r.json();}),
      fetch(DETAILS_URL+"?v="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]).then(([rows,details])=>{
      const data=enrich(Array.isArray(rows)?rows:[],details);
      if(isHome){renderHome(data);return;}
      if(stateTarget){renderState(data,stateTarget);}
    }).catch(err=>{
      console.error("Udhyoga Lakshya Sheets:",err);
      if(isHome)document.querySelectorAll(".sheet-home-loading").forEach(e=>e.textContent="Notifications temporarily unavailable");
    });
  }

  run();
})();
