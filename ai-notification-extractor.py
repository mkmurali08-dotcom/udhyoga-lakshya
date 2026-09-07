#!/usr/bin/env python3
'''Extract structured recruitment details from a public official notification URL using Gemini.'''
import json, os, re, sys
from pathlib import Path
from urllib.parse import urlparse
import requests
from google import genai

SHEET_ID = "1HLCzR_CwklTB6DY_XCp0XqHTBFf_lk5vWT--2-jdOK0"
INPUT_JSON = Path("notifications.json")
OUTPUT_JSON = Path("job-details.json")
# Keep the model fixed here so a GitHub Actions GEMINI_MODEL override cannot switch it back to Gemini 3.7.
MODEL = "gemini-3.5-flash-lite"

FIELDS = [
    "organization", "advertisement_number", "post_names", "total_vacancies",
    "vacancy_breakdown", "job_location", "educational_qualification",
    "other_eligibility", "age_limit", "age_relaxation", "application_fee",
    "application_start", "application_end", "exam_date", "selection_process",
    "exam_pattern", "syllabus", "documents_required", "salary_pay_scale",
    "important_instructions", "official_notification_url", "apply_url"
]

PROMPT = r'''
You are the official-notification extraction engine for Udhyoga Lakshya, an Indian government jobs information website.

Read ONLY the supplied official source URL/document. Extract every useful recruitment/exam detail that is explicitly present.
Do not guess, infer, fill gaps from memory, or use third-party information.
If a field is not present in the source, return "Not mentioned in the official notification".
Preserve numbers, dates, fee amounts, post names, category-wise vacancies, age relaxations, and qualification wording accurately.

Return ONLY valid JSON with exactly these keys:
organization, advertisement_number, post_names, total_vacancies, vacancy_breakdown, job_location,
educational_qualification, other_eligibility, age_limit, age_relaxation, application_fee,
application_start, application_end, exam_date, selection_process, exam_pattern, syllabus,
documents_required, salary_pay_scale, important_instructions, official_notification_url, apply_url.

Use arrays where multiple items are useful. Use concise strings for single values. For vacancy_breakdown, application_fee,
selection_process, exam_pattern, syllabus, documents_required and important_instructions, prefer arrays of precise items.
The website will display your output to applicants, so never manufacture facts.
'''

def key_for(row):
    raw = (row.get("title") or "").strip()
    if not raw:
        raw = (row.get("officialLink") or "").strip()
    return re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")[:180]

def public_url(url):
    p = urlparse(url)
    return p.scheme in {"http", "https"} and bool(p.netloc)

def clean_value(v):
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return [clean_value(x) for x in v]
    if isinstance(v, dict):
        return {str(k): clean_value(x) for k, x in v.items()}
    return v

def extract_one(client, row):
    url = (row.get("officialLink") or "").strip()
    if not public_url(url):
        return None
    prompt = PROMPT + f"\nOfficial source URL: {url}\nNotification title: {row.get('title','')}\nState: {row.get('state','')}\n"
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "tools": [{"url_context": {}}],
        },
    )
    text = response.text.strip()
    data = json.loads(text)
    data = {k: clean_value(data.get(k, "Not mentioned in the official notification")) for k in FIELDS}
    data["official_notification_url"] = url
    if not data.get("apply_url") or data.get("apply_url") == "Not mentioned in the official notification":
        data["apply_url"] = row.get("applyLink", "") or "Not mentioned in the official notification"
    return data

def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is required")
    if not INPUT_JSON.exists():
        raise SystemExit("notifications.json not found")
    rows = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
    rows = [
        {
            **row,
            "title": row.get("title") or row.get("Title", ""),
            "officialLink": row.get("officialLink") or row.get("Official Link", ""),
            "applyLink": row.get("applyLink") or row.get("Apply Link", ""),
            "state": row.get("state") or row.get("State", ""),
            "type": row.get("type") or row.get("Type", ""),
            "status": row.get("status") or row.get("Status", ""),
        }
        for row in rows
    ]
    existing = json.loads(OUTPUT_JSON.read_text(encoding="utf-8")) if OUTPUT_JSON.exists() else {}
    client = genai.Client(api_key=api_key)
    changed = 0
    for row in rows:
        if not row.get("officialLink") or not row.get("title"):
            continue
        key = key_for(row)
        previous = existing.get(key) if isinstance(existing, dict) else None
        if isinstance(previous, dict) and previous.get("official_notification_url") == row.get("officialLink"):
            print(f"AI details already current: {row.get('title')}")
            continue
        try:
            result = extract_one(client, row)
            if result is None:
                continue
            result["title"] = row.get("title", "")
            result["type"] = row.get("type", "")
            result["state"] = row.get("state", "")
            result["status"] = row.get("status", "")
            result["source_url"] = row.get("officialLink", "")
            existing[key] = result
            changed += 1
            print(f"AI extracted: {row.get('title')}")
        except Exception as exc:
            print(f"WARNING: {row.get('title')}: {exc}")
    OUTPUT_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {changed} notification detail records.")

if __name__ == "__main__":
    main()
