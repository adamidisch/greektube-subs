from pathlib import Path

path = Path("app/content-areas-final.css")
text = path.read_text()
old = 'font-family:inherit!important;font-size:clamp(24px,3vw,34px)!important;'
new = 'font-family:inherit!important;font-size:24px!important;'
if old not in text:
    raise SystemExit("player title desktop size rule not found")
text = text.replace(old, new, 1)
path.write_text(text)
