import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { database } from "@/db/postgres";
import {
  completeTranscript,
  getTranscript,
  TRANSCRIPT_VERSION,
  type CachedCue,
  type TranscriptRecord,
} from "../shared-cache";
import { publishTranscript, publishTranscriptCheckpoint, readPublishedTranscript, readTranscriptCheckpoint } from "../transcript-blob";
import { numberTokensMatch } from "../captions/numeric-integrity";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../manual-captions/parser";

export type OwnerTranslationStatus = "frozen" | "validated" | "published";

export type OwnerTranslationManifest = {
  videoId: string;
  revision: number;
  transcriptVersion: number;
  cueCount: number;
  sourceHash: string;
  timestampHash: string;
  sourceBlobPath: string;
  greekDraftBlobPath: string | null;
  greekDraftHash: string | null;
  status: OwnerTranslationStatus;
  translationMode: "owner";
  translationMethod: "manual_chatgpt_pro_v1";
  validation: OwnerValidation | null;
  ownerLockedAt: string;
  validatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerValidation = {
  ok: boolean;
  cueCount: number;
  expectedCueCount: number;
  timestampMismatches: number;
  numericMismatches: number;
  emptyCues: number;
  greekRatio: number;
  sourceHash: string;
  timestampHash: string;
};

type ManifestRow = {
  video_id: string;
  revision: number;
  transcript_version: number;
  cue_count: number;
  source_hash: string;
  timestamp_hash: string;
  source_blob_path: string;
  greek_draft_blob_path: string | null;
  greek_draft_hash: string | null;
  status: OwnerTranslationStatus;
  translation_mode: "owner";
  translation_method: "manual_chatgpt_pro_v1";
  validation_json: string | null;
  owner_locked_at: string;
  validated_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type SourcePayload = {
  videoId: string;
  revision: number;
  transcriptVersion: number;
  cueCount: number;
  sourceHash: string;
  timestampHash: string;
  cues: CachedCue[];
  createdAt: string;
};

type DraftPayload = {
  videoId: string;
  revision: number;
  transcriptVersion: number;
  sourceHash: string;
  timestampHash: string;
  greekHash: string;
  cues: CachedCue[];
  validatedAt: string;
};

let ownerTableReady: Promise<void> | null = null;

export function ensureOwnerTranslationTable() {
  if (ownerTableReady) return ownerTableReady;
  ownerTableReady = (async () => {
    const db = database();
    await db.query(`CREATE TABLE IF NOT EXISTS owner_translation_manifests (
      video_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      transcript_version INTEGER NOT NULL,
      cue_count INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      timestamp_hash TEXT NOT NULL,
      source_blob_path TEXT NOT NULL,
      greek_draft_blob_path TEXT,
      greek_draft_hash TEXT,
      status TEXT NOT NULL DEFAULT 'frozen',
      translation_mode TEXT NOT NULL DEFAULT 'owner',
      translation_method TEXT NOT NULL DEFAULT 'manual_chatgpt_pro_v1',
      validation_json TEXT,
      owner_locked_at TEXT NOT NULL,
      validated_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (video_id, revision)
    )`);
    await db.query("CREATE INDEX IF NOT EXISTS owner_translation_video_status_idx ON owner_translation_manifests (video_id, status, revision DESC)");
  })().catch((error: unknown) => {
    ownerTableReady = null;
    throw error;
  });
  return ownerTableReady;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeCue(value: unknown): CachedCue | null {
  if (!value || typeof value !== "object") return null;
  const cue = value as Record<string, unknown>;
  const start = Number(cue.start);
  const duration = Number(cue.duration);
  const text = normalizeText(cue.text);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0 || !text) return null;
  return { start, duration, text };
}

export function ownerSourceHash(cues: CachedCue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  return hash.digest("hex");
}

export function ownerTimestampHash(cues: CachedCue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}\n`);
  return hash.digest("hex");
}

function greekRatio(cues: CachedCue[]) {
  const sample = cues.slice(0, 200).map(cue => cue.text).join(" ");
  const letters = sample.match(/\p{L}/gu)?.length || 0;
  const greek = sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

function parseValidation(value: string | null): OwnerValidation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as OwnerValidation;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function rowToManifest(row: ManifestRow): OwnerTranslationManifest {
  return {
    videoId: row.video_id,
    revision: Number(row.revision),
    transcriptVersion: Number(row.transcript_version),
    cueCount: Number(row.cue_count),
    sourceHash: row.source_hash,
    timestampHash: row.timestamp_hash,
    sourceBlobPath: row.source_blob_path,
    greekDraftBlobPath: row.greek_draft_blob_path,
    greekDraftHash: row.greek_draft_hash,
    status: row.status,
    translationMode: "owner",
    translationMethod: "manual_chatgpt_pro_v1",
    validation: parseValidation(row.validation_json),
    ownerLockedAt: row.owner_locked_at,
    validatedAt: row.validated_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOwnerTranslationManifest(videoId: string) {
  await ensureOwnerTranslationTable();
  const db = database();
  const rows = await db.query(
    `SELECT video_id,revision,transcript_version,cue_count,source_hash,timestamp_hash,source_blob_path,
      greek_draft_blob_path,greek_draft_hash,status,translation_mode,translation_method,validation_json,
      owner_locked_at,validated_at,published_at,created_at,updated_at
     FROM owner_translation_manifests WHERE video_id=$1 ORDER BY revision DESC LIMIT 1`,
    [videoId],
  ) as ManifestRow[];
  return rows[0] ? rowToManifest(rows[0]) : null;
}

export async function hasOwnerTranslationLock(videoId: string) {
  try {
    const manifest = await getOwnerTranslationManifest(videoId);
    return Boolean(manifest);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "42P01") return false;
    throw error;
  }
}

function sourcePath(videoId: string, revision: number, sourceHash: string) {
  return `owner-translations/v${TRANSCRIPT_VERSION}/${videoId}/r${revision}/source-${sourceHash}.json`;
}

function draftPath(videoId: string, revision: number, greekHash: string) {
  return `owner-translations/v${TRANSCRIPT_VERSION}/${videoId}/r${revision}/draft-${greekHash}.json`;
}

async function writeJson(pathname: string, payload: unknown) {
  await put(pathname, JSON.stringify(payload), {
    access: "public" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });
}

async function readJson(pathname: string) {
  const blob = await get(pathname, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

async function readSource(manifest: OwnerTranslationManifest) {
  const value = await readJson(manifest.sourceBlobPath);
  if (!value || typeof value !== "object") throw new Error("Το frozen canonical source δεν είναι διαθέσιμο.");
  const payload = value as Partial<SourcePayload>;
  if (payload.videoId !== manifest.videoId || payload.revision !== manifest.revision || payload.transcriptVersion !== manifest.transcriptVersion || !Array.isArray(payload.cues)) {
    throw new Error("Το frozen canonical source δεν ταιριάζει με το manifest.");
  }
  const cues = payload.cues.map(normalizeCue);
  if (cues.some(cue => !cue)) throw new Error("Το frozen canonical source περιέχει μη έγκυρα cues.");
  const normalized = cues as CachedCue[];
  if (normalized.length !== manifest.cueCount || ownerSourceHash(normalized) !== manifest.sourceHash || ownerTimestampHash(normalized) !== manifest.timestampHash) {
    throw new Error("Το frozen canonical source απέτυχε στο integrity check.");
  }
  return normalized;
}

async function claimOwnerLease(videoId: string, token: string) {
  const db = database();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 120_000).toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET lock_token=$1, lock_expires_at=$2, updated_at=$3
     WHERE video_id=$4 AND (lock_token IS NULL OR lock_expires_at IS NULL OR lock_expires_at<$3)
     RETURNING video_id`,
    [token, expires, now, videoId],
  ) as { video_id: string }[];
  return rows.length === 1;
}

