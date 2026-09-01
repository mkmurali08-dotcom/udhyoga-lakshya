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
      const categoryI = idx("Category");
      const titleI = idx("Title");
      const dateI = idx("Date");
      const officialI = idx("Official Link");
      const applyI = idx("Apply Link");
      const statusI = idx("Status");

      if (stateI < 0 || titleI < 0) return;

      const data = rows
        .map(r => (r.c || []).map(getValue))
        .filter(r =>
          String(r[stateI] || "").trim().toLowerCase() === wantedState &&
          String(r[titleI] || "").trim()
        );

      if (!data.length) return;

      const wrap = document.createElement("div");
      wrap.className = "sheet-live-items";

      data.forEach(r => {
        const card = document.createElement("div");
        card.style.cssText =
          "background:#fff;border:1px solid #ddd;border-radius:8px;padding:14px;margin:12px 0;";

        const official = officialI >= 0 ? String(r[officialI] || "").trim() : "";
        const apply = applyI >= 0 ? String(r[applyI] || "").trim() : "";

        card.innerHTML =
          `<div style="font-weight:700;margin-bottom:6px;">${esc(r[titleI])}</div>` +
          (typeI >= 0 && r[typeI] ? `<div><b>Type:</b> ${esc(r[typeI])}</div>` : "") +
          (categoryI >= 0 && r[categoryI] ? `<div><b>Category:</b> ${esc(r[categoryI])}</div>` : "") +
          (dateI >= 0 && r[dateI] ? `<div><b>Date:</b> ${esc(r[dateI])}</div>` : "") +
          (statusI >= 0 && r[statusI] ? `<div><b>Status:</b> ${esc(r[statusI])}</div>` : "") +
          `<div style="margin-top:8px;">` +
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
