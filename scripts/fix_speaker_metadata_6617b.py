from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing pattern: {label}")
    return text.replace(old, new, 1)

route_path = Path("app/api/metadata/route.ts")
route = route_path.read_text()

anchor = 'function speakerNameFromMetadata(title: string, description: string) {\n'
known = '''const KNOWN_SPEAKER_METADATA: Record<string, { name: string; role: string }> = {\n  BbGv7GTbRN8: { name: "Dr. Stasha Gominak", role: "Neurologist" },\n  D2RjneeG_xA: { name: "Dr. Sarah Myhill", role: "Physician" },\n  NqLpQhii_fU: { name: "Dr. Sarah Myhill", role: "Physician" },\n  KkBy__7d9Fs: { name: "Dr. Sarah Myhill", role: "Physician" },\n  "0_adZSC0sFI": { name: "Dr. Sarah Myhill", role: "Physician" },\n  ATKu1Cxs2Pc: { name: "Dr. Philip Ovadia", role: "Cardiothoracic Surgeon" },\n  "fX2z-BF8Jac": { name: "Dr. Natasha Campbell-McBride", role: "Physician" },\n};\n\n'''
route = replace_once(route, anchor, known + anchor, "known speaker metadata anchor")
route = route.replace('return `Dr ${doctor[1].replace(/[|:,\\-–—]+$/g, "").trim()}`;', 'return `Dr. ${doctor[1].replace(/[|:,\\-–—]+$/g, "").trim()}`;')
old = '''    const title = await greekTitle(originalTitle);\n    const speakerName = speakerNameFromMetadata(originalTitle, details.description);\n    const speakerRole = speakerRoleFromMetadata(details.description, speakerName);\n    const category = categoryFor(originalTitle, details.description, speakerName);\n'''
new = '''    const title = await greekTitle(originalTitle);\n    const knownSpeaker = KNOWN_SPEAKER_METADATA[id];\n    const speakerName = knownSpeaker?.name || speakerNameFromMetadata(originalTitle, details.description);\n    const speakerRole = knownSpeaker?.role || speakerRoleFromMetadata(details.description, speakerName);\n    const category = categoryFor(originalTitle, details.description, speakerName);\n'''
route = replace_once(route, old, new, "metadata speaker selection")
route_path.write_text(route)

player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()
player = player.replace('Dr Sarah Myhill', 'Dr. Sarah Myhill')
player = player.replace('Dr Philip Ovadia', 'Dr. Philip Ovadia')
player = player.replace('Dr Natasha Campbell-McBride', 'Dr. Natasha Campbell-McBride')
player = player.replace('role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική"', 'role:"Physician"')
player = player.replace('role:"Καρδιοθωρακοχειρουργός και ειδικός στη μεταβολική υγεία"', 'role:"Cardiothoracic Surgeon"')
player = player.replace('role:"Ιατρός με εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή"', 'role:"Physician"')

speaker_anchor = 'const SPEAKERS:Record<string,SpeakerProfile>={\n'
stasha = '  BbGv7GTbRN8:{name:"Dr. Stasha Gominak",role:"Neurologist",importance:"",currentWork:"",highlights:[]},\n'
player = replace_once(player, speaker_anchor, speaker_anchor + stasha, "frontend Stasha fallback")
player = player.replace('metadataVersion!==4', 'metadataVersion!==5')
player = player.replace('metadataVersion:4', 'metadataVersion:5')
player_path.write_text(player)
