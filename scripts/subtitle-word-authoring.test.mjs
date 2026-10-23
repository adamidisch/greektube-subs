import assert from "node:assert/strict";
import fs from "node:fs";
import { buildWordAuthoringPacket, advanceWordAuthoring, assembleWordAuthoring, parseWordPhrases,
  authorWordPhrases, wordAuthoringKey, WordAuthoringNeedsReview, planWordAuthoring, wordSemanticKey, wordEvidenceKey, reusableWordSemantics } from "../app/api/captions/word-authoring.ts";
import { wordAuthoringJson, WordAuthoringProviderError } from "../app/api/captions/word-authoring-provider.ts";
import { subtitleContentHash } from "../app/api/subtitle-track.ts";
import { subtitleTrackSrt } from "../app/subtitle-track.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/sarah-word-review.json", import.meta.url), "utf8"));
const opening = JSON.parse(fs.readFileSync(new URL("../worker/fixtures/sarah-opening-authoring.json", import.meta.url), "utf8"));
const brief = { mainTopic: "Sarah Myhill discusses energy and fatigue", glossary: [{ source: "hypothyroidism", greek: "υποθυρεοειδισμός" }] };
const { source, translation, review } = fixture;
const packet = buildWordAuthoringPacket(source, translation, review.audioEvidence, [0, 3], brief);
assert.equal(packet.words.length, 70);
assert.equal(packet.sourceHash, review.sourceHash);
const phrases = parseWordPhrases({ phrases: opening.phrases }, packet);
const actualEvents = authorWordPhrases(packet, phrases);
assert.equal(actualEvents.length, 6);
assert.deepEqual(actualEvents.map(e => [e.start, Math.round(e.duration * 1000), e.text, e.sourceWordRange]),
  review.events.map(e => [e.start, Math.round(e.duration * 1000), e.text, e.sourceWordRange]), "web and Python authoring agree on the actual opening");
assert.ok(subtitleTrackSrt(actualEvents).includes("00:00:24,761"));

let calls = 0, checkpoints = 0;
const cache = {};
const provider = async () => (++calls === 1 ? { phrases: opening.phrases } : { status: "approved", issues: [], phrases: opening.phrases });
const checkpoint = async () => { checkpoints++; };
assert.equal((await advanceWordAuthoring(packet, cache, provider, checkpoint)).status, "translation_ready");
assert.equal(calls, 1, "translation and review never chain provider requests inside one invocation");
const result = await advanceWordAuthoring(packet, cache, provider, checkpoint);
assert.equal(calls, 2);
assert.equal(result.status, "draft_ready");
assert.equal(result.humanAudioReview, false);
assert.ok(checkpoints >= 3);
assert.equal((await advanceWordAuthoring(packet, cache, provider, checkpoint)), result);
assert.equal(calls, 2, "ready checkpoints replay without a model call");
const assembled = assembleWordAuthoring(source, translation, review.audioEvidence, [result]);
assert.equal(assembled.events.length, 6);
assert.ok(assembled.events.every(e => e.timing === "audio_aligned"));
assert.throws(() => assembleWordAuthoring(source, translation, review.audioEvidence, []), /coverage/);
assert.throws(() => assembleWordAuthoring(source, translation, review.audioEvidence, [result, result]), /reordered/);
assert.throws(() => assembleWordAuthoring(source, translation, { ...review.audioEvidence, audioSha256: "0".repeat(64) }, [result]), /stale/);

const resume = { ...cache, result: undefined, reviewed: undefined, status: "translation_ready" };
let reviewCalls = 0;
await assert.rejects(advanceWordAuthoring(packet, resume, async () => { reviewCalls++; throw new WordAuthoringProviderError(429, 90); }, checkpoint), WordAuthoringProviderError);
assert.equal(reviewCalls, 1);
assert.ok(resume.proposed);
assert.equal(resume.reviewed, undefined);
await advanceWordAuthoring(packet, resume, async () => { reviewCalls++; return { status: "approved", issues: [], phrases: opening.phrases }; }, checkpoint);
assert.equal(reviewCalls, 2, "review resumes without retranslating the paid first stage");
await assert.rejects(advanceWordAuthoring({ ...packet, globalBrief: { ...brief, mainTopic: "Changed" } }, cache, provider, checkpoint), /Stale/);
assert.notEqual(wordAuthoringKey({ ...packet, existingGreek: "Changed" }), wordAuthoringKey(packet));
assert.notEqual(wordAuthoringKey({ ...packet, audioSha256: "0".repeat(64) }), wordAuthoringKey(packet));

const declined = { ...cache, result: undefined, reviewed: { status: "manual_review_required", issues: ["Meaning unclear"] }, status: "translation_ready" };
await assert.rejects(advanceWordAuthoring(packet, declined, provider, checkpoint), /Independent/);
assert.equal(declined.status, "manual_review_required");
const oldCalls = calls;
await assert.rejects(advanceWordAuthoring(packet, declined, provider, checkpoint), WordAuthoringNeedsReview);
assert.equal(calls, oldCalls, "manual-review scopes do not auto-retry");

assert.throws(() => parseWordPhrases({ phrases: opening.phrases.slice(1) }, packet), /coverage/);
assert.throws(() => buildWordAuthoringPacket(source, translation, review.audioEvidence, [3, 0], brief), /range/);
assert.throws(() => buildWordAuthoringPacket(source, translation, review.audioEvidence, [0, 3], {}), /brief/);
assert.throws(() => buildWordAuthoringPacket(source, translation, { ...review.audioEvidence, sourceHash: "0".repeat(64) }, [0, 3], brief), /source changed/);
const uncertain = structuredClone(review.audioEvidence); uncertain.words[0][3] = 0;
assert.throws(() => buildWordAuthoringPacket(source, translation, uncertain, [0, 3], brief), /uncertain/);

