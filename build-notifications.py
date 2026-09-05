import csv, io, json, re, urllib.request
from datetime import date, datetime, timezone

SHEET = "https://docs.google.com/spreadsheets/d/1HLCzR_CwklTB6DY_XCp0XqHTBFf_lk5vWT--2-jdOK0/gviz/tq?tqx=out:csv&sheet=final"

raw = urllib.request.urlopen(SHEET, timeout=30).read().decode("utf-8-sig")
rows = list(csv.DictReader(io.StringIO(raw)))
today = date.today()

def parse_date(v):
    if not v:
        return None
    s = str(v).strip()
    for pat in (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})',
                r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})'):
        m = re.search(pat, s)
        if not m:
            continue
        try:
            if len(m.group(1)) == 4:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None

# Keep the previous generated file so we can tell genuinely new Sheet rows apart.
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
        if key:
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
    status = r.get("Status", "")
    d = parse_date(end)
    if d and d < today:
        status = "Closed"
    r["Status"] = status or "Updated"

    key = "|".join([
        state.lower(),
        title.lower(),
        r.get("Official Link", ""),
        r.get("Apply Link", ""),
    ])

    prior = old.get(key)
    if prior and prior.get("FirstSeen"):
        r["FirstSeen"] = prior["FirstSeen"]
        r["IsNew"] = bool(prior.get("IsNew", False))
    else:
        # Existing rows in the first run are baseline; genuinely added rows get now.
        r["FirstSeen"] = now
        r["IsNew"] = True

    out.append(r)

# Keep the current Sheet order for ordinary pages; Latest Notifications uses FirstSeen.
with open("notifications.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"Built {len(out)} notifications")
