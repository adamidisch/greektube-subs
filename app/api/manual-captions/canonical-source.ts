import { createHash } from "crypto";
import { get } from "@vercel/blob";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";

export type CanonicalImportCue = { start: number; duration: number; text: string };

type OwnerImportManifest = {
  videoId: string;
  transcriptVersion: number;
  cueCount: number;
  sourceHash: string;
};

const OWNER_IMPORT_MANIFESTS: Record<string, OwnerImportManifest> = {
  "fX2z-BF8Jac": {
    videoId: "fX2z-BF8Jac",
    transcriptVersion: 12,
    cueCount: 3086,
    sourceHash: "61c564d0f35b83db04aedffaedd1c808d2b405294f5d8f0799ed36b04ba155a8",
  },
};

export class CanonicalImportSourceError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = "CanonicalImportSourceError";
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function validCue(value: unknown): CanonicalImportCue | null {
  if (!value || typeof value !== "object") return null;
  const cue = value as Record<string, unknown>;
  const start = Number(cue.start);
  const duration = Number(cue.duration);
  const text = normalizeText(cue.text);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0 || !text) return null;
  return { start, duration, text };
}

export function canonicalCueHash(cues: CanonicalImportCue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

async function checkpointEnglish(videoId: string, transcriptVersion: number) {
  const blob = await get(`transcripts/v${transcriptVersion}/checkpoints/${videoId}.json`, { access: "public" });
  if (!blob?.stream) return [] as CanonicalImportCue[];
  const value = await new Response(blob.stream).json() as unknown;
  if (!value || typeof value !== "object") return [] as CanonicalImportCue[];
  const rows = (value as Record<string, unknown>).englishTranscript;
  if (!Array.isArray(rows)) return [] as CanonicalImportCue[];
  const cues = rows.map(validCue);
  if (cues.some(cue => !cue)) return [] as CanonicalImportCue[];
  return cues as CanonicalImportCue[];
}

export async function canonicalEnglishForImport(videoId: string) {
  const manifest = OWNER_IMPORT_MANIFESTS[videoId];
  if (manifest) {
    if (manifest.transcriptVersion !== TRANSCRIPT_VERSION) {
      throw new CanonicalImportSourceError(
        `Το owner import manifest είναι για transcript v${manifest.transcriptVersion}, ενώ το app είναι σε v${TRANSCRIPT_VERSION}.`,
      );
    }
    const cues = await checkpointEnglish(videoId, manifest.transcriptVersion).catch(() => [] as CanonicalImportCue[]);
    if (!cues.length) throw new CanonicalImportSourceError("Το canonical owner checkpoint Blob δεν είναι διαθέσιμο.");
    if (cues.length !== manifest.cueCount) {
      throw new CanonicalImportSourceError(`Το canonical owner source έχει ${cues.length} cues αντί για ${manifest.cueCount}.`);
    }
    const sourceHash = canonicalCueHash(cues);
    if (sourceHash !== manifest.sourceHash) {
      throw new CanonicalImportSourceError("Το canonical owner source hash δεν ταιριάζει με το immutable import manifest.");
    }
    return { cues, sourceHash, manifest, source: "checkpoint-blob" as const };
  }

  const existing = await getTranscript(videoId);
  const serverCues = (existing?.englishTranscript?.length
    ? existing.englishTranscript
    : existing?.rawEnglishTranscript || [])
    .map(validCue);
  if (!serverCues.length || serverCues.some(cue => !cue)) {
    throw new CanonicalImportSourceError("Δεν υπάρχει έγκυρο server-side αγγλικό transcript για strict import.");
  }
  const cues = serverCues as CanonicalImportCue[];
  return { cues, sourceHash: canonicalCueHash(cues), manifest: null, source: "server-state" as const };
}
