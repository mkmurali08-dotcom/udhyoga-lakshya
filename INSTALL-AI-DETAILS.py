from pathlib import Path

TARGETS = [
    "index.html",
    "latest-notifications.html",
    "results.html",
    "admit-cards.html",
    "upcoming-exams.html",
    "govt-jobs.html",
    "central-government-jobs.html",
    "other-central-jobs.html",
    "telangana-govt-jobs.html",
    "andhra-pradesh-govt-jobs.html",
]
TAG = '<script src="notification-details-link.js"></script>'
for name in TARGETS:
    p = Path(name)
    if not p.exists():
        continue
    text = p.read_text(encoding='utf-8')
    if TAG in text:
        continue
    marker='</body>'
    if marker in text:
        p.write_text(text.replace(marker, TAG+'\n'+marker, 1), encoding='utf-8')
        print('updated', name)
