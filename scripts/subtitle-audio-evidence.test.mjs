import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAudioEvidence, subtitleSourceWords } from "../app/subtitle-audio-evidence.ts";
import { validateAuthoredEvents, displaySubtitleTrack, subtitleEventAt, subtitleTrackSrt } from "../app/subtitle-track.ts";
import { subtitleContentHash, subtitleTrackForPayload, reviewedTrack } from "../app/api/subtitle-track.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/sarah-word-review.json", import.meta.url), "utf8"));
const { source, translation, review } = fixture;
const copy = () => structuredClone(review);
const compile = r => validateAuthoredEvents(r.events, translation, { source, evidence: r.audioEvidence });
assert.equal(subtitleContentHash(source), review.sourceHash, "Python and server source hashes match");
assert.equal(subtitleContentHash(translation), review.translationHash, "Python and server translation hashes match");
assert.equal(subtitleSourceWords(source).length, 70);
assert.equal(subtitleSourceWords([{ text: "It's a long-term follow-up.", start: 0, duration: 2 }]).length, 6);
const track = compile(review);
assert.equal(track.events.length, 6);
assert.equal(track.audit.readable, true);
assert.equal(Math.round((track.events.at(-1).start + track.events.at(-1).duration) * 1000), 24761);
assert.throws(() => validateAuthoredEvents(review.events, translation), /require audio evidence/,
  "word ranges cannot bypass legacy windows without their evidence");
const legacyEvents = review.events.map(({ sourceWordRange, ...event }) => event);
assert.throws(() => validateAuthoredEvents(legacyEvents, translation), /speech window/,
  "the real final word is outside the old source window");
assert.equal(displaySubtitleTrack(translation, track), track);
for (const [i, event] of track.events.entries()) assert.equal(subtitleEventAt(track.events, event.start + .01), i);
assert.ok(subtitleTrackSrt(track.events).includes("00:00:24,761"), "export shares the playback out-point");

for (const [mutate, error] of [
  [r => { r.events[0].sourceWordRange[0] = 1; }, /word coverage/],
  [r => { r.events[1].sourceWordRange[0]--; }, /word coverage/],
  [r => { r.events.pop(); }, /coverage/],
  [r => { r.events[0].sourceIndices = [1]; }, /mapping differs/],
  [r => { r.events[0].start += .1; }, /aligned speech window/],
  [r => { r.events[0].duration += .5; }, /aligned speech window/],
  [r => { r.audioEvidence.words.pop(); }, /word coverage/],
  [r => { r.audioEvidence.words[1][0] = 0; }, /overlapping/],
  [r => { r.audioEvidence.words[0][2] = 499; }, /Unsupported direct/],
  [r => { r.audioEvidence.words[0][3] = 0; }, /require alignment repair/],
  [r => { r.audioEvidence.words[0][0] = null; }, /Invalid audio word/],
  [r => { r.audioEvidence.audioSha256 = "wrong"; }, /audioSha256/],
]) {
  const r = copy(); mutate(r); assert.throws(() => compile(r), error);
}
const estimated = copy(); estimated.audioEvidence.words[0][3] = 0; estimated.events[0].timing = "estimated";
assert.equal(compile(estimated).audit.professionalReady, false, "estimated evidence remains a draft");
assert.throws(() => reviewedTrack(source, translation, track.events, "approved", "Checked against the original audio.", track.audioEvidence), /ακουστικό έλεγχο/);
assert.throws(() => reviewedTrack(source, translation, track.events, null, "Checked against the original audio.", track.audioEvidence), /μετάφρασης/);
assert.throws(() => reviewedTrack(source, translation, track.events, "approved", "ok", track.audioEvidence), /Κατάγραψε/);
const approved = { ...track, sourceHash: review.sourceHash, translationHash: review.translationHash,
  bilingualReview: "approved", reviewNote: "Test-only review assertion for publication gate checks.",
  events: track.events.map(e => ({ ...e, timing: "audio_reviewed" })) };
const reviewed = reviewedTrack(source, translation, approved.events, "approved", approved.reviewNote, track.audioEvidence);
assert.equal(reviewed.audioEvidence.audioSha256, review.audioEvidence.audioSha256, "server approval preserves the bound evidence");
assert.throws(() => reviewedTrack(source, translation, approved.events, "approved", approved.reviewNote, { ...track.audioEvidence, sourceHash: "0".repeat(64) }), /Audio source changed/);
const payload = candidate => ({ cues: translation, englishCues: source, subtitleTrack: candidate });
assert.equal(subtitleTrackForPayload(payload(approved)).origin, "authored");
assert.equal(subtitleTrackForPayload(payload({ ...approved, events: track.events })).origin, "legacy",
  "model alignment does not substitute for per-event listening");
assert.equal(subtitleTrackForPayload(payload({ ...approved, sourceHash: "0".repeat(64) })).origin, "legacy");
assert.equal(subtitleTrackForPayload(payload({ ...approved, audioEvidence: { ...approved.audioEvidence, sourceHash: "0".repeat(64) } })).origin, "legacy");
assert.equal(subtitleTrackForPayload({ ...payload(approved), cues: translation.map((c, i) => i ? c : { ...c, text: "Άλλαξε." }) }).origin, "legacy");
assert.throws(() => validateAudioEvidence({ ...review.audioEvidence, words: [[1, 2, 900, 1]] }, source), /coverage/);
console.log("audio evidence import, source binding, full word coverage, drift, publication, playback and SRT checks passed");

assert.throws(() => validateAuthoredEvents([{start:0,duration:2,text:"5 βαθμοί.",sourceIndices:[0],timing:"audio_reviewed"}], [{start:0,duration:2,text:"-5 βαθμοί."}]), /Numeric/, "a negative quantity cannot silently become positive");
