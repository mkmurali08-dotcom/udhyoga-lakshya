#!/usr/bin/env python3
import hashlib, json, os, re, tempfile
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from google import genai

INPUT_JSON = Path('notifications.json')
OUTPUT_JSON = Path('job-details.json')
MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
MISSING = 'Not mentioned in the official notification'
EXTRACTOR_VERSION = '2026-09-12-universal-all-data-v2'

FIELDS = [
    'organization','advertisement_number','post_names','total_vacancies',
    'vacancy_breakdown','job_location','educational_qualification',
    'other_eligibility','age_limit','age_relaxation','application_fee',
    'application_start','application_end','exam_date','selection_process',
    'exam_pattern','syllabus','documents_required','salary_pay_scale',
    'important_instructions','how_to_apply','reservation_policy',
    'physical_standards','medical_standards','exam_centers',
    'probation_training','career_progression','other_official_details',
    'official_notification_url','apply_url','portal_category','priority_score','priority_reason'
]

PROMPT = f'''You are Udhyoga Lakshya's official recruitment-notification extraction engine.

Use ONLY the supplied official notification/source document. The official source is the ONLY authority.
Do not use memory, prior knowledge, search results, third-party websites, or assumptions.
Read the ENTIRE supplied document/page before answering, including every table, annexure, note, footnote, eligibility clause and instruction.
If a fact is not present, use exactly "{MISSING}".

Return ONLY valid JSON with exactly these keys:
{', '.join(FIELDS)}

ACCURACY RULES:
- Preserve official wording, numbers, dates, fee amounts, post names, streams, categories, conditions and URLs.
- Never invent a vacancy, category, date, fee, qualification, age, salary, syllabus item or exam detail.
- vacancy_breakdown MUST be an array of objects reflecting the real official tables. Keep exact row labels and reservation/category labels.
- Preserve all important sub-points instead of collapsing them into a generic sentence.
- Arrays are preferred for application_fee, selection_process, exam_pattern, syllabus, documents_required, important_instructions, physical_standards, medical_standards and other_official_details.
- age_relaxation must include every explicitly stated relaxation/category and condition.
- syllabus must include the complete syllabus/topics explicitly present in the official source, not a summary.
- how_to_apply must preserve the official application steps/instructions when present.
- reservation_policy must preserve category/reservation rules when present.
- other_official_details must capture useful official sections not covered by another field.
- portal_category MUST be one of: latest-notifications, upcoming-exams, results-admit-cards.
- Classification rule: a live/open recruitment/application window belongs to latest-notifications even if an exam is mentioned; a genuine future exam schedule with no live application window belongs to upcoming-exams; results/admit cards/answer keys/selections/call letters belong to results-admit-cards.
- priority_score is an integer 0-100 based only on the official source's importance/urgency for a government-job portal. Do not use popularity guesses.
- priority_reason must briefly explain the official-source reason for the score.
- If a section does not exist in the official notification, return {MISSING}.
'''

def clean(v):
    if isinstance(v, str): return v.strip()
    if isinstance(v, list): return [clean(x) for x in v]
    if isinstance(v, dict): return {str(k): clean(x) for k, x in v.items()}
    return v

def public_url(u):
    try:
        p = urlparse(u); return p.scheme in ('http','https') and bool(p.netloc)
    except Exception: return False

def first(row, *names):
    for n in names:
        v = row.get(n)
        if v not in (None, ''): return str(v).strip()
    return ''

def key_for(row):
    raw = first(row,'title','Title') or first(row,'officialLink','Official Link')
    return re.sub(r'[^a-z0-9]+','-',raw.lower()).strip('-')[:180]

def fingerprint(row):
    parts=[first(row,'title','Title'),first(row,'type','Type'),first(row,'state','State'),first(row,'officialLink','Official Link'),first(row,'applyLink','Apply Link'),first(row,'applicationStart','Application Start'),first(row,'applicationEnd','Application End'),first(row,'status','Status')]
    return hashlib.sha256('|'.join(parts).encode()).hexdigest()

def fetch_source(url):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (Udhyoga-Lakshya official notification reader)'})
    with urlopen(req,timeout=60) as r:
        data=r.read(); final_url=r.geturl(); content_type=(r.headers.get('Content-Type') or '').lower()
    return final_url,content_type,data

def html_to_text(data, base_url):
    text=data.decode('utf-8',errors='ignore')
    text=re.sub(r'<(script|style|noscript|svg|template)[^>]*>.*?</\1>',' ',text,flags=re.I|re.S)
    links=[]
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\']+)[^>]*>(.*?)</a>',text,flags=re.I|re.S):
        href=urljoin(base_url,m.group(1)); label=re.sub(r'<[^>]+>',' ',m.group(2)); label=re.sub(r'\s+',' ',label).strip()
        if public_url(href): links.append(f'Official link: {label} -> {href}')
    text=re.sub(r'<[^>]+>',' ',text); text=re.sub(r'&nbsp;',' ',text,flags=re.I); text=re.sub(r'&amp;','&',text,flags=re.I); text=re.sub(r'\s+',' ',text).strip()
    if links: text+='\n\n'+'\n'.join(dict.fromkeys(links))
    return text

