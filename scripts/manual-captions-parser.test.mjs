import assert from "node:assert/strict";
import { parseManualSubtitleText } from "../app/api/manual-captions/parser.ts";

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

console.log("manual caption parser regression checks passed");
