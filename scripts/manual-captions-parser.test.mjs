import assert from "node:assert/strict";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../app/api/manual-captions/parser.ts";

const srt = parseManualSubtitleText(`1\n00:00:01,000 --> 00:00:04,500\nΗ πρώτη πρόταση.\n\n2\n00:00:04,500 --> 00:00:07,000\nΗ δεύτερη πρόταση.`);
assert.equal(srt.length, 2);
assert.equal(srt[0].start, 1);
assert.equal(srt[0].duration, 3.5);
assert.equal(srt[0].text, "Η πρώτη πρόταση.");

const vtt = parseManualSubtitleText(`WEBVTT\n\n00:00:02.000 --> 00:00:05.000\nΠρώτη γραμμή\nδεύτερη γραμμή\n\n00:00:05.000 --> 00:00:08.250\nΕπόμενο cue`);
assert.equal(vtt.length, 2);
assert.equal(vtt[0].text, "Πρώτη γραμμή δεύτερη γραμμή");
assert.equal(vtt[1].duration, 3.25);

const youtube = parseManualSubtitleText(`0:10\nΑρχή πρότασης\n0:13\nΣυνέχεια\n0:18\nΤέλος`);
assert.equal(youtube.length, 3);
assert.equal(youtube[0].start, 10);
assert.equal(youtube[0].duration, 3);
assert.equal(youtube[1].duration, 5);
assert.equal(youtube[2].duration, 4);

const inline = parseManualSubtitleText(`[00:00:01.000 --> 00:00:03.000] Μία γραμμή\n[00:00:03.000 --> 00:00:05.000] Δεύτερη γραμμή`);
assert.equal(inline.length, 2);
assert.equal(inline[0].text, "Μία γραμμή");

// Source transcripts may contain overlapping cues and a later cue may begin
// slightly before the previous cue. Strict import compares each Greek cue to
// its corresponding English cue instead of rewriting or reordering source time.
const sourceTiming = parseManualSubtitleText(`7\n00:00:09,719 --> 00:00:11,519\nΠροηγούμενο cue.\n\n8\n00:00:09,519 --> 00:00:11,519\nΕπόμενο cue.`);
assert.equal(sourceTiming.length, 2);
assert.equal(sourceTiming[0].start, 9.719);
assert.ok(Math.abs(sourceTiming[0].duration - 1.8) < 0.000001);
assert.equal(sourceTiming[1].start, 9.519);
assert.ok(Math.abs(sourceTiming[1].duration - 2) < 0.000001);
assert.equal(hasValidManualCueTimings(sourceTiming), true);

const overlap = parseManualSubtitleText(`20\n00:00:30,640 --> 00:00:34,399\nCue με επικάλυψη.\n\n21\n00:00:32,320 --> 00:00:33,707\nΕπόμενο cue.`);
assert.ok(Math.abs(overlap[0].duration - 3.759) < 0.000001);
assert.ok(Math.abs(overlap[1].duration - 1.387) < 0.000001);

console.log("manual caption parser regression checks passed");
