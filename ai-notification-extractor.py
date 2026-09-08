#!/usr/bin/env python3
import hashlib, json, os, re, tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from google import genai

INPUT_JSON = Path('notifications.json')
OUTPUT_JSON = Path('job-details.json')
MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
MISSING = 'Not mentioned in the official notification'
EXTRACTOR_VERSION = '2026-09-09-universal-final-v1'

FIELDS = [
    'organization','advertisement_number','post_names','total_vacancies',
    'vacancy_breakdown','job_location','educational_qualification',
    'other_eligibility','age_limit','age_relaxation','application_fee',
    'application_start','application_end','exam_date','selection_process',
    'exam_pattern','syllabus','documents_required','salary_pay_scale',
    'important_instructions','official_notification_url','apply_url'
]

PROMPT = f'''You are Udhyoga Lakshya's official recruitment-notification extraction engine.

Use ONLY the supplied official notification/source document. The official source is the ONLY authority.
Do not use memory, prior knowledge, search results, third-party websites, or assumptions.
Read the ENTIRE supplied document/page before answering, including tables and footnotes.
If a fact is not present, use exactly "{MISSING}".

Return ONLY valid JSON with exactly these keys:
{', '.join(FIELDS)}

ACCURACY RULES:
- Preserve official wording, numbers, dates, fees, post names, streams, categories and conditions.
- Never invent a vacancy, category, date, fee, qualification, age, salary or exam detail.
- vacancy_breakdown MUST adapt to the real official structure. It must be an array of objects.
  Each row should use: {{"label": "...", "categories": {{"SC": 0, ...}}, "special": {{...}}, "total": 0}}.
  Include only category labels/counts actually shown. Use any exact labels such as UR, GEN, OBC, EWS, SC, ST, PwBD, etc.; do not rename them incorrectly.
  For stream/post/district rows, put the exact row name in label. If the official table has no category columns, put the relevant counts in categories or direct fields as appropriate.
  Keep horizontal/special reservations in special with exact official labels when explicitly stated.
- total_vacancies must match the official overall total when explicitly given.
- Arrays are preferred for application_fee, selection_process, exam_pattern, syllabus, documents_required and important_instructions.
- Preserve multi-part conditions instead of reducing them to generic summaries.
- If a section does not exist in the official notification, return {MISSING}.
'''


def clean(v):
    if isinstance(v, str): return v.strip()
    if isinstance(v, list): return [clean(x) for x in v]
    if isinstance(v, dict): return {str(k): clean(x) for k, x in v.items()}
    return v


def public_url(u):
    try:
        p = urlparse(u)
        return p.scheme in ('http', 'https') and bool(p.netloc)
    except Exception:
        return False


def first(row, *names):
    for n in names:
        v = row.get(n)
        if v not in (None, ''):
            return str(v).strip()
    return ''


def key_for(row):
    raw = first(row, 'title', 'Title') or first(row, 'officialLink', 'Official Link')
    return re.sub(r'[^a-z0-9]+', '-', raw.lower()).strip('-')[:180]


def fingerprint(row):
    parts = [
        first(row,'title','Title'), first(row,'type','Type'), first(row,'state','State'),
        first(row,'officialLink','Official Link'), first(row,'applyLink','Apply Link'),
        first(row,'applicationStart','Application Start','application_start'),
        first(row,'applicationEnd','Application End','application_end'),
        first(row,'status','Status')
    ]
    return hashlib.sha256('|'.join(parts).encode()).hexdigest()


def fetch_source(url):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (Udhyoga-Lakshya official notification reader)'})
    with urlopen(req, timeout=45) as r:
        data = r.read()
        final_url = r.geturl()
        content_type = (r.headers.get('Content-Type') or '').lower()
    return final_url, content_type, data


