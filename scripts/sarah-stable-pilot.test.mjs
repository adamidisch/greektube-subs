import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditSubtitleEvents, sourceStableSubtitleTrack, subtitleEventAt, subtitleTrackSrt, displaySubtitleTrack } from '../app/subtitle-track.ts';
const pilot=JSON.parse(fs.readFileSync(new URL('./fixtures/sarah-stable-pilot.json',import.meta.url),'utf8'));
const audit=auditSubtitleEvents(pilot.events);
assert.equal(audit.readable,true,JSON.stringify(audit.issues));
assert.equal(audit.speechVerified,false,'model candidates are never acoustic approval');
assert.equal(pilot.publicationAllowed,false,'partial pilot cannot be published as full track');
assert.equal(pilot.sourceCueCount,1073);
assert.equal(pilot.v65CueCount,1029,'two source revisions cannot share cue IDs implicitly');
let lastWord=272;
for(const e of pilot.events){
 assert.equal(Number(e.wordIds[0].slice(1)),lastWord+1,'every source word in the sample is mapped once');
 lastWord=Number(e.wordIds[1].slice(1));
 assert.equal(e.timing,'estimated');
 assert.equal(e.evidence.listened,false);
 assert.equal(e.evidence.boundaryReviewRequired,true);
 assert.ok(e.evidence.holdMs>=0&&e.evidence.holdMs<=250);
 assert.equal(subtitleEventAt(pilot.events,e.start+.001),pilot.events.indexOf(e));
 assert.ok(subtitleTrackSrt(pilot.events).replace(/\s+/gu,' ').includes(e.text.replace(/\s+/gu,' ')));
}
assert.equal(lastWord,418);
const fast=[{start:0,duration:1,text:'Αυτή η μεγάλη πρόταση δεν πρέπει να χωρίζεται αυτόματα σε χρονικές σελίδες.'},{start:3,duration:2,text:'Συνέχεια.'}];
const immutable=JSON.stringify(fast);
const stable=sourceStableSubtitleTrack(fast,'estimated');
assert.equal(stable.events.length,fast.length);
assert.equal(stable.audit.professionalReady,false);
assert.ok(stable.audit.fastPages>0,'retain warnings instead of inventing times');
assert.equal(subtitleEventAt(stable.events,2),-1,'actual gaps remain empty');
assert.equal(displaySubtitleTrack(fast,stable),stable,'candidate playback bypasses the legacy packer');
assert.equal(JSON.stringify(fast),immutable);
console.log(`Sarah candidate: ${pilot.events.length} stable events, no reading/layout blockers; acoustic review remains pending.`);

const corrected=JSON.parse(fs.readFileSync(new URL('./fixtures/sarah-stable-pilot-v2.json',import.meta.url),'utf8'));
assert.equal(auditSubtitleEvents(corrected.events).readable,true);
assert.match(corrected.events.at(-1).text,/κιβώτιο ταχυτήτων/u);
assert.equal(corrected.publicationAllowed,false);
assert.deepEqual(corrected.events.map(e=>[e.start,e.duration,e.wordIds]),pilot.events.map(e=>[e.start,e.duration,e.wordIds]),'wording repair does not invent new timing');
