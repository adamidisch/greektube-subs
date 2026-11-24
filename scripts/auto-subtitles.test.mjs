import assert from "node:assert/strict";
import fs from "node:fs";
import { captureTokens, sourceCuesFromTokens, evidenceFor, captureHashOf, validateCapture, tokensText, exactSrt } from "../app/api/auto-subtitles/youtube-words.ts";
import { buildPublication } from "../app/api/auto-subtitles/publication.ts";
import { validateAudioEvidence, subtitleSourceWords } from "../app/subtitle-audio-evidence.ts";
import { planWordAuthoring, buildWordAuthoringPacket, advanceWordAuthoring, assembleWordAuthoring } from "../app/api/captions/word-authoring.ts";
import { subtitleTrackForPayload, publishableTrack } from "../app/api/subtitle-track.ts";
import { parseManualSubtitleText } from "../app/api/manual-captions/parser.ts";

const full = JSON.parse(fs.readFileSync(new URL("../public/previews/xYB6uYyRjCA-words.json", import.meta.url), "utf8"));

// Whole Sarah capture: every token is a direct, non-overlapping YouTube word window inside its cue.
{
  const tokens = captureTokens(validateCapture(full, "xYB6uYyRjCA"));
  const source = sourceCuesFromTokens(tokens).map(group => group.cue);
  const evidence = evidenceFor(source, tokens, captureHashOf(full));
  const { tokens: lexical } = validateAudioEvidence(evidence, source);
  assert.equal(lexical.length, tokens.length);
  assert.equal(subtitleSourceWords(source).map(t => t.text).join(" "), tokens.map(t => t.piece.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/u)[0]).join(" "));
  assert.ok(tokens.every((token, i) => token.endMs > token.startMs && (!i || token.startMs >= tokens[i - 1].endMs)));
  assert.ok(source.every(cue => cue.duration > 0 && cue.duration < 30));
  const scopes = planWordAuthoring(source, source.map(c => ({ ...c, text: "" })), evidence, { mainTopic: "fatigue", glossary: [] });
  assert.ok(scopes.length > 150 && scopes.every(scope => scope.status === "ready"), "every scope is ready for translation");
}

// Split words keep each piece tokenizable on its own, so regrouped cues tokenize identically.
{
  const capture = { schema: "youtube-asr-words-v1", videoId: "AAAAAAAAAAA", lang: "en", kind: "asr", capturedAt: "x",
    events: [[0, 9000, Array.from({ length: 60 }, (_, i) => [i * 140, i === 3 ? "fat-burn." : i === 5 ? "5,000" : i === 7 ? "[music]" : `word${i}${i % 9 === 8 ? "." : ""}`, 0])]] };
  const tokens = captureTokens(validateCapture(capture, "AAAAAAAAAAA"));
  assert.ok(!tokens.some(t => /music/.test(t.piece)), "sound tags are not speech");
  const fat = tokens.filter(t => t.wordIndex === 3);
  assert.deepEqual(fat.map(t => t.piece), ["fat-", "burn."]);
  assert.equal(tokensText(fat), "fat-burn.");
  assert.deepEqual(tokens.filter(t => t.wordIndex === 5).map(t => t.piece), ["5,", "000"]);
}

