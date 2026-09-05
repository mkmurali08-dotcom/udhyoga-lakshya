
if (!document.getElementById('udyoga-sheet-status-styles')) {
  const style = document.createElement('style');
  style.id = 'udyoga-sheet-status-styles';
  style.textContent = `.sheet-live-items .status-closed,.sheet-live-items .status-declared,.sheet-live-items .status-admit,.sheet-live-items .status-upcoming,.sheet-live-items .status-open,.sheet-live-items .status-default{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:800;font-size:11px}.sheet-live-items .status-closed{background:#e5e7eb;color:#374151}.sheet-live-items .status-declared{background:#dcfce7;color:#166534}.sheet-live-items .status-admit{background:#ede9fe;color:#6b21a8}.sheet-live-items .status-upcoming{background:#ffedd5;color:#9a3412}.sheet-live-items .status-open{background:#dbeafe;color:#1d4ed8}.sheet-live-items .status-default{background:#f3f4f6;color:#374151}.sheet-new-badge{display:inline-block;background:#e60000;color:#fff;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;margin-left:7px;vertical-align:middle}.sheet-latest-title{font-size:12px;font-weight:900;margin:0 0 12px}.sheet-home-latest .row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eee}.sheet-home-latest .row:last-child{border-bottom:0}.sheet-home-latest .row-title{font-size:12px;font-weight:800;text-decoration:none;color:inherit;line-height:1.35}.sheet-home-latest .row-date{font-size:10px;white-space:nowrap}`;
  document.head.appendChild(style);
}

(function () {
  const DATA_URL = "notifications.json";
  const script = document.currentScript;
  const wantedState = (script?.dataset.state || "").trim().toLowerCase();
  const latestMode = script?.dataset.latest === "true";
  const homeLatestMode = script?.dataset.homeLatest === "true";

  const oldBox = document.querySelector(homeLatestMode ? ".sheet-home-latest" : ".sheet-live-notifications");
  if (oldBox) oldBox.remove();

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function parseDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = s.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
  }

  function displayDate(r) {
    return String(r["Application Start"] || r.Date || r["Application End"] || "").trim();
  }

  fetch(DATA_URL, { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(`notifications.json HTTP ${r.status}`); return r.json(); })
    .then(rows => {
      let data = (Array.isArray(rows) ? rows : []).filter(r => String(r.Title || "").trim());

      if (!latestMode && !homeLatestMode) {
        data = data.filter(r => {
          const rowState = String(r.State || "").trim().toLowerCase();
          if (wantedState === "central govt jobs" || wantedState === "central government") {
            return rowState === "central govt jobs" || rowState === "central government";
          }
          return rowState === wantedState;
        });
      }

      data.sort((a,b) => {
        const ad = a.FirstSeen === 'baseline' ? 0 : Date.parse(a.FirstSeen || '') || 0;
        const bd = b.FirstSeen === 'baseline' ? 0 : Date.parse(b.FirstSeen || '') || 0;
        return bd - ad;
      });

      if (homeLatestMode) {
        data = data.slice(0, 6);
        if (!data.length) return;
        const box = document.createElement('div');
        box.className = 'sheet-home-latest';
        data.forEach(r => {
          const row = document.createElement('div'); row.className = 'row';
          const official = String(r["Official Link"] || "").trim();
          const href = official || '#';
          const fresh = r.IsNew === true ? '<span class="sheet-new-badge">NEW</span>' : '';
          row.innerHTML = `<a class="row-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(r.Title)}${fresh}</a><span class="row-date">${esc(displayDate(r))}</span>`;
          box.appendChild(row);
        });
        const card = document.querySelector('.card .card-header')?.parentElement;
        if (card) {
          const oldRows = card.querySelectorAll(':scope > .row');
          oldRows.forEach(x => x.remove());
          const footer = card.querySelector('.card-footer');
          if (footer) footer.before(box);
        }
        return;
      }

      data = data.slice(0, latestMode ? 20 : data.length);
      if (!data.length) return;

      const wrap = document.createElement("div");
      wrap.className = "sheet-live-items";
      if (latestMode) {
        const heading = document.createElement('div');
        heading.className = 'sheet-latest-title';
        heading.textContent = 'Latest updates from Google Sheets';
        wrap.appendChild(heading);
      }

      data.forEach(r => {
        const card = document.createElement("div");
        card.style.cssText = "background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0;";
        const typeText = String(r.Type || "").trim();
        const startText = String(r["Application Start"] || r.Date || "").trim();
        const endText = String(r["Application End"] || r["Last Date"] || "").trim();
        const official = String(r["Official Link"] || "").trim();
        const apply = String(r["Apply Link"] || "").trim();
        const statusText = String(r.Status || "").trim();
        const statusKey = statusText.toLowerCase();
        const statusClass = /closed/.test(statusKey) ? "status-closed" : /declared|live/.test(statusKey) ? "status-declared" : /admit/.test(statusKey) ? "status-admit" : /upcoming/.test(statusKey) ? "status-upcoming" : /open|available|current/.test(statusKey) ? "status-open" : "status-default";
        const fresh = r.IsNew === true ? '<span class="sheet-new-badge">NEW</span>' : '';
        card.innerHTML = `<div style="font-weight:800;margin-bottom:8px;line-height:1.4;">${esc(r.Title)}${fresh}</div>` +
          (typeText ? `<div><b>Type:</b> ${esc(typeText)}</div>` : '') +
          (startText ? `<div><b>Application Start:</b> ${esc(startText)}</div>` : '') +
          (endText ? `<div><b>Application End:</b> ${esc(endText)}</div>` : '') +
          (statusText ? `<div style="margin-top:7px;"><b>Status:</b> <span class="${statusClass}">${esc(statusText)}</span></div>` : '') +
          `<div style="margin-top:10px;">` +
          (official ? `<a href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official Link ↗</a>` : '') +
          (apply ? ` ${official ? ' | ' : ''}<a href="${esc(apply)}" target="_blank" rel="noopener noreferrer">Apply Now ↗</a>` : '') + `</div>`;
        wrap.appendChild(card);
      });

      const main = document.querySelector("main");
      if (!main) return;
      const back = main.querySelector("a.back");
      if (back && back.parentElement) back.parentElement.before(wrap); else main.appendChild(wrap);
    })
    .catch(e => console.error("Udyoga Lakshya Sheets:", e));
})();
