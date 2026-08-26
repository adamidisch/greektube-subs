from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


@dataclass(frozen=True)
class TimingJob:
    job_id: str
    video_id: str
    transcript_version: int
    source_hash: str
    source_cues: list[dict[str, Any]]
    attempt_count: int
    max_attempts: int
    input_kind: str
    media_url: str | None
    media_size_bytes: int | None
    media_expires_at: datetime | None
    media_cleanup_token: str | None


class TimingRepository:
    def __init__(self, database_url: str, worker_id: str, lease_seconds: int):
        self.database_url = database_url
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def claim_next_job(self) -> TimingJob | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH candidate AS (
                      SELECT job_id
                      FROM audio_timing_jobs
                      WHERE attempt_count < max_attempts
                        AND (retry_after IS NULL OR retry_after <= NOW())
                        AND (
                          status = 'queued'
                          OR (status = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
                        )
                      ORDER BY created_at
                      FOR UPDATE SKIP LOCKED
                      LIMIT 1
                    )
                    UPDATE audio_timing_jobs AS job
                    SET status='processing', stage='claimed', progress=GREATEST(job.progress,1),
                        attempt_count=job.attempt_count+1, locked_by=%s,
                        lease_expires_at=NOW()+(%s * INTERVAL '1 second'), heartbeat_at=NOW(),
                        retry_after=NULL, error_code=NULL, error_message=NULL, updated_at=NOW()
                    FROM candidate
                    WHERE job.job_id=candidate.job_id
                    RETURNING job.job_id::text,job.video_id,job.transcript_version,job.source_hash,
                              job.source_cues,job.attempt_count,job.max_attempts,job.input_kind,
                              job.media_url,job.media_size_bytes,job.media_expires_at,job.media_cleanup_token
                    """,
                    (self.worker_id, self.lease_seconds),
                )
                row = cursor.fetchone()
        if not row:
            return None
        return TimingJob(
            job_id=row["job_id"],
            video_id=row["video_id"],
            transcript_version=int(row["transcript_version"]),
            source_hash=row["source_hash"],
            source_cues=list(row["source_cues"]),
            attempt_count=int(row["attempt_count"]),
            max_attempts=int(row["max_attempts"]),
            input_kind=str(row["input_kind"]),
            media_url=row["media_url"],
            media_size_bytes=int(row["media_size_bytes"]) if row["media_size_bytes"] is not None else None,
            media_expires_at=row["media_expires_at"],
            media_cleanup_token=row["media_cleanup_token"],
        )

    def heartbeat(self, job_id: str, stage: str, progress: int, worker_version: str) -> bool:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE audio_timing_jobs
                    SET stage=%s,progress=GREATEST(progress,%s),heartbeat_at=NOW(),
                        lease_expires_at=NOW()+(%s * INTERVAL '1 second'),worker_version=%s,updated_at=NOW()
                    WHERE job_id=%s::uuid AND status='processing' AND locked_by=%s
                    RETURNING job_id
                    """,
                    (stage, max(0, min(99, progress)), self.lease_seconds, worker_version, job_id, self.worker_id),
                )
                return cursor.fetchone() is not None

    def complete(self, job: TimingJob, artifact: dict[str, Any], worker_version: str) -> None:
        artifact_id = str(uuid4())
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO audio_timing_artifacts(
                      artifact_id,video_id,transcript_version,source_hash,timing_version,timing_source,
                      engine,engine_version,model,language,duration_ms,word_count,word_timeline,
                      prosody_map,validation_json,worker_version,proof_alignment,proof_srt,proof_audit
                    ) VALUES(
                      %s::uuid,%s,%s,%s,%s,'whisperx_audio',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                    )
                    ON CONFLICT(video_id,transcript_version,source_hash,timing_version) DO NOTHING
                    """,
                    (
                        artifact_id,
                        job.video_id,
                        job.transcript_version,
                        job.source_hash,
                        artifact["timing_version"],
                        artifact["engine"],
                        artifact["engine_version"],
                        artifact["model"],
                        artifact["language"],
                        artifact["duration_ms"],
                        artifact["word_count"],
                        Jsonb(artifact["word_timeline"]),
                        Jsonb(artifact["prosody_map"]),
                        Jsonb(artifact["validation"]),
                        worker_version,
                        Jsonb(artifact["proof_alignment"]) if artifact.get("proof_alignment") else None,
                        artifact.get("proof_srt"),
                        Jsonb(artifact["proof_audit"]) if artifact.get("proof_audit") else None,
                    ),
                )
                cursor.execute(
                    """
                    UPDATE audio_timing_jobs
                    SET status='ready',stage='complete',progress=100,locked_by=NULL,lease_expires_at=NULL,
                        heartbeat_at=NOW(),worker_version=%s,updated_at=NOW(),completed_at=NOW()
                    WHERE job_id=%s::uuid AND status='processing' AND locked_by=%s
                    RETURNING job_id
                    """,
                    (worker_version, job.job_id, self.worker_id),
                )
                if cursor.fetchone() is None:
                    raise RuntimeError("Job lease was lost before completion")

    def fail(self, job: TimingJob, error: Exception, permanent: bool = False) -> bool:
        retry_delay = min(300, 15 * (2 ** max(0, job.attempt_count - 1)))
        retry_at = datetime.now(timezone.utc) + timedelta(seconds=retry_delay)
        error_code = type(error).__name__[:80]
        message = str(error)[:1000]
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE audio_timing_jobs
                    SET status=CASE WHEN %s OR attempt_count>=max_attempts THEN 'failed' ELSE 'queued' END,
                        stage=CASE WHEN %s OR attempt_count>=max_attempts THEN 'failed' ELSE 'retry_wait' END,
                        retry_after=CASE WHEN %s OR attempt_count>=max_attempts THEN NULL ELSE %s END,
                        locked_by=NULL,lease_expires_at=NULL,error_code=%s,error_message=%s,updated_at=NOW()
                    WHERE job_id=%s::uuid AND locked_by=%s
                    RETURNING status
                    """,
                    (permanent, permanent, permanent, retry_at, error_code, message, job.job_id, self.worker_id),
                )
                row = cursor.fetchone()
                return bool(row and row["status"] == "failed")
