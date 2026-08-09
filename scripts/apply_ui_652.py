from pathlib import Path

player = Path('app/GreekTubePlayer.tsx')
text = player.read_text(encoding='utf-8')
old = '''                <div className="controls-position-row">\n                  <span className="position-time"><b>{clock(playhead)}</b> / {clock(seekDuration)}</span>\n                  <span className="speed-chip">{state.settings.speed.toFixed(2).replace(/0$/," ")}×</span>\n                </div>'''
# Current source has no space in the replace() replacement; keep an exact fallback.
old_exact = '''                <div className="controls-position-row">\n                  <span className="position-time"><b>{clock(playhead)}</b> / {clock(seekDuration)}</span>\n                  <span className="speed-chip">{state.settings.speed.toFixed(2).replace(/0$/," ")}×</span>\n                </div>'''
old_actual = '''                <div className="controls-position-row">\n                  <span className="position-time"><b>{clock(playhead)}</b> / {clock(seekDuration)}</span>\n                  <span className="speed-chip">{state.settings.speed.toFixed(2).replace(/0$/," ")}×</span>\n                </div>'''
# Handle the exact source as a simple slice to avoid touching any other control markup.
start = text.find('                <div className="controls-position-row">')
if start == -1:
    raise SystemExit('controls-position-row not found')
end_marker = '                </div>\n                <div className="controls-top-row">'
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit('controls-position-row end not found')
text = text[:start] + '                <div className="controls-top-row">' + text[end + len(end_marker):]
text = text.replace('ver 6.5.1 DEV', 'ver 6.5.2 DEV')
player.write_text(text, encoding='utf-8')

layout = Path('app/layout.tsx')
text = layout.read_text(encoding='utf-8')
text = text.replace('6.5.1 DEV', '6.5.2 DEV').replace('651dev', '652dev')
layout.write_text(text, encoding='utf-8')

css = Path('app/ui-651.css')
text = css.read_text(encoding='utf-8')
patch = '''\n\n/* 6.5.2 DEV — requested micro-adjustment only: remove time/speed and center existing mobile button rows. */\n.controls-position-row{display:none!important}\n@media(max-width:620px){\n  html body .viewer .controls-top-row,\n  html body .viewer .player-secondary-actions{margin-left:auto!important;margin-right:auto!important;justify-content:center!important}\n}\n'''
if '6.5.2 DEV — requested micro-adjustment only' not in text:
    text += patch
css.write_text(text, encoding='utf-8')
