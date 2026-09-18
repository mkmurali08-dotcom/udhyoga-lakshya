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

  function isMissing(v){
    const n = norm(v);
    return !n ||
      n === "not mentioned in the official notification" ||
      n === "not mentioned in official notification" ||
      n === "not available in the official notification" ||
      n === "not specified in the official notification" ||
      n === "not specified";
  }

  function allLinks(pattern){
    return Array.from(document.querySelectorAll("a")).filter(a =>
      pattern.test((a.textContent || "").trim())
    );
  }

  function setLinkVisibility(pattern, value){
    const links = allLinks(pattern);
    links.forEach(link => {
      if(value){
        link.style.removeProperty("display");
        link.hidden = false;
        link.removeAttribute("aria-hidden");
      }else{
        link.style.display = "none";
        link.hidden = true;
        link.setAttribute("aria-hidden","true");
      }
    });
  }

  function closestField(el){
    return el.closest(
      ".detail-item,.detail-row,.info-item,.info-row,.field," +
      ".detail-card,.details-item,.job-detail-item,.detail-box,.info-box," +
      ".meta-item,.meta-row,.details-grid > *"
    ) || el.parentElement;
  }

  function labelContainers(pattern){
    const result = [];
    const seen = new Set();

    Array.from(document.querySelectorAll("body *")).forEach(el => {
      if(el.children.length > 5) return;

      const direct = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || "")
        .join(" ")
        .trim();

      if(!direct || !pattern.test(norm(direct))) return;

      const container = closestField(el);
      if(container && !seen.has(container)){
        seen.add(container);
        result.push(container);
      }
    });

    return result;
  }

  function hideField(pattern){
    labelContainers(pattern).forEach(container => {
      container.style.display = "none";
    });
  }

  function setField(pattern, value){
    const clean = String(value ?? "").trim();
    const containers = labelContainers(pattern);

    if(!containers.length) return;

    containers.forEach(container => {
      if(isMissing(clean)){
        container.style.display = "none";
        return;
      }

      const label = norm(
        Array.from(container.querySelectorAll("*"))
          .find(el => pattern.test(norm(el.textContent || "")))?.textContent || ""
      );

      const candidates = Array.from(container.querySelectorAll(
        ".value,.detail-value,.info-value,.field-value,dd,p,span,div"
      ));

      let target = candidates.find(el =>
        norm(el.textContent || "") !== label &&
        !pattern.test(norm(el.textContent || "")) &&
        el.children.length === 0
      );

      if(!target){
        target = candidates.find(el =>
          norm(el.textContent || "") !== label &&
          !pattern.test(norm(el.textContent || ""))
        );
      }

      if(target){
        target.textContent = clean;
        container.style.removeProperty("display");
      }
    });
  }

  function removePlaceholders(){
    const placeholder = /not mentioned in (the )?official notification|not available in the official notification|not specified in the official notification|not specified/i;

    Array.from(document.querySelectorAll("body *")).forEach(el => {
      if(el.children.length !== 0) return;
      if(!placeholder.test(String(el.textContent || ""))) return;

      const container = closestField(el);
      if(container) container.style.display = "none";
    });
  }

  async function getData(){
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
      removePlaceholders();
      return;
    }

    if(!Array.isArray(notifications)) return;

    const row = notifications.find(r => norm(r.title) === norm(title));
    if(!row){
      removePlaceholders();
      return;
    }

    const official = String(row.officialLink || "").trim();
    const apply = String(row.applyLink || "").trim();

    // Sheet decides the buttons. Apply button is NEVER shown without Apply Link.
    setLinkVisibility(/official\s+portal/i, !!official);
    setLinkVisibility(/apply\s*\/\s*check\s*status/i, !!apply);

    // Sheet controls status.
    setField(/^status$/, row.status || "");

    // AI controls organization. Missing AI value = hide the whole field.
    const values = Object.values(details || {})
      .filter(v => v && typeof v === "object");

    const ai =
      values.find(d => norm(d.title) === norm(title)) ||
      values.find(d =>
        norm(d.official_notification_url || d.source_url || d.officialLink) === norm(official)
      ) ||
      {};

    setField(/^organization$/, ai.organization || "");

    removePlaceholders();
  }

  let lastRun = 0;

  function run(){
    const now = Date.now();
    if(now - lastRun < 400) return;
    lastRun = now;
    getData();
  }

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run);
  }else{
    run();
  }
})();
