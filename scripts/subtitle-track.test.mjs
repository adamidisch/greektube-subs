import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditSubtitleEvents,displaySubtitleTrack,legacySubtitleTrack,subtitleEventAt,subtitleTrackSrt,validateAuthoredEvents} from '../app/subtitle-track.ts';
import {matchesCanonicalManualSource,manualNumericMismatches} from '../app/api/manual-captions/integrity.ts';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/subtitle-xYB6uYyRjCA-110s.json',import.meta.url),'utf8'));
const before=JSON.stringify(fixture),track=legacySubtitleTrack(fixture.cues);
assert.equal(JSON.stringify(fixture),before,'compilation preserves the original bilingual cues');
assert.equal(track.events.length,3,'the 1:50 source cue has three actual display events');
assert.ok(track.audit.fastPages>0,'a complete source cue must still fail actual display readability');
assert.ok(track.events.some(event=>event.duration<1.5),'the reported flash is preserved as a regression');
assert.equal(track.audit.professionalReady,false,'estimated page timing is never audio proof');
const text=track.events.map(event=>event.text).join(' ').replace(/\s+/gu,' ').trim();
assert.equal(text,fixture.cues[0].text.replace(/\s+/gu,' ').trim(),'pages preserve every source word');
for(const [index,event]of track.events.entries()){
  assert.equal(subtitleEventAt(track.events,event.start+.001),index);
  assert.ok(subtitleTrackSrt(track.events).includes(event.text.split(' ')[0]));
}
assert.equal(subtitleEventAt(track.events,track.events.at(-1).start+track.events.at(-1).duration),-1,'out-points are exclusive');
const gapped=[{start:0,duration:1,text:'one'},{start:5,duration:2,text:'two'}];
assert.equal(subtitleEventAt(gapped,3),-1,'silence never holds the previous subtitle');
assert.equal(subtitleEventAt(gapped,-1),-1);
assert.equal(subtitleEventAt(gapped,Number.NaN),-1);
assert.equal(subtitleEventAt(gapped,5),1);
const fastGapped=legacySubtitleTrack([{start:0,duration:.5,text:'Αυτή η πρόταση χρειάζεται περισσότερο χρόνο ανάγνωσης.'},{start:1,duration:.5,text:'Και αυτή η συνέχεια χρειάζεται περισσότερο χρόνο.'}]);
assert.equal(subtitleEventAt(fastGapped.events,.75),-1,'fallback packing cannot bridge a real source gap to hide a fast cue');
const greek=legacySubtitleTrack([{start:0,duration:2,text:'Ναι.'}]);
const english=legacySubtitleTrack([{start:3,duration:2,text:'Yes.'}]);
assert.equal(subtitleEventAt(greek.events,3.1),-1);
assert.equal(subtitleEventAt(english.events,3.1),0,'English resolves its own clock rather than a Greek index');

const source=[{start:10,duration:4,text:'Το ποσοστό είναι 25%.'}];
const events=[{...source[0],sourceIndices:[0],timing:'audio_reviewed'}];
const authored=validateAuthoredEvents(events,source);
assert.equal(authored.audit.professionalReady,true);
assert.equal(displaySubtitleTrack(source,authored),authored);
const edited=[{...source[0],text:'Το ποσοστό είναι 35%.'}];
assert.equal(displaySubtitleTrack(edited,authored).origin,'legacy','local text edits invalidate reviewed artifacts');
assert.throws(()=>validateAuthoredEvents([{...events[0],text:'Το ποσοστό είναι 35%.'}],source),/Numeric/);
assert.throws(()=>validateAuthoredEvents([{...events[0],start:8}],source),/speech window/);
assert.throws(()=>validateAuthoredEvents([{...events[0],sourceIndices:[1]}],source),/mapping/);
assert.throws(()=>validateAuthoredEvents(events,[...source,{start:20,duration:3,text:'Άλλη πρόταση.'}]),/coverage/);
assert.equal(auditSubtitleEvents([{...events[0],duration:.5}]).readable,false);
assert.equal(auditSubtitleEvents([{...events[0],timing:'estimated'}]).speechVerified,false);
assert.equal(auditSubtitleEvents([events[0],{...events[0],start:11}]).readable,false,'overlap blocks approval');
assert.equal(auditSubtitleEvents([]).professionalReady,false);
const alreadyReadable=[{start:0,duration:2,text:'Αρχή της σκέψης'},{start:2,duration:2,text:'και συνέχεια.'}];
assert.equal(legacySubtitleTrack(alreadyReadable).events.length,2,'an already readable authored SRT retains its own display boundaries');
assert.equal(legacySubtitleTrack(alreadyReadable).audit.speechVerified,false,'readable SRT timing still needs acoustic proof');
assert.ok(subtitleTrackSrt(events).includes('00:00:10,000 --> 00:00:14,000'));
console.log('shared subtitle timeline, source integrity, review and 1:50 regression checks passed');
const englishSource=[{start:0,duration:3,text:'The proportion is 25%.'}];
assert.equal(matchesCanonicalManualSource([{...englishSource[0],text:'The  proportion\nis 25%.'}],englishSource),true);
assert.equal(matchesCanonicalManualSource([{...englishSource[0],text:'The proportion is 35%.'}],englishSource),false);
assert.deepEqual(manualNumericMismatches(englishSource,[{...englishSource[0],text:'Το ποσοστό είναι 25%.'}]),[]);
assert.deepEqual(manualNumericMismatches(englishSource,[{...englishSource[0],text:'Το ποσοστό είναι 35%.'}]),[1]);

assert.equal(auditSubtitleEvents([{...events[0],timing:"audio_aligned"}]).speechVerified,false,"model alignment is not acoustic approval");
