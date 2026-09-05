
  if (!document.getElementById('udyoga-sheet-status-styles')) {
    const style = document.createElement('style');
    style.id = 'udyoga-sheet-status-styles';
    style.textContent = `.sheet-live-items .status-closed,.sheet-live-items .status-declared,.sheet-live-items .status-admit,.sheet-live-items .status-upcoming,.sheet-live-items .status-open,.sheet-live-items .status-default{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:800;font-size:11px}.sheet-live-items .status-closed{background:#e5e7eb;color:#374151}.sheet-live-items .status-declared{background:#dcfce7;color:#166534}.sheet-live-items .status-admit{background:#ede9fe;color:#6b21a8}.sheet-live-items .status-upcoming{background:#ffedd5;color:#9a3412}.sheet-live-items .status-open{background:#dbeafe;color:#1d4ed8}.sheet-live-items .status-default{background:#f3f4f6;color:#374151}`;
    document.head.appendChild(style);
  }

(function () {
  const DATA_URL = "notifications.json";

  const script = document.currentScript;
  const wantedState = (script?.dataset.state || "").trim().toLowerCase();
  const latestMode = script?.dataset.latest === "true";

  const oldBox = document.querySelector(".sheet-live-notifications");
  if (oldBox) oldBox.remove();

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
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

  fetch(DATA_URL, { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error(`notifications.json HTTP ${r.status}`);
      return r.json();
    })
    .then(rows => {
      let data = (Array.isArray(rows) ? rows : [])
        .filter(r => {
          if (latestMode) return String(r.Title || "").trim();
          const rowState = String(r.State || "").trim().toLowerCase();
          return rowState === wantedState && String(r.Title || "").trim();
        })
        .map(r => {
          const copy = { ...r };
          const d = parseDate(copy["Application End"] || copy["Last Date"]);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (d && !Number.isNaN(d.getTime()) && d < today) copy.Status = "Closed";
          return copy;
        });

      if (latestMode) data = data.slice(-8).reverse();

      if (!data.length) return;

      const wrap = document.createElement("div");
      wrap.className = "sheet-live-items";
      if (latestMode) {
        const heading = document.createElement("h2");
        heading.textContent = "New Notifications";
        heading.style.cssText = "margin:24px 0 12px;font-size:20px;";
        wrap.appendChild(heading);
      }

      data.forEach(r => {
        const card = document.createElement("div");
        card.style.cssText =
          "background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0;";

        const typeText = String(r.Type || "").trim();
        const startText = String(r["Application Start"] || r.Date || "").trim();
        const endText = String(r["Application End"] || r["Last Date"] || "").trim();
        const official = String(r["Official Link"] || "").trim();
        const apply = String(r["Apply Link"] || "").trim();
        const statusText = String(r.Status || "").trim();
        const statusKey = statusText.toLowerCase();
        const statusClass =
          /closed/.test(statusKey) ? "status-closed" :
          /declared|live/.test(statusKey) ? "status-declared" :
          /admit/.test(statusKey) ? "status-admit" :
          /upcoming/.test(statusKey) ? "status-upcoming" :
          /open|available|current/.test(statusKey) ? "status-open" : "status-default";

        card.innerHTML =
          `<div style="font-weight:800;margin-bottom:8px;line-height:1.4;">${latestMode ? `<span style="display:inline-block;background:#16a34a;color:#fff;border-radius:999px;padding:3px 8px;font-size:10px;margin-right:7px;vertical-align:2px;">NEW</span>` : ""}${esc(r.Title)}</div>` +
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

      const back = main.querySelector("a.back");
      if (back && back.parentElement) {
        back.parentElement.before(wrap);
      } else {
        main.appendChild(wrap);
      }
    })
    .catch(e => console.error("Udyoga Lakshya Sheets:", e));
})();
