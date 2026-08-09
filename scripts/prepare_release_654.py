from pathlib import Path

# Production version labels
player = Path('app/GreekTubePlayer.tsx')
s = player.read_text()
s = s.replace('ver 6.5.4 DEV', 'ver 6.5.4', 1)
player.write_text(s)

layout = Path('app/layout.tsx')
s = layout.read_text()
s = s.replace('"app-version": "6.5.4 DEV"', '"app-version": "6.5.4"', 1)
s = s.replace('/favicon.svg?v=654dev', '/favicon.svg?v=654')
layout.write_text(s)

# Remove old one-time patch helpers that should not ship in production.
for name in [
    '.github/workflows/apply-ui-652.yml',
    '.github/workflows/apply-version-653.yml',
    'scripts/apply_ui_652.py',
    'scripts/apply_version_653.py',
]:
    p = Path(name)
    if p.exists():
        p.unlink()
