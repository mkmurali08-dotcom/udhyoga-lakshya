/* Udyoga Lakshya - Google Sheets live notifications */
(function () {
  const SHEET_CSV =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYjRHSHCqIPxnzmWR1hXBCJtVhlc2nCgJ0WgS9x5MUghWnVTY4LBYzt7RfB4DvPaNkZSrYB3P4swXm/pub?gid=0&single=true&output=csv&v=2";

  const script = document.currentScript;
  const state = (script && script.dataset.state) || "";

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
        } else {
          cell += c;
        }
      } else {
        if (c === '"') quoted = true;
        else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (c !== "\r") {
          cell += c;
        }
      }
    }

    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function normalize(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function createBox() {
    const box = document.createElement("section");
    box.className = "sheet-live-notifications";
    box.innerHTML = `
      <div class="sheet-live-inner">
        <h2>Latest Notifications</h2>
        <div class="sheet-live-status">Loading latest updates...</div>
        <div class="sheet-live-list"></div>
      </div>
    `;
    return box;
  }

  function addStyles() {
    if (document.getElementById("sheet-live-styles")) return;

    const style = document.createElement("style");
    style.id = "sheet-live-styles";
    style.textContent = `
      .sheet-live-notifications{
        margin:30px 0;
        width:100%;
      }
      .sheet-live-inner{
        background:#fff;
        border-radius:10px;
        padding:20px;
        box-sizing:border-box;
      }
      .sheet-live-inner h2{
        margin:0 0 15px;
      }
      .sheet-live-status{
        font-size:14px;
        margin-bottom:12px;
      }
      .sheet-live-card{
        border:1px solid #ddd;
        border-radius:8px;
        padding:14px;
        margin:10px 0;
        background:#fafafa;
      }
      .sheet-live-title{
        font-weight:700;
        margin-bottom:7px;
      }
      .sheet-live-meta{
        font-size:13px;
        margin:4px 0;
      }
      .sheet-live-links{
        margin-top:9px;
      }
      .sheet-live-links a{
        display:inline-block;
        margin-right:8px;
        margin-top:5px;
      }
    `;
    document.head.appendChild(style);
  }

  async function load() {
    addStyles();

    const box = createBox();

    const main = document.querySelector("main");
    const footer = document.querySelector("footer");

    if (main) {
      main.appendChild(box);
    } else if (footer) {
      footer.parentNode.insertBefore(box, footer);
    } else {
      document.body.appendChild(box);
    }

    const status = box.querySelector(".sheet-live-status");
    const list = box.querySelector(".sheet-live-list");

    try {
      const response = await fetch(SHEET_CSV, { cache: "no-store" });
      if (!response.ok) throw new Error("Sheet fetch failed");

      const text = await response.text();
      const rows = parseCSV(text);

      if (!rows.length) throw new Error("No Sheet data");

      const headers = rows[0].map(normalize);

      const col = (name) => headers.indexOf(normalize(name));

      const typeI = col("Type");
      const stateI = col("State");
      const categoryI = col("Category");
      const titleI = col("Title");
      const dateI = col("Date");
      const officialI = col("Official Link");
      const applyI = col("Apply Link");
      const statusI = col("Status");

      if (stateI < 0 || titleI < 0) {
        throw new Error("Required Sheet columns not found");
      }

      const wantedState = normalize(state);

      const data = rows.slice(1).filter(r => {
        const rowState = normalize(r[stateI]);
        const title = String(r[titleI] || "").trim();
        return rowState === wantedState && title;
      });

      list.innerHTML = "";

      if (!data.length) {
        status.textContent = "No latest notifications available.";
        return;
      }

      status.textContent = `${data.length} latest notification${data.length === 1 ? "" : "s"}`;

      data.forEach(r => {
        const card = document.createElement("div");
        card.className = "sheet-live-card";

        const type = typeI >= 0 ? r[typeI] : "";
        const category = categoryI >= 0 ? r[categoryI] : "";
        const date = dateI >= 0 ? r[dateI] : "";
        const official = officialI >= 0 ? r[officialI] : "";
        const apply = applyI >= 0 ? r[applyI] : "";
        const stat = statusI >= 0 ? r[statusI] : "";

        card.innerHTML = `
          <div class="sheet-live-title">${esc(r[titleI])}</div>
          ${type ? `<div class="sheet-live-meta"><b>Type:</b> ${esc(type)}</div>` : ""}
          ${category ? `<div class="sheet-live-meta"><b>Category:</b> ${esc(category)}</div>` : ""}
          ${date ? `<div class="sheet-live-meta"><b>Date:</b> ${esc(date)}</div>` : ""}
          ${stat ? `<div class="sheet-live-meta"><b>Status:</b> ${esc(stat)}</div>` : ""}
          <div class="sheet-live-links">
            ${official ? `<a href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official Website</a>` : ""}
            ${apply ? `<a href="${esc(apply)}" target="_blank" rel="noopener noreferrer">Apply Now</a>` : ""}
          </div>
        `;

        list.appendChild(card);
      });

    } catch (err) {
      console.error("Udyoga Lakshya Sheet:", err);
      status.textContent = "Latest notifications are temporarily unavailable.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