const shortSource = [{ start: 0, duration: 2, text: "It is -5 degrees." }];
const shortGreek = [{ start: 0, duration: 2, text: "Είναι -5 βαθμοί." }];
const evidence = { ...review.audioEvidence, sourceHash: subtitleContentHash(shortSource),
  words: [[0, 100, 900, 1], [100, 200, 900, 1], [200, 300, 900, 1], [300, 1900, 900, 1]] };
const short = buildWordAuthoringPacket(shortSource, shortGreek, evidence, [0, 0], brief);
const onePhrase = text => ({ phrases: [{ firstWordId: "W000001", lastWordId: "W000004", text }] });
assert.throws(() => parseWordPhrases(onePhrase("Είναι 5 βαθμοί."), short), /Numeric/);
assert.throws(() => parseWordPhrases(onePhrase("Είναι -5 βαθμοί, και κρύο."), short), /punctuation/);
assert.throws(() => parseWordPhrases(onePhrase("ΕΊΝΑΙ -5 ΒΑΘΜΟΙ."), short), /tonos/);
const long = parseWordPhrases(onePhrase("Είναι -5 βαθμοί " + "πολύ ".repeat(20)), short);
assert.throws(() => authorWordPhrases(short, long), /without delaying/);

let requests = 0;
for (const status of [400, 429, 500]) {
  requests = 0;
  await assert.rejects(wordAuthoringJson("test", {}, { apiKey: "test-only", fetcher: async () => {
    requests++; return new Response("ignored provider detail", { status, headers: { "Retry-After": "90" } });
  } }), error => error instanceof WordAuthoringProviderError && error.retryAfterSeconds === 90);
  assert.equal(requests, 1, `HTTP ${status} does not retry`);
}
const success = await wordAuthoringJson("test", packet, { apiKey: "test-only", fetcher: async (_url, init) => {
  const body = JSON.parse(init.body); assert.equal(body.model, "openai/gpt-oss-120b");
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"phrases":[]}' } }] });
} });
assert.deepEqual(success, { phrases: [] });
await assert.rejects(wordAuthoringJson("test", {}, { apiKey: "test-only", fetcher: async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }) }), WordAuthoringProviderError);
console.log("word-range translation, independent QA, checkpoints, cooldown, Greek fidelity gates, fit, assembly and single-attempt provider checks passed");

const planned = planWordAuthoring(source, translation, review.audioEvidence, brief);
assert.deepEqual(planned.map(s=>s.range), [[0,3]]);
assert.equal(planned[0].status,"ready");
const badBoundary = structuredClone(review.audioEvidence);
badBoundary.words[42][0] = badBoundary.words[41][1] - 10;
const targeted = planWordAuthoring(source, translation, badBoundary, brief);
assert.ok(targeted.some(s=>s.status==="ready"&&s.range[0]===0));
assert.ok(targeted.some(s=>s.status==="alignment_review_required"&&s.range[0]===2));
assert.throws(()=>assembleWordAuthoring(source,translation,badBoundary,[result]),/overlapping/);

const retimed={...packet,wordTimelineHash:"0".repeat(64),audioSha256:"b".repeat(64),words:packet.words.map(w=>({...w,startMs:w.startMs+1,endMs:w.endMs+1})),nextWordStartMs:packet.nextWordStartMs+1};
assert.equal(wordSemanticKey(retimed),wordSemanticKey(packet));
assert.notEqual(wordAuthoringKey(retimed),wordAuthoringKey(packet));
const reused=reusableWordSemantics(retimed,{key:wordSemanticKey(packet),proposed:cache.proposed,reviewed:cache.reviewed});
const reusedResult=await advanceWordAuthoring(retimed,reused,async()=>{throw Error("No new paid request is allowed after timing-only repair")},checkpoint);
assert.equal(reusedResult.status,"draft_ready");
assert.equal(reusedResult.wordTimelineHash,retimed.wordTimelineHash);
assert.equal(reusedResult.events[0].start,actualEvents[0].start+.001);
assert.deepEqual(reusableWordSemantics({...packet,sourceHash:"different"},{key:wordSemanticKey(packet),proposed:cache.proposed}),{});

assert.equal(wordEvidenceKey(structuredClone(review.audioEvidence)),wordEvidenceKey(review.audioEvidence));
assert.notEqual(wordEvidenceKey({...review.audioEvidence,audioSha256:"a".repeat(64)}),wordEvidenceKey(review.audioEvidence));
const tampered=structuredClone(review.audioEvidence);tampered.words[0][0]++;
assert.notEqual(wordEvidenceKey(tampered),wordEvidenceKey(review.audioEvidence),"stored evidence references bind the exact word times");

for(const [requested,expected] of [[900,900],[1600,1600],[undefined,4000],[999999,4000]]){
 await wordAuthoringJson("analysis", "bounded source", {apiKey:"test-only",maxTokens:requested,fetcher:async(_url,init)=>{assert.equal(JSON.parse(init.body).max_tokens,expected);return Response.json({choices:[{finish_reason:"stop",message:{content:"{}"}}]});}});
}
console.log("bounded analysis output budgets passed");
