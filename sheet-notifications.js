
  if (!document.getElementById('udyoga-sheet-status-styles')) {
    const style = document.createElement('style');
    style.id = 'udyoga-sheet-status-styles';
    style.textContent = `.sheet-live-items .status-closed,.sheet-live-items .status-declared,.sheet-live-items .status-admit,.sheet-live-items .status-upcoming,.sheet-live-items .status-open,.sheet-live-items .status-default{display:inline-block;padding:4px 8px;border-radius:999px;font-weight:800;font-size:11px}.sheet-live-items .status-closed{background:#e5e7eb;color:#374151}.sheet-live-items .status-declared{background:#dcfce7;color:#166534}.sheet-live-items .status-admit{background:#ede9fe;color:#6b21a8}.sheet-live-items .status-upcoming{background:#ffedd5;color:#9a3412}.sheet-live-items .status-open{background:#dbeafe;color:#1d4ed8}.sheet-live-items .status-default{background:#f3f4f6;color:#374151}`;
    document.head.appendChild(style);
  }

(function () {
  const SHEET_URL =
    "https://docs.google.com/spreadsheets/d/1HLCzR_CwkITB6DY_XCp0XqHTBf_lk5W--2-jdOK0/gviz/tq?tqx=responseHandler:udyogaLakshyaSheetCallback&gid=0";

  const script = document.currentScript;
  const wantedState = (script?.dataset.state || "").trim().toLowerCase();

  const oldBox = document.querySelector(".sheet-live-notifications");
  if (oldBox) oldBox.remove();

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function getValue(cell) {
    return cell && (cell.f ?? cell.v ?? "");
  }

  window.udyogaLakshyaSheetCallback = function (response) {
    try {
      if (!response || response.status !== "ok") return;

      const cols = response.table.cols || [];
      const rows = response.table.rows || [];

      const headers = cols.map(c => String(c.label || "").trim().toLowerCase());

      const idx = name => headers.indexOf(name.toLowerCase());

      const typeI = idx("Type");
      const stateI = idx("State");
      const titleI = idx("Title");
      const dateI = idx("Application Start") >= 0 ? idx("Application Start") : idx("Date");
      const lastDateI = idx("Application End") >= 0 ? idx("Application End") : idx("Last Date");
      const officialI = idx("Official Link");
      const applyI = idx("Apply Link");
      const statusI = idx("Status");

      if (stateI < 0 || titleI < 0) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const data = rows
        .map(r => (r.c || []).map(getValue))
        .filter(r => {
          const rowState = String(r[stateI] || "").trim().toLowerCase();
          return rowState === wantedState && String(r[titleI] || "").trim();
        })
        .map(r => {
          const copy = r.slice();
          if (statusI >= 0 && (lastDateI >= 0 || dateI >= 0)) {
            const rawDate = String(r[lastDateI >= 0 ? lastDateI : dateI] || "").trim();
            const match = rawDate.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
            if (match) {
              const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
              if (!Number.isNaN(d.getTime()) && d < today) copy[statusI] = "Closed";
            }
          }
          return copy;
        });

       if (!data.length) return;

      const wrap = document.createElement("div");
      wrap.className = "sheet-live-items";

      data.forEach(r => {
        const card = document.createElement("div");
        card.style.cssText =
          "background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0;";

        const official = officialI >= 0 ? String(r[officialI] || "").trim() : "";
        const apply = applyI >= 0 ? String(r[applyI] || "").trim() : "";
        const statusText = statusI >= 0 ? String(r[statusI] || "").trim() : "";
        const statusKey = statusText.toLowerCase();
        const statusClass =
          /closed/.test(statusKey) ? "status-closed" :
          /declared|live/.test(statusKey) ? "status-declared" :
          /admit/.test(statusKey) ? "status-admit" :
          /upcoming/.test(statusKey) ? "status-upcoming" :
          /open|available|current/.test(statusKey) ? "status-open" : "status-default";

        card.innerHTML =
          `<div style="font-weight:800;margin-bottom:8px;line-height:1.4;">${esc(r[titleI])}</div>` +
          (typeI >= 0 && r[typeI] ? `<div><b>Type:</b> ${esc(r[typeI])}</div>` : "") +
          (dateI >= 0 && r[dateI] ? `<div><b>Application Start:</b> ${esc(r[dateI])}</div>` : "") +
          (lastDateI >= 0 && r[lastDateI] ? `<div><b>Application End:</b> ${esc(r[lastDateI])}</div>` : "") +
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
    } catch (e) {
      console.error("Udyoga Lakshya Sheets:", e);
    }
  };

  const oldScript = document.getElementById("udyoga-sheet-gviz");
  if (oldScript) oldScript.remove();

  const s = document.createElement("script");
  s.id = "udyoga-sheet-gviz";
  s.src = SHEET_URL;
  s.onerror = () => console.error("Udyoga Lakshya: Google Sheet could not be loaded.");
  document.head.appendChild(s);
})();