// End to end on the first ~2 minutes with a fake provider: plan → translate → review → assemble → publish package.
{
  const capture = { ...full, events: full.events.filter(event => event[0] < 120_000) };
  const tokens = captureTokens(capture);
  const source = sourceCuesFromTokens(tokens).map(group => group.cue);
  const evidence = evidenceFor(source, tokens, captureHashOf(capture));
  const translation = source.map(c => ({ ...c, text: "" }));
  const brief = { mainTopic: "Sarah Myhill on fatigue and thyroid", glossary: [] };
  const scopes = planWordAuthoring(source, translation, evidence, brief);
  let calls = 0; const repairs = [];
  const fake = async (system, input) => {
    calls++;
    if (input.finalEvents) return { status: "approved", candidateHash: input.candidateHash, reviewedEventIds: input.finalEvents.map(e => e.eventId), findings: [] };
    if (input.phrases && input.maxChars === undefined && !input.words) {
      repairs.push(input.issue);
      return { phrases: input.phrases.map(p => ({ ...p, text: Array.from(p.text).slice(0, p.maxChars - 1).join("").trim() + "." })) };
    }
    // One phrase per source cue; short Greek that keeps the cue's numbers.
    const groups = [];
    for (const word of input.words) {
      const last = groups.at(-1);
      if (last && last[0].cueIndex === word.cueIndex && word.endMs - last[0].startMs < 3000) last.push(word); else groups.push([word]);
    }
    return { phrases: groups.map(words => {
      const seconds = (words.at(-1).endMs - words[0].startMs) / 1000;
      const numbers = words.map(w => w.text).filter(t => /\d/.test(t));
      const english = words.map(w => w.text.toLowerCase()).join(" ");
      const base = ["Ναι", ...numbers, ...(english.includes("underactive thyroid") ? ["υποθυρεοειδισμός"] : [])].join(" ");
      const filler = "λόγια ".repeat(Math.max(0, Math.floor((seconds * 11 - base.length) / 6)));
      return { firstWordId: words[0].wordId, lastWordId: words.at(-1).wordId, text: `${base} ${filler}`.trim() + ".", hardBreakBefore: false };
    }) };
  };
  const results = [];
  for (const scope of scopes) {
    const packet = buildWordAuthoringPacket(source, translation, evidence, scope.range, brief);
    const cache = {};
    let result;
    for (let i = 0; i < 6 && result?.status !== "draft_ready"; i++) result = await advanceWordAuthoring(packet, cache, fake, async () => {}, { repairRounds: 2 });
    assert.equal(result.status, "draft_ready");
    results.push(result);
  }
  assert.ok(calls >= scopes.length * 2);
  if (repairs.length) console.log("budget repairs:", repairs.length, repairs[0]);
  assert.throws(() => assembleWordAuthoring(source, translation, evidence, results), /Numeric/);
  const track = assembleWordAuthoring(source, translation, evidence, results, { numbers: false });
  const built = buildPublication(track.events, tokens, captureHashOf(capture), "deepseek-v4-pro");
  assert.ok(!built.issues, JSON.stringify(built.issues?.slice(0, 2)));
  assert.equal(built.reviewed.approvalLevel, "auto_checked");
  assert.equal(built.english.length, track.events.length);
  assert.ok(publishableTrack(built.reviewed, "auto_checked"));
  const englishCues = parseManualSubtitleText(built.englishSrt), cues = parseManualSubtitleText(built.greekSrt);
  const served = subtitleTrackForPayload({ cues, englishCues, subtitleTrack: JSON.parse(JSON.stringify(built.reviewed)) });
  assert.equal(served.origin, "authored");
  assert.equal(served.approvalLevel, "auto_checked");
  assert.equal(served.events.length, track.events.length);
  // A changed Greek line invalidates the automatic approval.
  const tampered = cues.map((cue, i) => i === 3 ? { ...cue, text: cue.text + " x" } : cue);
  assert.equal(subtitleTrackForPayload({ cues: tampered, englishCues, subtitleTrack: built.reviewed }).origin, "legacy");
  // Numbers that do not survive translation hold the video instead of publishing it.
  const numbered = track.events.findIndex((event, i) => /\d/.test(built.english[i].text));
  if (numbered >= 0) {
    const broken = track.events.map((event, i) => i === numbered ? { ...event, text: event.text.replace(/\d+/u, "") } : event);
    assert.ok(buildPublication(broken, tokens, captureHashOf(capture), "m").issues?.length);
  }
  assert.ok(exactSrt(built.english).startsWith("1\n"));
}

console.log("automatic subtitles: YouTube words, source cues, scopes, fake translation, auto_checked publication and gates passed");
