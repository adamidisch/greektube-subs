from pathlib import Path

# 1) Preserve resumable progress/checkpoints when a short slice releases and reacquires the lock.
p = Path('app/api/shared-cache.ts')
s = p.read_text()
old = """    ON CONFLICT(video_id) DO UPDATE SET
      status = 'processing', progress = 3, lock_token = EXCLUDED.lock_token,
      lock_expires_at = EXCLUDED.lock_expires_at, error = NULL,
      transcript_version = EXCLUDED.transcript_version, updated_at = EXCLUDED.updated_at
"""
new = """    ON CONFLICT(video_id) DO UPDATE SET
      status = 'processing',
      progress = CASE
        WHEN $7 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version OR video_transcripts.status = 'failed' THEN 3
        ELSE GREATEST(video_transcripts.progress, 3)
      END,
      processing_stage = CASE
        WHEN $7 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version OR video_transcripts.status = 'failed' THEN NULL
        ELSE video_transcripts.processing_stage
      END,
      processing_cursor = CASE
        WHEN $7 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version OR video_transcripts.status = 'failed' THEN 0
        ELSE video_transcripts.processing_cursor
      END,
      lock_token = EXCLUDED.lock_token,
      lock_expires_at = EXCLUDED.lock_expires_at, error = NULL,
      transcript_version = EXCLUDED.transcript_version, updated_at = EXCLUDED.updated_at
"""
if old not in s:
    raise SystemExit('shared-cache acquire lock target not found')
s = s.replace(old, new, 1)
p.write_text(s)

# 2) Never allow an in-flight UI session to visually move backwards.
p = Path('app/GreekTubePlayer.tsx')
s = p.read_text()
s = s.replace('setProgress(Math.max(3,Math.min(100,statusData.progress)));', 'setProgress(current=>Math.max(current,Math.max(3,Math.min(100,statusData.progress))));')
s = s.replace('setProgress(Math.max(3,Math.min(96,processing.progress)));', 'setProgress(current=>Math.max(current,Math.max(3,Math.min(96,processing.progress))));')

# 3) Apply the approved compact connected stepper redesign from Claude's uploaded patch.
old_stages = '''const PREPARATION_STAGES_EL=[
  {at:4,label:"Ανάκτηση στοιχείων βίντεο"},
  {at:12,label:"Ανάκτηση αγγλικού transcript"},
  {at:28,label:"Δόμηση και διόρθωση αγγλικού κειμένου"},
  {at:48,label:"Μετάφραση στα ελληνικά"},
  {at:84,label:"Συγχρονισμός με το αρχικό timing"},
  {at:92,label:"Έλεγχος πιστότητας και ακεραιότητας"},
  {at:96,label:"Ολοκλήρωση υποτίτλων"},
];'''
new_stages = '''const PREPARATION_STAGES_EL=[
  {at:4,label:"Ανάκτηση στοιχείων βίντεο",status:"Φόρτωση πληροφοριών βίντεο…"},
  {at:12,label:"Ανάκτηση αγγλικού transcript",status:"Λήψη αγγλικού transcript…"},
  {at:28,label:"Δόμηση και διόρθωση αγγλικού κειμένου",status:"Οργάνωση και καθαρισμός κειμένου…"},
  {at:48,label:"Μετάφραση στα ελληνικά",status:"Μετάφραση σε εξέλιξη…"},
  {at:84,label:"Συγχρονισμός με το αρχικό timing",status:"Συγχρονισμός με το timing…"},
  {at:92,label:"Έλεγχος πιστότητας και ακεραιότητας",status:"Έλεγχος ποιότητας μετάφρασης…"},
  {at:96,label:"Ολοκλήρωση υποτίτλων",status:"Οριστικοποίηση υποτίτλων…"},
];'''
if old_stages in s:
    s = s.replace(old_stages, new_stages, 1)
old_list = '<ol className="preparation-steps" aria-label="Στάδια προετοιμασίας υποτίτλων">{PREPARATION_STAGES_EL.map((stage,index)=>{const next=PREPARATION_STAGES_EL[index+1];const done=progress>=100||Boolean(next&&progress>=next.at);const active=!done&&progress>=stage.at;return <li key={stage.at} className={`${done?"done":""} ${active?"active":""}`}><i aria-hidden="true">{done?"✓":String(index+1).padStart(2,"0")}</i><span>{stage.label}</span></li>})}</ol>'
new_list = '<ol className="preparation-steps" aria-label="Στάδια προετοιμασίας υποτίτλων">{PREPARATION_STAGES_EL.map((stage,index)=>{const next=PREPARATION_STAGES_EL[index+1];const done=progress>=100||Boolean(next&&progress>=next.at);const active=!done&&progress>=stage.at;const stepPercent=active&&next?Math.round(Math.min(100,Math.max(0,((progress-stage.at)/(next.at-stage.at))*100))):null;return <li key={stage.at} className={`${done?"done":""} ${active?"active":""}`}><span className="step-dot" aria-hidden="true">{done?"✓":active?"":String(index+1).padStart(2,"0")}</span><span className="step-body"><span className="step-label">{stage.label}</span>{active&&<><span className="step-status">{stage.status}</span><span className="step-mini-track"><i style={{width:`${stepPercent??0}%`}}/></span></>}</span>{active&&stepPercent!==null&&<span className="step-percent">{stepPercent}%</span>}</li>})}</ol>'
if old_list in s:
    s = s.replace(old_list, new_list, 1)
