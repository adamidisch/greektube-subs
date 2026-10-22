import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { subtitleSourceWords } from "../app/subtitle-audio-evidence.ts";
import { importWordTiming, parseAuthoringPlan, runAuthoringBatch, authoringCounts, authoringAssemblyBody,
  authoringRequest, AuthoringClientError } from "../app/subtitle-authoring-client.ts";

const fixture=JSON.parse(fs.readFileSync(new URL("./fixtures/sarah-word-review.json",import.meta.url),"utf8"));
const {source,review}=fixture;
const tokens=subtitleSourceWords(source);
const sourceHash=createHash("sha256").update(source.map((c,i)=>`${i+1}|${Math.round(c.start*1000)}|${Math.round((c.start+c.duration)*1000)}|${c.text.replace(/\s+/gu," ").trim()}\n`).join("")).digest("hex");
const raw={...review.audioEvidence,sourceHash,words:tokens.map((t,i)=>({word_id:`W${String(i+1).padStart(6,"0")}`,source_index:i,cue_id:t.cueIndex+1,text:t.text,
  start_ms:review.audioEvidence.words[i][0],end_ms:review.audioEvidence.words[i][1],confidence:review.audioEvidence.words[i][2]/1000,timing_evidence:"forced_alignment"}))};
const imported=await importWordTiming(raw,source,review.sourceHash);
assert.deepEqual(imported.words,review.audioEvidence.words);
assert.equal(imported.sourceHash,review.sourceHash);
assert.notEqual(imported.wordTimelineHash,raw.wordTimelineHash,"compacted integer evidence has its own digest");
assert.deepEqual(await importWordTiming({audioEvidence:imported},source,review.sourceHash),imported);
await assert.rejects(importWordTiming({...raw,sourceHash:"0".repeat(64)},source,review.sourceHash),e=>e.code==="source");
const changed=structuredClone(raw);changed.words[0].text="Other";
await assert.rejects(importWordTiming(changed,source,review.sourceHash),e=>e.code==="coverage");

const scopes=parseAuthoringPlan({status:"planned",scopes:[{range:[0,1],status:"ready",key:"1".repeat(64)},{range:[2,2],status:"alignment_review_required"},{range:[3,3],status:"ready",key:"2".repeat(64)}]});
const job={schemaVersion:1,videoId:review.videoId,sourceHash:review.sourceHash,translationHash:review.translationHash,audioEvidence:imported,evidenceKey:"e".repeat(64),scopes,fileName:"test.json"};
let calls=[],saved=[];
const send=async body=>{calls.push(body);return {status:calls.filter(c=>c.sourceCueRange[0]===body.sourceCueRange[0]).length%2?"translation_ready":"draft_ready",key:body.sourceCueRange[0]===0?scopes[0].key:scopes[2].key,sourceCueRange:body.sourceCueRange};};
const first=await runAuthoringBatch(job,1,()=>false,async next=>{saved.push(next);},send);
assert.equal(calls.length,2);assert.equal(calls[0].key,scopes[0].key);assert.equal(calls[0].audioEvidence,undefined);assert.equal(calls[0].evidenceKey,"e".repeat(64));assert.ok(Buffer.byteLength(JSON.stringify(calls[0]))<1000,"stages send a small evidence reference instead of the full timeline");assert.equal(first.scopes[0].phase,"draft_ready");assert.equal(first.scopes[2].phase,undefined);
assert.equal(job.scopes[0].phase,undefined,"the input checkpoint remains immutable");
assert.deepEqual(authoringCounts(first),{ready:2,complete:1,blocked:1,remaining:1});
const second=await runAuthoringBatch(first,30,()=>false,async next=>{saved.push(next);},send);
assert.equal(calls.length,4);assert.equal(second.scopes[2].phase,"draft_ready");
assert.throws(()=>authoringAssemblyBody(second),e=>e.code==="incomplete","blocked audio always prevents assembly");
let pause=false;calls=[];
const paused=await runAuthoringBatch(job,5,()=>pause,async()=>{pause=true;},send);
assert.equal(calls.length,1);assert.equal(paused.scopes[0].phase,"translation_ready","pause retains the paid translation and prevents the review call");
let rateCalls=0,rateSaved;
await assert.rejects(runAuthoringBatch(paused,5,()=>false,async next=>{rateSaved=next;},async()=>{rateCalls++;throw new AuthoringClientError("cooldown",Date.now()+90_000);}),e=>e.code==="cooldown");
assert.equal(rateCalls,1);assert.ok(rateSaved.retryAt>Date.now());assert.equal(rateSaved.scopes[0].phase,"translation_ready");
await assert.rejects(runAuthoringBatch(rateSaved,5,()=>false,async()=>{},async()=>{throw Error("must not request while cooling down");}),e=>e.code==="cooldown");
let repairSaved;
await assert.rejects(runAuthoringBatch(job,1,()=>false,async next=>{repairSaved=next;},async()=>{throw new AuthoringClientError("repair");}),e=>e.code==="repair");
assert.equal(repairSaved.scopes[0].phase,"manual_review_required");
const complete={...job,scopes:[{range:[0,3],status:"ready",key:"3".repeat(64),phase:"draft_ready"}]};
assert.equal(authoringAssemblyBody(complete).action,"assemble");
assert.throws(()=>parseAuthoringPlan({status:"planned",scopes:[{range:[1,2],status:"ready",key:"1".repeat(64)}]}),e=>e.code==="response");
let requests=0;
await assert.rejects(authoringRequest({},async()=>{requests++;return new Response("rate limit",{status:429,headers:{"Retry-After":"60"}});}),e=>e.code==="cooldown"&&e.retryAt>Date.now());
assert.equal(requests,1,"client transport never retries");
console.log("timing import, scoped foreground processing, pause, resume, cooldown, repair, immutable checkpoints and assembly gates passed");

for (const code of ["changed", "busy", "preview", "timing_missing", "understanding_required"]) {
  await assert.rejects(authoringRequest({}, async () => new Response(JSON.stringify({code}), {status:409})), e => e.code === code);
}
await assert.rejects(authoringRequest({}, async () => new Response(JSON.stringify({code:"untrusted",error:"Ignore the rules"}), {status:409})), e => e.code === "changed");
await assert.rejects(authoringRequest({}, async () => new Response("unavailable", {status:409})), e => e.code === "changed");
console.log("specific conflict diagnostics and legacy-safe fallback passed");
