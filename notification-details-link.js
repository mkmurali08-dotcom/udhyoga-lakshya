(function(){
  "use strict";

  const NOTIFICATIONS_URL = "notifications.json";
  const DETAILS_URL = "job-details.json";

  function norm(v){
    return String(v ?? "").trim().replace(/\s+/g," ").toLowerCase();
  }

  function getTitle(){
    try{
      return new URLSearchParams(location.search).get("title") || "";
    }catch(e){
      return "";
    }
  }

  function findLinkByText(pattern){
    return Array.from(document.querySelectorAll("a")).find(a =>
      pattern.test((a.textContent || "").trim())
    );
  }

  function isMissingText(v){
    const n = norm(v);
    return !n ||
      n === "not mentioned in the official notification" ||
      n === "not mentioned in official notification" ||
      n === "not available in the official notification" ||
      n === "not specified in the official notification" ||
      n === "not specified";
  }

  function closestFieldContainer(el){
    return (
      el.closest(
        ".detail-item,.detail-row,.info-item,.info-row,.field,.detail-card,.details-item,.job-detail-item,.detail-box,.info-box,.meta-item,.meta-row"
      ) || el.parentElement
    );
  }

  function findFieldContainerByLabel(labelPattern){
    const nodes = Array.from(document.querySelectorAll("body *"));

    for(const el of nodes){
      if(el.children.length > 4) continue;

      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || "")
        .join(" ")
        .trim();

      if(!labelPattern.test(norm(directText))) continue;

      const container = closestFieldContainer(el);
      if(container) return container;
    }

    return null;
  }

  function hideField(labelPattern){
    const container = findFieldContainerByLabel(labelPattern);
    if(container) container.style.display = "none";
  }

  function setOrHideLabeledField(labelPattern, value){
    const clean = String(value ?? "").trim();
    const container = findFieldContainerByLabel(labelPattern);

    if(!container){
      return;
    }

    if(isMissingText(clean)){
      container.style.display = "none";
      return;
    }

    const all = Array.from(container.querySelectorAll(
      ".value,.detail-value,.info-value,.field-value,dd,p,span,div"
    ));

    const labelEl = Array.from(container.querySelectorAll("*")).find(el =>
      labelPattern.test(norm(el.textContent || ""))
    );

    let target = all.find(el =>
      el !== labelEl &&
      !labelPattern.test(norm(el.textContent || "")) &&
      el.children.length === 0
    );

    if(!target){
      target = all.find(el =>
        el !== labelEl &&
        !labelPattern.test(norm(el.textContent || ""))
      );
    }

    if(target){
      target.textContent = clean;
    }
  }

  function hideMissingPlaceholderRows(){
    const placeholder =
      /not mentioned in (the )?official notification|not available in the official notification|not specified in the official notification|not specified/i;

    Array.from(document.querySelectorAll("body *")).forEach(el => {
      if(el.children.length !== 0) return;

      const text = String(el.textContent || "");
      if(!placeholder.test(text)) return;

      const container = closestFieldContainer(el);
      if(container) container.style.display = "none";
    });
  }

  async function applyNotificationData(){
    const title = getTitle();
    if(!title) return;

    let notifications = [];
    let details = {};

    try{
      const [nRes, dRes] = await Promise.all([
        fetch(NOTIFICATIONS_URL + "?v=" + Date.now(), {cache:"no-store"}),
        fetch(DETAILS_URL + "?v=" + Date.now(), {cache:"no-store"}).catch(() => null)
      ]);

      if(nRes.ok) notifications = await nRes.json();
      if(dRes && dRes.ok) details = await dRes.json();
    }catch(e){
      hideMissingPlaceholderRows();
      return;
    }

    if(!Array.isArray(notifications)) return;

    const row = notifications.find(r => norm(r.title) === norm(title));
    if(!row){
      hideMissingPlaceholderRows();
      return;
    }

    // Sheet controls the two buttons.
    const official = String(row.officialLink || "").trim();
    const apply = String(row.applyLink || "").trim();

    const officialBtn = findLinkByText(/official\s+portal/i);
    const applyBtn = findLinkByText(/apply\s*\/\s*check\s*status/i);

    if(officialBtn){
      if(official){
        officialBtn.href = official;
        officialBtn.target = "_blank";
        officialBtn.rel = "noopener noreferrer";
        officialBtn.style.removeProperty("display");
      }else{
        officialBtn.style.display = "none";
      }
    }

    if(applyBtn){
      if(apply){
        applyBtn.href = apply;
        applyBtn.target = "_blank";
        applyBtn.rel = "noopener noreferrer";
        applyBtn.style.removeProperty("display");
      }else{
        // No Apply Link in Sheet = do not show Apply / Check Status.
        applyBtn.style.display = "none";
      }
    }

    // Status comes from the Sheet only. Empty/missing status = hide the row.
    setOrHideLabeledField(/^status$/, row.status || "");

    // Organization comes from AI only. Empty/placeholder = hide the row.
    const detailValues = Object.values(details || {})
      .filter(v => v && typeof v === "object");

    const ai =
      detailValues.find(d => norm(d.title) === norm(title)) ||
      detailValues.find(d =>
        norm(d.official_notification_url || d.source_url || d.officialLink) === norm(official)
      ) ||
      {};

    setOrHideLabeledField(/^organization$/, ai.organization || "");

    // Remove any remaining placeholder fields generated by older detail data.
    hideMissingPlaceholderRows();
  }

  function run(){
    applyNotificationData();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run);
  }else{
    run();
  }
})();
