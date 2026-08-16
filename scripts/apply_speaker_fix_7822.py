from pathlib import Path
import json
import re

player_path = Path('app/GreekTubePlayer.tsx')
metadata_path = Path('app/api/metadata/route.ts')
captions_path = Path('app/api/captions/route.ts')
state_path = Path('app/api/state/route.ts')
package_path = Path('package.json')

player = player_path.read_text()
metadata = metadata_path.read_text()
captions = captions_path.read_text()
state = state_path.read_text()
package = json.loads(package_path.read_text())


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# Client/player: canonical speaker identity is independent from the YouTube channel.
player = replace_once(
    player,
    'import { APP_VERSION } from "./version";\n',
    'import { APP_VERSION } from "./version";\nimport { canonicalSpeakerForVideo } from "./speaker-catalog";\n',
    'player speaker catalog import',
)

speaker_block = re.compile(r'const SPEAKERS:Record<string,SpeakerProfile>=\{[\s\S]*?\n\};\nfunction speakerForVideo\(id:string,channel:string\):SpeakerProfile\{[^\n]*\}\n')
replacement = '''function speakerForVideo(id:string,_channel:string):SpeakerProfile{\n  return canonicalSpeakerForVideo(id)||{\n    name:"Ομιλητής προς επιβεβαίωση",\n    role:"",\n    importance:"Η ταυτότητα του ομιλητή δεν έχει ακόμη επιβεβαιωθεί.",\n    currentWork:"",\n    highlights:[],\n  };\n}\n'''
player, count = speaker_block.subn(lambda _match: replacement, player, count=1)
if count != 1:
    raise SystemExit(f'player speaker block: expected 1 match, found {count}')

# Metadata ingestion: use canonical identity first. Automatic extraction remains the
# fallback, but channel is never promoted to speakerName.
metadata = replace_once(
    metadata,
    'import { NextResponse } from "next/server";\n',
    'import { NextResponse } from "next/server";\nimport { canonicalSpeakerForVideo } from "@/app/speaker-catalog";\n',
    'metadata speaker catalog import',
)
metadata = re.sub(
    r'\nconst KNOWN_SPEAKER_NAMES: Record<string, string> = \{[\s\S]*?\n\};\n',
    '\n',
    metadata,
    count=1,
)
metadata = replace_once(
    metadata,
    '    const speakerName = KNOWN_SPEAKER_NAMES[id] || speakerNameFromMetadata(originalTitle, details.description);\n    const speakerRole = speakerRoleFromMetadata(details.description, speakerName);',
    '    const canonicalSpeaker = canonicalSpeakerForVideo(id);\n    const speakerName = canonicalSpeaker?.name || speakerNameFromMetadata(originalTitle, details.description);\n    const speakerRole = canonicalSpeaker?.role || speakerRoleFromMetadata(details.description, speakerName);',
    'metadata canonical speaker assignment',
)

# Captions: one canonical catalog for all known videos and, critically, no channel fallback.
captions = replace_once(
    captions,
    'import { NextResponse } from "next/server";\n',
    'import { NextResponse } from "next/server";\nimport { canonicalSpeakerForVideo } from "@/app/speaker-catalog";\n',
    'captions speaker catalog import',
)
caption_speaker_block = re.compile(r'const SPEAKERS_BY_VIDEO: Record<string, SpeakerProfile> = \{[\s\S]*?\n\};\n\nfunction speakerProfile\(videoId: string, description = "", channel = ""\): SpeakerProfile \{[\s\S]*?\n\}\n\nconst API_KEY')
caption_replacement = '''function speakerProfile(videoId: string, description = "", _channel = ""): SpeakerProfile {\n  const known = canonicalSpeakerForVideo(videoId);\n  if (known) return known;\n  const match = description.match(/\\b(?:Dr\\.?|Doctor)\\s+([A-Z][A-Za-z'-]+(?:\\s+[A-Z][A-Za-z'-]+){1,3})/);\n  const name = match ? `Dr. ${match[1]}` : "";\n  return {\n    name: name || "Ομιλητής προς επιβεβαίωση",\n    role: name ? "Ιατρός / ομιλητής" : "",\n    importance: "Η ταυτότητα του ομιλητή δεν έχει ακόμη επιβεβαιωθεί από τα διαθέσιμα metadata.",\n    currentWork: "",\n    highlights: [],\n  };\n}\n\nfunction normalizedPublishedSpeaker(videoId: string, payload: unknown): SpeakerProfile {\n  const canonical = canonicalSpeakerForVideo(videoId);\n  if (canonical) return canonical;\n  const record = payload && typeof payload === "object"\n    ? payload as { speaker?: SpeakerProfile; channel?: unknown }\n    : {};\n  const channel = typeof record.channel === "string" ? record.channel.trim() : "";\n  const existing = record.speaker;\n  if (existing?.name && (!channel || existing.name.trim().toLowerCase() !== channel.toLowerCase())) return existing;\n  return speakerProfile(videoId);\n}\n\nconst API_KEY'''
captions, count = caption_speaker_block.subn(lambda _match: caption_replacement, captions, count=1)
if count != 1:
    raise SystemExit(f'captions speaker block: expected 1 match, found {count}')

published_old = '''      return NextResponse.json(published, {\n        headers: {'''
published_new = '''      return NextResponse.json({ ...published, speaker: normalizedPublishedSpeaker(videoId, published) }, {\n        headers: {'''
captions = replace_once(captions, published_old, published_new, 'published speaker normalization')

# Shared library: correct known historical records at read-time and on every future shared save.
state = replace_once(
    state,
    'import { database } from "@/db/postgres";\n',
    'import { database } from "@/db/postgres";\nimport { canonicalSpeakerForVideo, speakerMatchesChannel } from "@/app/speaker-catalog";\n',
    'state speaker catalog import',
)
state = replace_once(
    state,
    'function sanitizePersonalState(input: unknown) {',
    '''function normalizeSpeakerFields(video: VideoRecord) {\n  const normalized = { ...video };\n  const id = typeof video.id === "string" ? video.id : "";\n  const canonical = canonicalSpeakerForVideo(id);\n  if (canonical) {\n    normalized.speakerName = canonical.name;\n    normalized.speakerRole = canonical.role;\n  } else if (speakerMatchesChannel(\n    typeof normalized.speakerName === "string" ? normalized.speakerName : undefined,\n    typeof normalized.channel === "string" ? normalized.channel : undefined,\n  )) {\n    delete normalized.speakerName;\n    delete normalized.speakerRole;\n  }\n  return normalized;\n}\n\nfunction sanitizePersonalState(input: unknown) {''',
    'state speaker normalizer',
)
state = replace_once(
    state,
    '  const sharedVideo = { ...video };',
    '  const sharedVideo = normalizeSpeakerFields(video);',
    'normalize shared save',
)
state = replace_once(
    state,
    '    return {\n      ...video,\n      favorite: Boolean(personalVideo?.favorite),',
    '    return {\n      ...normalizeSpeakerFields(video),\n      favorite: Boolean(personalVideo?.favorite),',
    'normalize shared read',
)

if package.get('version') != '7.8.21':
    raise SystemExit(f'unexpected package version: {package.get("version")}')
package['version'] = '7.8.22'

player_path.write_text(player)
metadata_path.write_text(metadata)
captions_path.write_text(captions)
state_path.write_text(state)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
print('Applied canonical speaker fix 7.8.22')
