export type TranslationCheckpointMode = "legacy" | "google";

export const GOOGLE_TRANSLATION_BATCH_SIZE = 18;
export const LEGACY_TRANSLATION_BATCH_SIZE = 4;
export const GOOGLE_PROCESSING_RETRY_AFTER_SECONDS = 0.25;

export function shouldPersistTranslationCheckpoint(
  mode: TranslationCheckpointMode,
  nextCursor: number,
  batchEnd: number,
) {
  return mode !== "google" || nextCursor >= batchEnd;
}

export function processingRetryAfterSeconds(mode: TranslationCheckpointMode) {
  return mode === "google" ? GOOGLE_PROCESSING_RETRY_AFTER_SECONDS : 1;
}
