#!/usr/bin/env python3
import json, os, re
from pathlib import Path
from urllib.parse import urlparse
from google import genai

INPUT_JSON=Path('notifications.json'); OUTPUT_JSON=Path('job-details.json')
MODEL=os.getenv('GEMINI_MODEL','gemini-3.5-flash-lite')
MISSING='Not mentioned in the official notification'
FIELDS=['organization','advertisement_number','post_names','total_vacancies','vacancy_breakdown','job_location','educational_qualification','other_eligibility','age_limit','age_relaxation','application_fee','application_start','application_end','exam_date','selection_process','exam_pattern','syllabus','documents_required','salary_pay_scale','important_instructions','official_notification_url','apply_url']
PROMPT=f'''You are the official-notification extraction engine for Udhyoga Lakshya. Read ONLY the supplied official source URL/document. Do not guess, infer, use memory, or use third-party sources. If information is absent, use exactly "{MISSING}".

Return ONLY valid JSON with exactly these keys: {', '.join(FIELDS)}.

IMPORTANT STRUCTURE RULES:
- Preserve official wording, numbers, dates, fees, post names and eligibility accurately.
- vacancy_breakdown MUST be an array of objects. Adapt to the notification's real structure (stream-wise, post-wise, district-wise, category-wise, etc.). Each row should have a descriptive "label" string and, when present, a "categories" object containing exact reservation labels and integer counts. Put row total in "total" when explicitly stated or safely calculable from the displayed category counts. Do NOT invent categories.
- For special/horizontal reservation, use a "special" object with exact official labels and integer counts when explicitly present.
- If there is no usable vacancy table, return {MISSING} for vacancy_breakdown.
- application_fee, selection_process, exam_pattern, syllabus, documents_required, important_instructions should be arrays when multiple distinct items exist.
- Keep one fact per item where practical; preserve important conditions.
- Do not turn absent information into generic advice.
'''

def key_for(row):
    raw=(row.get('title') or row.get('officialLink') or '').strip()
    return re.sub(r'[^a-z0-9]+','-',raw.lower()).strip('-')[:180]
def public_url(u):
    p=urlparse(u); return p.scheme in {'http','https'} and bool(p.netloc)
def clean(v):
    if isinstance(v,str): return v.strip()
    if isinstance(v,list): return [clean(x) for x in v]
    if isinstance(v,dict): return {str(k):clean(x) for k,x in v.items()}
    return v

def extract_one(client,row):
    url=(row.get('officialLink') or '').strip()
    if not public_url(url): return None
    r=client.models.generate_content(model=MODEL,contents=PROMPT+f'\nOfficial source URL: {url}\nNotification title: {row.get("title","")}\nState: {row.get("state","")}',config={'response_mime_type':'application/json','tools':[{'url_context':{}}]})
    data=json.loads(r.text.strip()); data={k:clean(data.get(k,MISSING)) for k in FIELDS}
    data['official_notification_url']=url
    if not data.get('apply_url') or data['apply_url']==MISSING: data['apply_url']=row.get('applyLink','') or MISSING
    return data

def main():
    api=os.getenv('GEMINI_API_KEY')
    if not api: raise SystemExit('GEMINI_API_KEY is required')
    if not INPUT_JSON.exists(): raise SystemExit('notifications.json not found')
    raw=json.loads(INPUT_JSON.read_text(encoding='utf-8'))
    rows=[{**r,'title':r.get('title') or r.get('Title',''),'officialLink':r.get('officialLink') or r.get('Official Link',''),'applyLink':r.get('applyLink') or r.get('Apply Link',''),'state':r.get('state') or r.get('State',''),'type':r.get('type') or r.get('Type',''),'status':r.get('status') or r.get('Status','')} for r in raw]
    existing=json.loads(OUTPUT_JSON.read_text(encoding='utf-8')) if OUTPUT_JSON.exists() else {}
    client=genai.Client(api_key=api); changed=0
    for row in rows:
        if not row['officialLink'] or not row['title']: continue
        key=key_for(row); prev=existing.get(key)
        if isinstance(prev,dict) and prev.get('official_notification_url')==row['officialLink']:
            print('AI details already current:',row['title']); continue
        try:
            d=extract_one(client,row)
            if d is None: continue
            d.update(title=row['title'],type=row['type'],state=row['state'],status=row['status'],source_url=row['officialLink'])
            existing[key]=d; changed+=1; print('AI extracted:',row['title'])
        except Exception as e: print('WARNING:',row['title'],':',e)
    OUTPUT_JSON.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Updated {changed} notification detail records.')
if __name__=='__main__': main()
