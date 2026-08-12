import assert from "node:assert/strict";
import fs from "node:fs";
import {
  GOOGLE_PROCESSING_RETRY_AFTER_SECONDS,
  GOOGLE_TRANSLATION_BATCH_SIZE,
  LEGACY_TRANSLATION_BATCH_SIZE,
  processingRetryAfterSeconds,
  shouldPersistTranslationCheckpoint,
} from "../app/api/captions/checkpoint-policy.ts";

function checkpointWrites(totalCues, mode, batchSize) {
  let writes = 0;
  for (let start = 0; start < totalCues; start += batchSize) {
    const end = Math.min(totalCues, start + batchSize);
    for (let nextCursor = start + 1; nextCursor <= end; nextCursor += 1) {
      if (shouldPersistTranslationCheckpoint(mode, nextCursor, end)) writes += 1;
    }
  }
  return writes;
}

assert.equal(GOOGLE_TRANSLATION_BATCH_SIZE, 18);
assert.equal(LEGACY_TRANSLATION_BATCH_SIZE, 4);
assert.equal(checkpointWrites(542, "google", GOOGLE_TRANSLATION_BATCH_SIZE), 31);
assert.equal(checkpointWrites(542, "legacy", LEGACY_TRANSLATION_BATCH_SIZE), 542);
assert.equal(shouldPersistTranslationCheckpoint("google", 17, 18), false);
assert.equal(shouldPersistTranslationCheckpoint("google", 18, 18), true);
assert.equal(processingRetryAfterSeconds("google"), GOOGLE_PROCESSING_RETRY_AFTER_SECONDS);
assert.equal(processingRetryAfterSeconds("legacy"), 1);

const route = fs.readFileSync("app/api/captions/route.ts", "utf8");
const player = fs.readFileSync("app/GreekTubePlayer.tsx", "utf8");
assert.match(route, /checkpointWrites: number/);
assert.match(route, /const batchEnd = Math\.min\(english\.length, cursor \+ CHUNK\)/);
assert.match(route, /shouldPersistTranslationCheckpoint\(translationMode, nextCursor, batchEnd\)/);
assert.match(route, /google_fast_context_v2/);
assert.match(player, /Math\.max\(\.25,Number\(response\.headers\.get\("Retry-After"\)\)\|\|1\)/);

console.log("Google fast checkpoint policy passed: 542 cues use 31 writes instead of 542");