async function releaseOwnerLease(videoId: string, token: string) {
  const db = database();
  await db.query(
    "UPDATE video_transcripts SET lock_token=NULL, lock_expires_at=NULL, updated_at=$1 WHERE video_id=$2 AND lock_token=$3",
    [new Date().toISOString(), videoId, token],
  );
}

export async function freezeOwnerSource(videoId: string, newRevision = false) {
  await ensureOwnerTranslationTable();
  const existingManifest = await getOwnerTranslationManifest(videoId);
  if (existingManifest && !newRevision) return { manifest: existingManifest, created: false };

  const token = crypto.randomUUID();
  if (!await claimOwnerLease(videoId, token)) throw new Error("Το βίντεο επεξεργάζεται αυτή τη στιγμή. Περίμενε να ολοκληρωθεί το τρέχον processing slice και ξαναπάτησε Freeze Source.");

  try {
    const transcript = await getTranscript(videoId);
    if (!transcript) throw new Error("Δεν υπάρχει server-side transcript για να γίνει freeze.");
    const source = (transcript.englishTranscript.length ? transcript.englishTranscript : transcript.rawEnglishTranscript).map(normalizeCue);
    if (!source.length || source.some(cue => !cue)) throw new Error("Δεν υπάρχει έγκυρο canonical English transcript για freeze.");
    const cues = source as CachedCue[];
    const sourceHash = ownerSourceHash(cues);
    const timestampHash = ownerTimestampHash(cues);
    const revision = existingManifest ? existingManifest.revision + 1 : 1;
    const now = new Date().toISOString();
    const pathname = sourcePath(videoId, revision, sourceHash);
    const payload: SourcePayload = { videoId, revision, transcriptVersion: TRANSCRIPT_VERSION, cueCount: cues.length, sourceHash, timestampHash, cues, createdAt: now };
    await writeJson(pathname, payload);

    const db = database();
    await db.query(
      `INSERT INTO owner_translation_manifests (
        video_id,revision,transcript_version,cue_count,source_hash,timestamp_hash,source_blob_path,status,
        translation_mode,translation_method,owner_locked_at,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'frozen','owner','manual_chatgpt_pro_v1',$8,$8,$8)
      ON CONFLICT(video_id,revision) DO NOTHING`,
      [videoId, revision, TRANSCRIPT_VERSION, cues.length, sourceHash, timestampHash, pathname, now],
    );
    const manifest = await getOwnerTranslationManifest(videoId);
    if (!manifest) throw new Error("Το owner manifest δεν αποθηκεύτηκε.");
    return { manifest, created: true };
  } finally {
    await releaseOwnerLease(videoId, token).catch(() => undefined);
  }
}

