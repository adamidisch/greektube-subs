from pathlib import Path
p=Path('app/GreekTubePlayer.tsx')
s=p.read_text()
old='ver 6.5.2 DEV'
new='ver 6.5.3 DEV'
if old not in s:
    raise SystemExit('expected version marker not found')
p.write_text(s.replace(old,new,1))