def html_to_text(data, base_url):
    text = data.decode('utf-8', errors='ignore')
    # Remove non-content blocks first.
    text = re.sub(r'<(script|style|noscript|svg|template)[^>]*>.*?</\1>', ' ', text, flags=re.I|re.S)
    # Keep useful link destinations because some official pages put the PDF behind an anchor.
    links = []
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', text, flags=re.I|re.S):
        href = urljoin(base_url, m.group(1))
        label = re.sub(r'<[^>]+>', ' ', m.group(2))
        label = re.sub(r'\s+', ' ', label).strip()
        if public_url(href): links.append(f'Official link: {label} -> {href}')
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text, flags=re.I)
    text = re.sub(r'&amp;', '&', text, flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip()
    if links:
        text += '\n\n' + '\n'.join(dict.fromkeys(links))
    return text


def ai_call(client, source_url, title, state, content, uploaded_file=None):
    context = f'''\nOfficial source URL: {source_url}\nNotification title: {title}\nState: {state}\n\nSOURCE CONTENT START\n{content}\nSOURCE CONTENT END\n'''
    contents = [PROMPT + context]
    if uploaded_file is not None:
        contents = [PROMPT + f'\nOfficial source URL: {source_url}\nNotification title: {title}\nState: {state}\n', uploaded_file]
    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config={'response_mime_type': 'application/json'}
    )
    raw = response.text.strip()
    # Be tolerant of accidental markdown fences while still requiring JSON.
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.I)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw)


def extract_one(client, row):
    url = first(row, 'officialLink', 'Official Link')
    if not public_url(url): return None
    title = first(row, 'title', 'Title')
    state = first(row, 'state', 'State')

    final_url, content_type, raw = fetch_source(url)
    is_pdf = 'application/pdf' in content_type or raw[:5] == b'%PDF-'
    uploaded = None
    temp_path = None
    try:
        if is_pdf:
            fd, temp_path = tempfile.mkstemp(suffix='.pdf')
            os.close(fd)
            Path(temp_path).write_bytes(raw)
            uploaded = client.files.upload(file=temp_path)
            data = ai_call(client, final_url, title, state, '', uploaded)
        else:
            text = html_to_text(raw, final_url)
            if not text:
                raise RuntimeError('Official source returned no readable content')
            data = ai_call(client, final_url, title, state, text[:180000])
    finally:
        if uploaded is not None:
            try: client.files.delete(name=uploaded.name)
            except Exception: pass
        if temp_path:
            try: Path(temp_path).unlink(missing_ok=True)
            except Exception: pass

    out = {k: clean(data.get(k, MISSING)) for k in FIELDS}
    # Sheet controls portal metadata and user-facing links/dates.
    out['official_notification_url'] = url
    apply_url = first(row, 'applyLink', 'Apply Link')
    if apply_url: out['apply_url'] = apply_url
    start = first(row, 'applicationStart','Application Start','application_start')
    end = first(row, 'applicationEnd','Application End','application_end')
    if start: out['application_start'] = start
    if end: out['application_end'] = end
    return out


def main():
    api = os.getenv('GEMINI_API_KEY')
    if not api: raise SystemExit('GEMINI_API_KEY is required')
    if not INPUT_JSON.exists(): raise SystemExit('notifications.json not found')
    raw = json.loads(INPUT_JSON.read_text(encoding='utf-8'))
    rows = []
    for r in raw:
        rows.append({
            **r,
            'title': first(r,'title','Title'), 'officialLink': first(r,'officialLink','Official Link'),
            'applyLink': first(r,'applyLink','Apply Link'), 'applicationStart': first(r,'applicationStart','Application Start','application_start'),
            'applicationEnd': first(r,'applicationEnd','Application End','application_end'), 'state': first(r,'state','State'),
            'type': first(r,'type','Type'), 'status': first(r,'status','Status')
        })

    existing = json.loads(OUTPUT_JSON.read_text(encoding='utf-8')) if OUTPUT_JSON.exists() else {}
    client = genai.Client(api_key=api)
    changed = skipped = failed = 0

    for row in rows:
        if not row['title'] or not public_url(row['officialLink']):
            continue
        key, fp = key_for(row), fingerprint(row)
        prev = existing.get(key)
        if isinstance(prev, dict) and prev.get('_extractor_version') == EXTRACTOR_VERSION and prev.get('_sheet_fingerprint') == fp:
            skipped += 1
            continue
        try:
            data = extract_one(client, row)
            if data is None: continue
            data.update(title=row['title'], type=row['type'], state=row['state'], status=row['status'], source_url=row['officialLink'])
            data['_extractor_version'] = EXTRACTOR_VERSION
            data['_sheet_fingerprint'] = fp
            existing[key] = data
            changed += 1
            print('AI extracted:', row['title'])
        except Exception as e:
            failed += 1
            print('WARNING:', row['title'], ':', e)

    OUTPUT_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {changed} notification detail records; skipped {skipped}; failed {failed}.')

if __name__ == '__main__': main()