def ai_call(client, source_url, title, state, content, uploaded_file=None):
    context=f'\nOfficial source URL: {source_url}\nNotification title: {title}\nState: {state}\n\nSOURCE CONTENT START\n{content}\nSOURCE CONTENT END\n'
    contents=[PROMPT+context]
    if uploaded_file is not None: contents=[PROMPT+f'\nOfficial source URL: {source_url}\nNotification title: {title}\nState: {state}\n',uploaded_file]
    response=client.models.generate_content(model=MODEL,contents=contents,config={'response_mime_type':'application/json'})
    raw=re.sub(r'^```(?:json)?\s*','',response.text.strip(),flags=re.I); raw=re.sub(r'\s*```$','',raw)
    return json.loads(raw)

def extract_one(client,row):
    url=first(row,'officialLink','Official Link')
    if not public_url(url): return None
    title=first(row,'title','Title'); state=first(row,'state','State')
    final_url,content_type,raw=fetch_source(url)
    is_pdf='application/pdf' in content_type or raw[:5]==b'%PDF-'
    uploaded=None; temp_path=None
    try:
        if is_pdf:
            fd,temp_path=tempfile.mkstemp(suffix='.pdf'); os.close(fd); Path(temp_path).write_bytes(raw)
            uploaded=client.files.upload(file=temp_path); data=ai_call(client,final_url,title,state,'',uploaded)
        else:
            text=html_to_text(raw,final_url)
            if not text: raise RuntimeError('Official source returned no readable content')
            data=ai_call(client,final_url,title,state,text[:250000])
    finally:
        if uploaded is not None:
            try: client.files.delete(name=uploaded.name)
            except Exception: pass
        if temp_path:
            try: Path(temp_path).unlink(missing_ok=True)
            except Exception: pass
    out={k:clean(data.get(k,MISSING)) for k in FIELDS}
    out['official_notification_url']=url
    apply_url=first(row,'applyLink','Apply Link')
    if apply_url: out['apply_url']=apply_url
    for target, names in [('application_start',('applicationStart','Application Start')),('application_end',('applicationEnd','Application End'))]:
        v=first(row,*names)
        if v: out[target]=v
    return out

def rule_category(row):
    typ=first(row,'type','Type').lower(); cat=first(row,'category','Category').lower(); title=first(row,'title','Title').lower(); status=first(row,'status','Status').lower()
    blob=' '.join((typ,cat,title,status))
    if re.search(r'\b(result|admit\s*card|answer\s*key|selection|allocation|call\s*letter|hall\s*ticket|e-admit|ecall|ranked\s*list)\b',blob):
        return 'results-admit-cards'
    if re.search(r'\b(open|live|active|apply|applications?\s+open|accepting\s+applications?)\b',status):
        return 'latest-notifications'
    if re.search(r'\b(upcoming|scheduled|tentative|calendar|to\s*be\s*held|forthcoming)\b',status):
        return 'upcoming-exams'
    if typ == 'exam' or re.search(r'\b(upcoming exam|exam calendar|scheduled exam)\b',blob):
        return 'upcoming-exams'
    if re.search(r'\b(job|recruitment|vacanc|application|engagement|hiring|notification)\b',blob):
        return 'latest-notifications'
    return 'latest-notifications'

def main():
    api=os.getenv('GEMINI_API_KEY')
    if not api: raise SystemExit('GEMINI_API_KEY is required')
    if not INPUT_JSON.exists(): raise SystemExit('notifications.json not found')
    rows=json.loads(INPUT_JSON.read_text(encoding='utf-8'))
    existing=json.loads(OUTPUT_JSON.read_text(encoding='utf-8')) if OUTPUT_JSON.exists() else {}
    client=genai.Client(api_key=api); changed=skipped=failed=0
    for row in rows:
        title=first(row,'title','Title'); url=first(row,'officialLink','Official Link')
        if not title or not public_url(url): continue
        key,fp=key_for(row),fingerprint(row); prev=existing.get(key)
        if isinstance(prev,dict) and prev.get('_extractor_version')==EXTRACTOR_VERSION and prev.get('_sheet_fingerprint')==fp:
            skipped+=1; continue
        try:
            data=extract_one(client,row)
            if data is None: continue
            
            ai_category=data.get('portal_category')
            if ai_category not in {'latest-notifications','upcoming-exams','results-admit-cards'}:
                ai_category=rule_category(row)
            data.update(title=title,type=first(row,'type','Type'),state=first(row,'state','State'),status=first(row,'status','Status'),category=first(row,'category','Category'),source_url=url,portal_category=ai_category)
            data['_extractor_version']=EXTRACTOR_VERSION; data['_sheet_fingerprint']=fp; existing[key]=data; changed+=1
            print('AI extracted:',title)
        except Exception as e:
            failed+=1; print('WARNING:',title,':',e)
    OUTPUT_JSON.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Updated {changed} notification detail records; skipped {skipped}; failed {failed}.')

if __name__=='__main__': main()
