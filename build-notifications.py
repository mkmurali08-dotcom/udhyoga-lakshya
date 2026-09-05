import csv, io, json, re, urllib.request, html
from datetime import date, datetime, timezone

SHEET_ID = "1HLCzR_CwklTB6DY_XCp0XqHTBFf_lk5vWT--2-jdOK0"
GID = "2002700274"
PUBLISHED_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYjHRSHCqlPxnzmWR1hXBCJtVhlc2nCgJ0WgS9x5MUghWnVTY4LBYZt7RfB4DvPaNkZSrYB3P4swXm/pub?gid=2002700274&single=true&output=csv"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8-sig")


def parse_published_html(raw):
    # Google published sheets expose the visible sheet as an HTML table.
    rows = []
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", raw, flags=re.I | re.S):
        cells = re.findall(r"<(?:td|th)\b[^>]*>(.*?)</(?:td|th)>", tr, flags=re.I | re.S)
        if not cells:
            continue
        vals = []
        for cell in cells:
            cell = re.sub(r"<br\s*/?>", " ", cell, flags=re.I)
            cell = re.sub(r"<[^>]+>", "", cell)
            vals.append(re.sub(r"\s+", " ", html.unescape(cell)).strip())
        rows.append(vals)
    if len(rows) < 2:
        raise ValueError("Published Google Sheet HTML did not contain a readable table")
    header = rows[0]
    # Find the table that actually contains our expected columns.
    expected = {"Type", "State", "Title", "Application Start", "Application End", "Official Link", "Apply Link", "Status"}
    if not expected.issubset(set(header)):
        raise ValueError("Published sheet headers were not found")
    return [dict(zip(header, r + [""] * (len(header) - len(r)))) for r in rows[1:] if any(r)]


# Prefer the normal spreadsheet export endpoint. If Google blocks that endpoint,
# fall back to the published CSV, then the published HTML table.
urls = [
    ("spreadsheet export", f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"),
    ("published CSV", PUBLISHED_CSV),
]
rows = None
errors = []
for label, url in urls:
    try:
        raw = fetch(url)
        parsed = list(csv.DictReader(io.StringIO(raw)))
        if parsed and any(str(r.get("Title", "")).strip() for r in parsed):
            rows = parsed
            print(f"Source: {label}")
            break
        errors.append(f"{label}: empty CSV")
    except Exception as e:
        errors.append(f"{label}: {e}")

if rows is None:
    pubhtml = PUBLISHED_CSV.replace("/pub?gid=2002700274&single=true&output=csv", "/pubhtml?gid=2002700274&single=true")
    try:
        raw = fetch(pubhtml)
        rows = parse_published_html(raw)
        print("Source: published HTML")
    except Exception as e:
        errors.append(f"published HTML: {e}")
        raise RuntimeError("Could not read Google Sheet. " + " | ".join(errors))

today = date.today()

def parse_date(v):
    if not v:
        return None
    s = str(v).strip()
    for pat in (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})'):
        m = re.search(pat, s)
        if not m:
            continue
        try:
            if len(m.group(1)) == 4:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return None

old = {}
try:
    with open("notifications.json", "r", encoding="utf-8") as f:
        previous = json.load(f)
    for item in previous if isinstance(previous, list) else []:
        key = "|".join([
            str(item.get("State", "")).strip().lower(),
            str(item.get("Title", "")).strip().lower(),
            str(item.get("Official Link", "")).strip(),
            str(item.get("Apply Link", "")).strip(),
        ])
        old[key] = item
except (FileNotFoundError, json.JSONDecodeError):
    pass

now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
out = []
for raw_row in rows:
    r = {str(k).strip(): str(v or "").strip() for k, v in raw_row.items()}
    title = r.get("Title", "")
    state = r.get("State", "")
    if not title or not state:
        continue
    end = r.get("Application End") or r.get("Last Date") or ""
    d = parse_date(end)
    if d and d < today:
        r["Status"] = "Closed"
    else:
        r["Status"] = r.get("Status", "") or "Updated"
    key = "|".join([
        state.lower(), title.lower(), r.get("Official Link", ""), r.get("Apply Link", "")
    ])
    prior = old.get(key)
    if prior and prior.get("FirstSeen"):
        r["FirstSeen"] = prior["FirstSeen"]
        r["IsNew"] = bool(prior.get("IsNew", False))
    else:
        r["FirstSeen"] = now
        r["IsNew"] = True
    out.append(r)

with open("notifications.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"Built {len(out)} notifications")
