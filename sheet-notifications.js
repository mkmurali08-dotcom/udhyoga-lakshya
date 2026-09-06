if (!document.getElementById('udyoga-sheet-status-styles')) {
  const style = document.createElement('style');
  style.id = 'udyoga-sheet-status-styles';
  style.textContent = `.sheet-live-items{margin-top:18px}.sheet-live-items .status-closed,.sheet-live-items .status-declared,.sheet-live-items .status-admit,.sheet-live-items .status-upcoming,.sheet-live-items .status-open,.sheet-live-items .status-default{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:800;font-size:11px}.sheet-live-items .status-closed{background:#e5e7eb;color:#374151}.sheet-live-items .status-declared{background:#dcfce7;color:#166534}.sheet-live-items .status-admit{background:#ede9fe;color:#6b21a8}.sheet-live-items .status-upcoming{background:#ffedd5;color:#9a3412}.sheet-live-items .status-open{background:#dbeafe;color:#1d4ed8}.sheet-live-items .status-default{background:#f3f4f6;color:#374151}.sheet-new-badge{display:inline-block;background:#e60000;color:#fff;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;margin-left:7px;vertical-align:middle}.sheet-latest-title{font-size:20px;font-weight:900;margin:0 0 12px}.sheet-latest-sub{font-size:11px;color:#666;margin:-4px 0 14px}.sheet-live-items .sheet-card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0}`;
  document.head.appendChild(style);
}

(function () {
  const DATA_URL = "notifications.json";
  const script = document.currentScript;
  const wantedState = (script?.dataset.state || "").trim().toLowerCase();
  const latestMode = script?.dataset.latest === "true";
  const typeMode = (script?.dataset.type || "").trim().toLowerCase();
  const DAYS = 7;

  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function seenTime(r) { const t = Date.parse(r.FirstSeen || ""); return Number.isFinite(t) ? t : 0; }
  function isFresh(r) { return r.IsNew === true || r.IsNew === "true"; }

  fetch(DATA_URL + "?v=" + Date.now(), { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(`notifications.json HTTP ${r.status}`); return r.json(); })
    .then(rows => {
      let data = (Array.isArray(rows) ? rows : []).filter(r => String(r.Title || "").trim());

      if (latestMode) {
        data = data.filter(isFresh);
      } else {
        if (wantedState) data = data.filter(r => String(r.State || "").trim().toLowerCase() === wantedState);
        if (typeMode) data = data.filter(r => String(r.Type || "").trim().toLowerCase() === typeMode);
      }

      data.sort((a,b) => seenTime(b) - seenTime(a));
      if (latestMode) data = data.slice(0, 20);
      if (!data.length) return;

      const wrap = document.createElement("section");
      wrap.className = "sheet-live-items";
      const heading = document.createElement("h2");
      heading.className = "sheet-latest-title";
      heading.textContent = latestMode ? "Latest Notifications" : (typeMode === "result" ? "Latest Results" : typeMode === "admit card" ? "Latest Admit Cards" : "Latest Updates");
      wrap.appendChild(heading);
      const sub = document.createElement("div");
      sub.className = "sheet-latest-sub";
      sub.textContent = latestMode ? "New updates added in the last 7 days" : "Updated automatically from Google Sheets";
      wrap.appendChild(sub);

      data.forEach(r => {
        const card = document.createElement("div");
        card.className = "sheet-card";
        const typeText = String(r.Type || "").trim();
        const startText = String(r["Application Start"] || r.Date || "").trim();
        const endText = String(r["Application End"] || r["Last Date"] || "").trim();
        const official = String(r["Official Link"] || "").trim();
        const apply = String(r["Apply Link"] || "").trim();
        const statusText = String(r.Status || "").trim();
        const statusKey = statusText.toLowerCase();
        const statusClass = /closed/.test(statusKey) ? "status-closed" : /declared|live/.test(statusKey) ? "status-declared" : /admit/.test(statusKey) ? "status-admit" : /upcoming/.test(statusKey) ? "status-upcoming" : /open|available|current/.test(statusKey) ? "status-open" : "status-default";
        const fresh = isFresh(r) ? '<span class="sheet-new-badge">NEW</span>' : '';
        card.innerHTML =
          `<div style="font-weight:800;margin-bottom:8px;line-height:1.4;">${esc(r.Title)}${fresh}</div>` +
          (typeText ? `<div><b>Type:</b> ${esc(typeText)}</div>` : "") +
          (startText ? `<div><b>Application Start:</b> ${esc(startText)}</div>` : "") +
          (endText ? `<div><b>Application End:</b> ${esc(endText)}</div>` : "") +
          (statusText ? `<div style="margin-top:7px;"><b>Status:</b> <span class="${statusClass}">${esc(statusText)}</span></div>` : "") +
          `<div style="margin-top:10px;">` +
          (official ? `<a href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official Link ↗</a>` : "") +
          (apply ? ` ${official ? " | " : ""}<a href="${esc(apply)}" target="_blank" rel="noopener noreferrer">Apply Now ↗</a>` : "") +
          `</div>`;
        wrap.appendChild(card);
      });

      const main = document.querySelector("main");
      if (!main) return;
      const existing = main.querySelector(".sheet-live-items");
      if (existing) existing.remove();
      const anchor = main.querySelector(".list, .grid, .back");
      if (anchor) anchor.before(wrap); else main.appendChild(wrap);
    })
    .catch(e => console.error("Udyoga Lakshya Sheets:", e));
})();