export function cuesToSrt(cues: CachedCue[]) {
  const time = (seconds: number) => {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const sec = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const min = totalMinutes % 60;
    const hour = Math.floor(totalMinutes / 60);
    return `${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
  };
  return cues.map((cue, index) => `${index + 1}\n${time(cue.start)} --> ${time(cue.start + cue.duration)}\n${cue.text}\n`).join("\n");
}

export async function ownerTranslationPackage(videoId: string) {
  const manifest = await getOwnerTranslationManifest(videoId);
  if (!manifest) throw new Error("Κάνε πρώτα Freeze Source.");
  const cues = await readSource(manifest);
  return {
    manifest: {
      videoId: manifest.videoId,
      transcriptVersion: manifest.transcriptVersion,
      revision: manifest.revision,
      cueCount: manifest.cueCount,
      sourceHash: manifest.sourceHash,
      timestampHash: manifest.timestampHash,
      translationMode: manifest.translationMode,
      translationMethod: manifest.translationMethod,
      createdAt: manifest.createdAt,
    },
    sourceSrt: cuesToSrt(cues),
  };
}

export async function validateOwnerGreek(videoId: string, subtitleText: string) {
  if (subtitleText.length > 2_000_000) throw new Error("Το ελληνικό SRT είναι υπερβολικά μεγάλο.");
  const manifest = await getOwnerTranslationManifest(videoId);
  if (!manifest) throw new Error("Κάνε πρώτα Freeze Source.");
  if (manifest.status === "published") throw new Error("Αυτή η owner revision έχει ήδη δημοσιευτεί.");
  const source = await readSource(manifest);
  const greek = parseManualSubtitleText(subtitleText).map(normalizeCue);
  if (!greek.length || greek.some(cue => !cue) || !hasValidManualCueTimings(greek as CachedCue[])) throw new Error("Το ελληνικό SRT δεν περιέχει έγκυρα timed cues.");
  const cues = greek as CachedCue[];
  const tolerance = 0.002;
  let timestampMismatches = 0;
  let numericMismatches = 0;
  let emptyCues = 0;
  for (let index = 0; index < Math.min(cues.length, source.length); index += 1) {
    const target = cues[index];
    const original = source[index];
    if (!target.text.trim()) emptyCues += 1;
    if (Math.abs(target.start - original.start) > tolerance || Math.abs(target.duration - original.duration) > tolerance) timestampMismatches += 1;
    if (!numberTokensMatch(original.text, target.text)) numericMismatches += 1;
  }
  const ratio = greekRatio(cues);
  const validation: OwnerValidation = {
    ok: cues.length === manifest.cueCount && timestampMismatches === 0 && numericMismatches === 0 && emptyCues === 0 && ratio >= 0.2,
    cueCount: cues.length,
    expectedCueCount: manifest.cueCount,
    timestampMismatches,
    numericMismatches,
    emptyCues,
    greekRatio: ratio,
    sourceHash: manifest.sourceHash,
    timestampHash: manifest.timestampHash,
  };
  if (!validation.ok) return { manifest, validation };

  const greekHash = ownerSourceHash(cues);
  const path = draftPath(videoId, manifest.revision, greekHash);
  const now = new Date().toISOString();
  const draft: DraftPayload = {
    videoId,
    revision: manifest.revision,
    transcriptVersion: manifest.transcriptVersion,
    sourceHash: manifest.sourceHash,
    timestampHash: manifest.timestampHash,
    greekHash,
    cues,
    validatedAt: now,
  };
  await writeJson(path, draft);
  const db = database();
  await db.query(
    `UPDATE owner_translation_manifests SET greek_draft_blob_path=$1,greek_draft_hash=$2,status='validated',validation_json=$3,validated_at=$4,updated_at=$4
     WHERE video_id=$5 AND revision=$6 AND source_hash=$7 AND status!='published'`,
    [path, greekHash, JSON.stringify(validation), now, videoId, manifest.revision, manifest.sourceHash],
  );
  const updated = await getOwnerTranslationManifest(videoId);
  return { manifest: updated || manifest, validation };
}

async function readDraft(manifest: OwnerTranslationManifest) {
  if (!manifest.greekDraftBlobPath || !manifest.greekDraftHash) throw new Error("Δεν υπάρχει validated Greek draft.");
  const value = await readJson(manifest.greekDraftBlobPath);
  if (!value || typeof value !== "object") throw new Error("Το validated Greek draft δεν είναι διαθέσιμο.");
  const payload = value as Partial<DraftPayload>;
  if (payload.videoId !== manifest.videoId || payload.revision !== manifest.revision || payload.transcriptVersion !== manifest.transcriptVersion || payload.sourceHash !== manifest.sourceHash || payload.timestampHash !== manifest.timestampHash || payload.greekHash !== manifest.greekDraftHash || !Array.isArray(payload.cues)) {
    throw new Error("Το validated Greek draft δεν ταιριάζει με το active manifest.");
  }
  const cues = payload.cues.map(normalizeCue);
  if (cues.some(cue => !cue)) throw new Error("Το validated Greek draft περιέχει μη έγκυρα cues.");
  const normalized = cues as CachedCue[];
  if (normalized.length !== manifest.cueCount || ownerSourceHash(normalized) !== manifest.greekDraftHash) throw new Error("Το validated Greek draft απέτυχε στο integrity check.");
  return normalized;
}

export async function publishOwnerTranslation(videoId: string) {
  const manifest = await getOwnerTranslationManifest(videoId);
  if (!manifest) throw new Error("Δεν υπάρχει owner manifest.");
  if (manifest.status === "published") return { manifest, alreadyPublished: true };
  if (manifest.status !== "validated" || !manifest.validation?.ok) throw new Error("Η μετάφραση πρέπει πρώτα να περάσει Validate.");

  const english = await readSource(manifest);
  const greek = await readDraft(manifest);
  const existing = await getTranscript(videoId);
  if (!existing) throw new Error("Το transcript record δεν υπάρχει.");

  const token = crypto.randomUUID();
  if (!await claimOwnerLease(videoId, token)) throw new Error("Το βίντεο επεξεργάζεται ήδη. Το Publish δεν ξεκίνησε.");

  const previousPublished = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true).catch(() => null);
  const previousCheckpoint = await readTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, true).catch(() => null);
  const now = new Date().toISOString();
  let committed = false;
  try {
    const duration = Math.max(existing.duration || 0, ...greek.map(cue => cue.start + cue.duration));
    const finalPayload = {
      status: "ready",
      progress: 100,
      videoId,
      title: existing.title,
      channel: existing.channel,
      duration,
      transcriptVersion: TRANSCRIPT_VERSION,
      cues: greek,
      englishCues: english,
    };
    if (!await publishTranscript(videoId, TRANSCRIPT_VERSION, finalPayload)) throw new Error("Η εγγραφή των final Blob artifacts απέτυχε.");

    const record: TranscriptRecord = {
      ...existing,
      duration,
      rawEnglishTranscript: existing.rawEnglishTranscript.length ? existing.rawEnglishTranscript : english,
      englishTranscript: english,
      greekTranscript: greek,
      timestamps: greek.map(cue => ({ start: cue.start, duration: cue.duration })),
      status: "ready",
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      error: null,
      processingStage: null,
      processingCursor: 0,
      retryCount: 0,
      retryAfter: null,
      updatedAt: now,
    };
    if (!await completeTranscript(record, token)) throw new Error("Το guarded Neon switch απέτυχε.");
    committed = true;

    const db = database();
    await db.query(
      `UPDATE owner_translation_manifests SET status='published',published_at=$1,updated_at=$1
       WHERE video_id=$2 AND revision=$3 AND source_hash=$4 AND status='validated'`,
      [now, videoId, manifest.revision, manifest.sourceHash],
    );
    const updated = await getOwnerTranslationManifest(videoId);
    return { manifest: updated || manifest, alreadyPublished: false };
  } catch (error) {
    if (!committed) {
      if (previousPublished) await publishTranscript(videoId, TRANSCRIPT_VERSION, previousPublished).catch(() => undefined);
      if (previousCheckpoint) await publishTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, previousCheckpoint).catch(() => undefined);
      await releaseOwnerLease(videoId, token).catch(() => undefined);
    }
    throw error;
  }
}