p.write_text(s)

p = Path('app/content-areas-final.css')
s = p.read_text()
old_css = '''html body .app-shell.app-shell.app-shell .preparation-steps{display:grid!important;gap:6px!important;margin:12px 0 14px!important;padding:0!important;list-style:none!important}
html body .app-shell.app-shell.app-shell .preparation-steps li{display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;align-items:center!important;gap:9px!important;min-height:34px!important;padding:6px 8px!important;border:1px solid transparent!important;border-radius:10px!important;color:#737985!important;font-size:11.5px!important;line-height:1.25!important}
html body .app-shell.app-shell.app-shell .preparation-steps li i{width:24px!important;height:24px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:8px!important;background:rgba(255,255,255,.035)!important;color:#777e8b!important;font-size:9px!important;font-style:normal!important;font-weight:750!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active{border-color:rgba(143,127,240,.28)!important;background:rgba(143,127,240,.09)!important;color:#f0eefb!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active i{border-color:rgba(143,127,240,.42)!important;background:rgba(143,127,240,.18)!important;color:#c8c0ff!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done{color:#9aa1aa!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done i{border-color:rgba(105,177,129,.28)!important;background:rgba(105,177,129,.12)!important;color:#8fd0a5!important}'''
new_css = '''html body .app-shell.app-shell.app-shell .preparation-steps{display:flex!important;flex-direction:column!important;gap:0!important;margin:14px 0!important;padding:0!important;list-style:none!important}
html body .app-shell.app-shell.app-shell .preparation-steps li{position:relative!important;display:flex!important;align-items:flex-start!important;gap:11px!important;min-height:0!important;padding:7px 2px!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#6f7580!important;font-size:12px!important;line-height:1.3!important;transition:color .2s!important}
html body .app-shell.app-shell.app-shell .preparation-steps li:not(:last-child):before{content:""!important;position:absolute!important;left:9.5px!important;top:26px!important;bottom:-7px!important;width:1.5px!important;background:rgba(255,255,255,.08)!important;z-index:0!important;transition:background .3s!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done:not(:last-child):before{background:rgba(124,116,224,.4)!important}
html body .app-shell.app-shell.app-shell .step-dot{position:relative!important;z-index:1!important;flex:0 0 20px!important;width:20px!important;height:20px!important;margin-top:1px!important;display:grid!important;place-items:center!important;border-radius:50%!important;border:1px solid rgba(255,255,255,.1)!important;background:#1b1f26!important;color:#6f7580!important;font-size:8.5px!important;font-weight:750!important;font-style:normal!important;transition:background .25s,border-color .25s,box-shadow .25s,color .25s!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done .step-dot{border-color:rgba(124,116,224,.4)!important;background:rgba(124,116,224,.14)!important;color:#8fbf86!important;font-size:10px!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active .step-dot{border-color:#7c74e0!important;background:#7c74e0!important;color:#fff!important;box-shadow:0 0 0 4px rgba(124,116,224,.16)!important;animation:step-dot-glow 1.8s ease-in-out infinite!important}
html body .app-shell.app-shell.app-shell .step-body{flex:1 1 auto!important;min-width:0!important;display:flex!important;flex-direction:column!important;gap:3px!important;padding-top:1px!important}
html body .app-shell.app-shell.app-shell .step-label{font-size:12px!important;font-weight:560!important;line-height:1.3!important;color:inherit!important;transition:color .2s!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active .step-label{color:#f0edff!important;font-weight:650!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done .step-label{color:#83898f!important}
html body .app-shell.app-shell.app-shell .step-status{font-size:10.5px!important;font-weight:520!important;color:#a79ef0!important;line-height:1.2!important}
html body .app-shell.app-shell.app-shell .step-mini-track{display:block!important;width:100%!important;max-width:190px!important;height:3px!important;margin-top:2px!important;border-radius:99px!important;background:rgba(255,255,255,.08)!important;overflow:hidden!important}
html body .app-shell.app-shell.app-shell .step-mini-track i{display:block!important;height:100%!important;border-radius:inherit!important;background:linear-gradient(90deg,#7c74e0,#a99dff)!important;transition:width .3s ease!important}
html body .app-shell.app-shell.app-shell .step-percent{flex:0 0 auto!important;align-self:flex-start!important;margin:2px 0 0 8px!important;color:#a79ef0!important;font-size:10.5px!important;font-weight:700!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}
@keyframes step-dot-glow{0%,100%{box-shadow:0 0 0 4px rgba(124,116,224,.16)}50%{box-shadow:0 0 0 6px rgba(124,116,224,.26)}}'''
if old_css in s:
    s = s.replace(old_css, new_css, 1)
s = s.replace(' html body .app-shell.app-shell.app-shell .preparation-steps{gap:5px!important;margin-top:10px!important}', ' html body .app-shell.app-shell.app-shell .preparation-steps{margin:12px 0!important}\n html body .app-shell.app-shell.app-shell .preparation-steps li{padding:6px 2px!important}\n html body .app-shell.app-shell.app-shell .step-mini-track{max-width:none!important}', 1)
p.write_text(s)

# Release metadata
p = Path('package.json')
s = p.read_text().replace('"version": "7.1.8"', '"version": "7.1.9"')
p.write_text(s)
p = Path('app/GreekTubePlayer.tsx')
s = p.read_text().replace('ver 7.1.8', 'ver 7.1.9')
p.write_text(s)

print('v7.1.9 progress + stepper fix applied')
