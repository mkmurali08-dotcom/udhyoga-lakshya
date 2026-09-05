import csv, io, json, re, urllib.request
from datetime import date

SHEET = "https://docs.google.com/spreadsheets/d/1HLCzR_CwkITB6DY_XCp0XqHTBf_lk5W--2-jdOK0/gviz/tq?tqx=out:csv&gid=0"
raw = urllib.request.urlopen(SHEET, timeout=30).read().decode("utf-8-sig")
rows = list(csv.DictReader(io.StringIO(raw)))
today = date.today()

def parse_date(v):
    if not v: return None
    s = str(v).strip()
    for pat in (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})'):
        m = re.search(pat, s)
        if not m: continue
        try:
            if len(m.group(1)) == 4:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None

out=[]
for r in rows:
    title=(r.get('Title') or '').strip()
    state=(r.get('State') or '').strip()
    if not title or not state: continue
    end=(r.get('Application End') or r.get('Last Date') or '').strip()
    status=(r.get('Status') or '').strip()
    d=parse_date(end)
    if d and d < today: status='Closed'
    r=dict(r); r['Status']=status or 'Updated'
    out.append(r)
with open('notifications.json','w',encoding='utf-8') as f:
    json.dump(out,f,ensure_ascii=False,indent=2)
print(f'Built {len(out)} notifications')
