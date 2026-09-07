#!/usr/bin/env python3
'''Extract structured recruitment details from official notification pages/PDFs using Gemini.'''
import json, os, re, sys, time, tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import requests
from google import genai

SHEET_ID = "1HLCzR_CwklTB6DY_XCp0XqHTBFf_lk5vWT--2-jdOK0"
INPUT_JSON = Path("notifications.json")
OUTPUT_JSON = Path("job-details.json")
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
You are the official-notification extraction engine for Udyoga Lakshya, an Indian government jobs information website.

Read ONLY the supplied official recruitment notification PDF/document and the official source URL context supplied with it. Extract EVERY useful recruitment/exam detail explicitly present in the official notification.
Do not guess, infer, fill gaps from memory, or use third-party information.
If a field is genuinely absent from the official notification, return "Not mentioned in the official notification".
Preserve numbers, dates, fee amounts, post names, stream names, category-wise vacancies, zone/region details, age relaxations, qualification wording, exam pattern and salary wording accurately.
If the notification contains tables, carefully read all rows and columns before producing the answer.

Return ONLY valid JSON with exactly these keys:
organization, advertisement_number, post_names, total_vacancies, vacancy_breakdown, job_location,
educational_qualification, other_eligibility, age_limit, age_relaxation, application_fee,
application_start, application_end, exam_date, selection_process, exam_pattern, syllabus,
documents_required, salary_pay_scale, important_instructions, official_notification_url, apply_url.

Use arrays where multiple items are useful. Use concise strings for single values. For vacancy_breakdown, educational_qualification,
other_eligibility, age_relaxation, application_fee, selection_process, exam_pattern, syllabus, documents_required and important_instructions,
prefer arrays of precise items. Include all streams/posts/categories rather than summarising away details.
The website will display your output to applicants, so never manufacture facts.
'''

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; UdyogaLakshyaBot/1.0; +https://udyogalakshya.example)"
})


def key_for(row):
    raw = (row.get("title") or "").strip()
    if not raw:
        raw = (row.get("officialLink") or "").strip()
    return re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")[:180]


def public_url(url):
    try:
        p = urlparse(url)
        return p.scheme in {"http", "https"} and bool(p.netloc)
    except Exception:
        return False


def clean_value(v):
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return [clean_value(x) for x in v]
    if isinstance(v, dict):
        return {str(k): clean_value(x) for k, x in v.items()}
    return v


def find_pdf_urls(page_url, html):
    found = []
    # href='...' / href="..." and plain absolute PDF URLs
    for href in re.findall(r'''href\s*=\s*["']([^"']+)["']''', html, flags=re.I):
        full = urljoin(page_url, href)
        decoded = unquote(full).lower()
        if ".pdf" in decoded or "pdf" in decoded and any(x in decoded for x in ("document", "download", "file")):
            if public_url(full) and full not in found:
                found.append(full)
    for full in re.findall(r'''https?://[^\s"'<>]+\.pdf(?:\?[^\s"'<>]+)?''', html, flags=re.I):
        full = full.replace("&amp;", "&")
        if full not in found:
            found.append(full)
    return found


def discover_official_pdf(page_url):
    try:
        r = SESSION.get(page_url, timeout=30, allow_redirects=True)
        r.raise_for_status()
        pdfs = find_pdf_urls(r.url, r.text)
        if pdfs:
            return pdfs[0]
    except Exception as exc:
        print(f"PDF discovery warning: {page_url}: {exc}")
    return None


def download_pdf(pdf_url):
    r = SESSION.get(pdf_url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    content = r.content
    ctype = (r.headers.get("content-type") or "").lower()
    if not content.startswith(b"%PDF") and "pdf" not in ctype:
        raise ValueError("Official PDF link did not return a PDF document")
    suffix = ".pdf"
    fd, path = tempfile.mkstemp(prefix="udyoga-lakshya-", suffix=suffix)
    os.close(fd)
    Path(path).write_bytes(content)
    return path


def is_placeholder(v):
    if isinstance(v, str):
        return not v.strip() or v.strip().lower() == "not mentioned in the official notification"
    if isinstance(v, list):
        return len(v) == 0 or all(is_placeholder(x) for x in v)
    return False


def needs_refresh(previous, source_url):
    if not isinstance(previous, dict):
        return True
    if previous.get("official_notification_url") != source_url:
        return True
    # Re-process records produced by an earlier run that failed to read the actual PDF.
    important = ["organization", "advertisement_number", "post_names", "total_vacancies",
                 "educational_qualification", "age_limit", "application_start", "application_end",
                 "selection_process", "exam_pattern", "salary_pay_scale"]
    return any(is_placeholder(previous.get(k)) for k in important)


def extract_one(client, row):
    url = (row.get("officialLink") or "").strip()
    if not public_url(url):
        return None

    pdf_url = discover_official_pdf(url)
    pdf_path = None
    uploaded = None
    try:
        source_note = f"Official source page: {url}"
        contents = None
        if pdf_url:
            pdf_path = download_pdf(pdf_url)
            uploaded = client.files.upload(file=pdf_path)
            source_note += f"\nOfficial notification PDF: {pdf_url}"
            contents = [uploaded, PROMPT + f"\n{source_note}\nNotification title: {row.get('title','')}\nState: {row.get('state','')}\n"]
        else:
            # Fallback for official pages that do not expose a PDF link.
            contents = PROMPT + f"\n{source_note}\nNotification title: {row.get('title','')}\nState: {row.get('state','')}\n"

        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config={
                "response_mime_type": "application/json",
            },
        )
        text = (getattr(response, "text", None) or "").strip()
        if not text:
            raise ValueError("Gemini returned an empty response")
        data = json.loads(text)
        data = {k: clean_value(data.get(k, "Not mentioned in the official notification")) for k in FIELDS}
        data["official_notification_url"] = url
        if pdf_url:
            data["notification_pdf_url"] = pdf_url
        if not data.get("apply_url") or data.get("apply_url") == "Not mentioned in the official notification":
            data["apply_url"] = row.get("applyLink", "") or "Not mentioned in the official notification"
        return data
    finally:
        if pdf_path:
            try:
                Path(pdf_path).unlink(missing_ok=True)
            except Exception:
                pass


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
    for index, row in enumerate(rows):
        if not row.get("officialLink") or not row.get("title"):
            continue
        key = key_for(row)
        previous = existing.get(key) if isinstance(existing, dict) else None
        if not needs_refresh(previous, row.get("officialLink")):
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
        # Stay comfortably below the 15 RPM free-tier limit.
        if index < len(rows) - 1:
            time.sleep(4.5)
    OUTPUT_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {changed} notification detail records.")


if __name__ == "__main__":
    main()
