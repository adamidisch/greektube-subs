import assert from "node:assert/strict";
import {
  packSubtitles,
  packAlongside,
  packAt,
  packAfter,
  subtitleLines,
  balanceLines,
  MAX_PACK_DURATION,
  MAX_PACK_CHARACTERS,
} from "../app/subtitle-display.ts";

const cue=(start,duration,text)=>({start,duration,text});

// --- Real fragment run from 1:44, the case that motivated the feature. ---
const glucose=[
  cue(104,2,"περισσότερη γλυκόζη». Και έτσι δημιουργεί"),
  cue(106,1,"όλες αυτές τις επακόλουθες συνέπειες στη"),
  cue(107,2,"διάθεσή σου. Γίνεσαι πεινασμένος και εκνευρισμένος. Το μόνο που"),
  cue(109,1,"σκέφτεσαι είναι το φαγητό. Έχεις κακή"),
  cue(110,2,"διάθεση. Λες: «Πρέπει να φάω"),
];
const packedGlucose=packSubtitles(glucose);
assert.equal(packedGlucose.packs.length,3,"five fragments must collapse to three displays");
assert.deepEqual(packedGlucose.packs[1].sourceIndices,[2],"a 63 character cue has no room for a partner");

// --- Timing is never altered. ---
for(const source of [glucose,[cue(0,1,"ένα"),cue(5,3,"δύο τρία τέσσερα")]]){
  const {packs}=packSubtitles(source);
  for(const pack of packs){
    const first=source[pack.sourceIndices[0]];
    const last=source[pack.sourceIndices[pack.sourceIndices.length-1]];
    assert.equal(pack.start,first.start,"pack must keep the start of its first cue");
    assert.equal(
      Number((pack.start+pack.duration).toFixed(6)),
      Number((last.start+last.duration).toFixed(6)),
      "pack must keep the end of its last cue",
    );
  }
}

// --- Every original cue belongs to exactly one pack, in order. ---
const covered=packedGlucose.packs.flatMap(pack=>pack.sourceIndices);
assert.deepEqual(covered,glucose.map((_,index)=>index),"packing must cover every cue exactly once");

// --- Budgets hold. ---
for(const pack of packedGlucose.packs){
  assert.ok(pack.duration<=MAX_PACK_DURATION+1e-9,"pack duration budget");
  assert.ok(Array.from(pack.text).length<=MAX_PACK_CHARACTERS,"pack character budget");
  assert.ok(subtitleLines(pack.text).length<=2,"pack must wrap into at most two lines");
}

// --- Fillers and standalone acknowledgements stay on their own. ---
const fillers=packSubtitles([
  cue(0,1,"Εεε"),
  cue(1,1,"Ναι."),
  cue(2,1,"και μετά πήγαμε"),
  cue(3,1,"στο σπίτι μας"),
]);
assert.deepEqual(fillers.packs[0].sourceIndices,[0],"filler must not absorb a neighbour");
assert.deepEqual(fillers.packs[1].sourceIndices,[1],"standalone «Ναι» must stay alone");
assert.deepEqual(fillers.packs[2].sourceIndices,[2,3],"ordinary fragments still merge");

// --- A completed sentence is not glued to the next thought. ---
const sentences=packSubtitles([
  cue(0,1,"Αυτό ήταν όλο."),
  cue(1,1,"Πάμε στο επόμενο"),
]);
assert.deepEqual(sentences.packs[0].sourceIndices,[0],"terminal punctuation ends a pack");

// --- A gap wider than a second breaks the run. ---
const gapped=packSubtitles([cue(0,1,"και μετά"),cue(4,1,"πήγαμε σπίτι")]);
assert.equal(gapped.packs.length,2,"a long silence must break the pack");

// --- Lookup by original cue index stays valid for every cue. ---
for(let index=0;index<glucose.length;index++){
  const pack=packAt(packedGlucose,index);
  assert.ok(pack?.sourceIndices.includes(index),"packAt must return the owning pack");
}
assert.equal(packAt(packedGlucose,-1),undefined,"out of range index yields nothing");
assert.equal(packAfter(packedGlucose,glucose.length-1),undefined,"last pack has no successor");

// --- English track reuses the Greek grouping when index aligned. ---
const english=glucose.map((c,i)=>cue(c.start,c.duration,`english ${i}`));
const alongside=packAlongside(english,packedGlucose);
assert.deepEqual(
  alongside.packs.map(pack=>pack.sourceIndices),
  packedGlucose.packs.map(pack=>pack.sourceIndices),
  "dual mode must switch both tracks at the same moments",
);
assert.equal(packAlongside([],packedGlucose).packs.length,0,"missing english track is harmless");

// --- Empty and single inputs. ---
assert.equal(packSubtitles(undefined).packs.length,0,"undefined cues are tolerated");
assert.equal(packSubtitles([cue(0,2,"μόνο ένα")]).packs.length,1,"a single cue yields a single pack");

// --- Line balancing: text, wording and order never change. ---
for(const text of [
  "διάθεσή σου. Γίνεσαι πεινασμένος και εκνευρισμένος. Το μόνο που",
  "περισσότερη γλυκόζη». Και έτσι δημιουργεί όλες αυτές τις επακόλουθες συνέπειες στη",
  "μόριο της ευχαρίστησης. Μας κάνει να νιώθουμε",
]){
  const lines=subtitleLines(text);
  assert.equal(lines.join(" "),text.replace(/\s+/g," ").trim(),"line breaking must preserve the text");
  for(const line of lines) assert.ok(line.length<=42,`line over 42 characters: ${line}`);
}

// --- A conjunction must not be stranded at the end of a line. ---
const stranded=balanceLines("διάθεσή σου. Γίνεσαι πεινασμένος και εκνευρισμένος. Το μόνο που");
assert.equal(stranded.length,2,"two lines expected");
assert.ok(!/\sκαι$/.test(stranded[0]),"«και» must move to the following line");

// --- A sentence boundary is preferred over a merely even split. ---
const atPeriod=balanceLines("μόριο της ευχαρίστησης. Μας κάνει να νιώθουμε");
assert.ok(/\.$/.test(atPeriod[0]),"break should land on the full stop");

// --- Short text stays on one line. ---
assert.deepEqual(subtitleLines("μικρό κείμενο"),["μικρό κείμενο"],"short text needs no wrapping");
assert.deepEqual(subtitleLines("   "),[],"blank text yields no lines");

console.log("subtitle-packing tests passed");
