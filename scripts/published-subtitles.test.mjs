import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publishedBodies, restoredSnapshot, sha256, verifiedBody } from '../app/api/published-subtitles-core.ts';
import { markVerifiedSnapshotTrack, subtitleTrackForPayload } from '../app/api/subtitle-track.ts';
import { displaySubtitleTrack, subtitleInputKey } from '../app/subtitle-track.ts';

const preview = JSON.parse(fs.readFileSync(new URL('../public/previews/xYB6uYyRjCA.json', import.meta.url), 'utf8'));
const english = Array.from({ length: 1073 }, (_, i) => ({ start: i * 6, duration: 5, text: `English cue ${i}` }));

// 1. The restoration is the approved preview verbatim plus the single approved fix at 26:19.
const { payload, englishCues } = restoredSnapshot('xYB6uYyRjCA', 12, preview.events, english, { title: 'Sarah', channel: 'Channel', duration: 6800 });
const track = payload.subtitleTrack;
assert.equal(track.events.length, 1513);
const changed = track.events.map((e, i) => JSON.stringify(e) === JSON.stringify(preview.events[i]) ? -1 : i).filter(i => i >= 0);
assert.deepEqual(changed, [351], 'only the 26:19 phrase differs from the approved preview');
assert.equal(track.events[351].text, 'Νομίζω, όλοι χρειαζόμαστε τουλάχιστον μία σταγόνα Lugol 15% τη μέρα');
assert.equal(Math.floor(track.events[351].start / 60), 26);
assert.equal(track.audit.readable, true);
assert.equal(track.approvalLevel, 'owner_approved');
assert.equal(track.inputKey, subtitleInputKey(payload.cues));
assert.equal(displaySubtitleTrack(payload.cues, track), track, 'the player shows the authored events, not the legacy packer');
assert.equal(englishCues.length, 1073);
assert.ok(preview.events.every((e, i) => i === 351 || e.text === track.events[i].text), 'the committed preview itself is untouched');

// 2. Anything other than the pinned approved preview is refused.
const tampered = structuredClone(preview.events); tampered[10].text += ' x';
assert.throws(() => restoredSnapshot('xYB6uYyRjCA', 12, tampered, english, {}), /changed/);
assert.throws(() => restoredSnapshot('xYB6uYyRjCA', 12, preview.events, english.slice(1), {}), /count/);
assert.throws(() => restoredSnapshot('NDeaXZ5KpM4', 12, preview.events, english, {}), /No approved restoration/);

// 3. Stored text is served only when it matches its hash.
const bodies = publishedBodies(payload, englishCues);
assert.deepEqual(verifiedBody(bodies.greekBody, bodies.greekHash), JSON.parse(JSON.stringify(payload)));
assert.throws(() => verifiedBody(bodies.greekBody.replace('Lugol', 'Lugo1'), bodies.greekHash), /hash mismatch/);
assert.equal(bodies.contentHash, sha256(`${bodies.greekHash}:${bodies.englishHash}`));

// 4. Only the storage reader can vouch for a track; JSON or request bodies cannot.
const fromJson = JSON.parse(bodies.greekBody);
assert.equal(subtitleTrackForPayload({ ...fromJson, englishCues }).origin, 'legacy', 'an unmarked copy must re-verify and, without word evidence, falls back');
markVerifiedSnapshotTrack(fromJson.subtitleTrack);
assert.equal(subtitleTrackForPayload({ ...fromJson, englishCues }).origin, 'authored');
assert.equal(subtitleTrackForPayload({ ...fromJson }).events.length, 1513, 'a verified snapshot needs no English cues to display');
const edited = { ...fromJson, cues: fromJson.cues.map((c, i) => i === 0 ? { ...c, text: c.text + '!' } : c) };
assert.equal(subtitleTrackForPayload(edited).origin, 'legacy', 'a verified track never covers edited cues');

console.log('published-subtitles: ok');
