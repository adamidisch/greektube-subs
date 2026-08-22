import assert from "node:assert/strict";
import {
  activeSkipTarget,
  formatSkipTimecode,
  normalizeSkipRanges,
  parseSkipTimecode,
  validateSkipRanges,
} from "../app/skip-ranges.ts";

const overlapping=validateSkipRanges([{start:10,end:20},{start:19.5,end:25}],60);
assert.equal(overlapping.errors.some(error=>error.includes("επικαλύπτεται")),true,"overlapping ranges must be rejected");

for(const invalid of [
  [{start:-.1,end:2}],
  [{start:5,end:5}],
  [{start:8,end:7}],
  [{start:Number.NaN,end:7}],
]){
  assert.ok(validateSkipRanges(invalid,30).errors.length>0,"invalid start/end must be rejected");
}

const nearZero=[{start:0,end:1.2}];
assert.deepEqual(validateSkipRanges(nearZero,30).errors,[],"a range at zero must be valid");
assert.equal(activeSkipTarget(nearZero,.05,30),1.2,"playback inside a zero range must jump to its end");

const nearEnd=[{start:98.4,end:100}];
assert.deepEqual(validateSkipRanges(nearEnd,100).errors,[],"a range ending at the video duration must be valid");
assert.equal(activeSkipTarget([{start:99,end:100.2}],99.5,100),100,"the playback target must clamp to the video duration");

const multiple=[{start:40,end:50},{start:5,end:8},{start:70,end:72.5}];
assert.deepEqual(normalizeSkipRanges(multiple),[{start:5,end:8},{start:40,end:50},{start:70,end:72.5}],"multiple ranges must remain sorted and distinct");
assert.equal(activeSkipTarget(multiple,44,120),50,"manual seek inside a range must resolve to the range end");
assert.equal(activeSkipTarget(multiple,55,120),null,"time outside every range must not jump");

const persisted=JSON.stringify({skipRanges:normalizeSkipRanges(multiple)});
const reopened=normalizeSkipRanges(JSON.parse(persisted).skipRanges);
assert.deepEqual(reopened,normalizeSkipRanges(multiple),"close/reopen serialization must preserve exact ranges");

for(const seconds of [0,48.8,81.1,3599.9,3600,7325.4]){
  const formatted=formatSkipTimecode(seconds);
  assert.equal(parseSkipTimecode(formatted),seconds,`timecode must round-trip: ${formatted}`);
}
assert.equal(parseSkipTimecode("48.8"),48.8,"plain seconds must remain supported");
assert.equal(parseSkipTimecode("01:21.1"),81.1,"MM:SS.d must parse");
assert.equal(parseSkipTimecode("1:02:03.4"),3723.4,"H:MM:SS.d must parse");
assert.equal(parseSkipTimecode("01:61.0"),null,"invalid seconds must be rejected");

console.log("skip range flow tests passed");
