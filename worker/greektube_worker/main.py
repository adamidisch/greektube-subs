from __future__ import annotations

import json
import logging
import signal
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from urllib.request import Request, urlopen

from . import __version__
from .alignment import build_word_timeline
from .config import Settings
from .engine import WhisperXEngine
from .models import SourceCue, source_cues_hash
from .prosody import build_prosody_map
from .proof import render_proof, srt_text
from .repository import TimingJob, TimingRepository
from .validation import validate_artifact


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("greektube-worker")
STOP = threading.Event()
HEALTH: dict[str, Any] = {"ok": True, "worker_version": __version__, "state": "starting"}


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        status = 200 if HEALTH.get("ok") else 503
        payload = json.dumps(HEALTH).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        return


class Heartbeat:
    def __init__(self, repository: TimingRepository, job: TimingJob, seconds: int):
        self.repository = repository
        self.job = job
        self.seconds = seconds
        self.stage = "claimed"
        self.progress = 1
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def update(self, stage: str, progress: int):
        self.stage = stage
        self.progress = progress
        if not self.repository.heartbeat(self.job.job_id, stage, progress, __version__):
            raise RuntimeError("Job lease was lost")

    def _run(self):
        while not self.stop_event.wait(self.seconds):
            try:
                if not self.repository.heartbeat(self.job.job_id, self.stage, self.progress, __version__):
                    LOGGER.error("Heartbeat lost lease for job %s", self.job.job_id)
                    return
            except Exception:
                LOGGER.exception("Heartbeat failed for job %s", self.job.job_id)

    def close(self):
        self.stop_event.set()
        self.thread.join(timeout=2)


def _validated_source_cues(job: TimingJob) -> list[SourceCue]:
    cues = [SourceCue.from_dict(value) for value in job.source_cues]
    if not cues:
        raise ValueError("Job has no source cues")
    for index, cue in enumerate(cues):
        if cue.cue_id <= 0 or cue.start_ms < 0 or cue.end_ms <= cue.start_ms or not cue.text.strip():
            raise ValueError(f"Invalid source cue at index {index}")
        if index and cue.cue_id <= cues[index - 1].cue_id:
            raise ValueError("Source cue ids are not strictly increasing")
    if source_cues_hash(cues) != job.source_hash:
        raise ValueError("Source cue hash does not match the queued job")
    return cues


def _cleanup_uploaded_media(job: TimingJob, settings: Settings) -> None:
    if job.input_kind != "uploaded_media":
        return
    if not settings.cleanup_url or not job.media_cleanup_token:
        LOGGER.error("Temporary media cleanup is not configured for job %s", job.job_id)
        return
    payload = json.dumps({"jobId": job.job_id, "cleanupToken": job.media_cleanup_token}).encode("utf-8")
    request = Request(
        settings.cleanup_url,
        data=payload,
        method="DELETE",
        headers={"Content-Type": "application/json", "User-Agent": "GreekTube-Audio-Timing-Worker/1"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Cleanup endpoint returned HTTP {response.status}")
        LOGGER.info("Deleted temporary media for job %s", job.job_id)
    except Exception:
        LOGGER.exception("Temporary media cleanup failed for job %s", job.job_id)


def _format_srt_time(value: int) -> str:
    value = max(0, round(value))
    hours, remainder = divmod(value, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _proof_payload(job: TimingJob, timeline: list[dict[str, Any]], prosody_map: list[dict[str, Any]], duration_ms: int, validation_ok: bool):
    if job.video_id != "D2RjneeG_xA":
        return None, None, None
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "D2RjneeG_xA-v8-alignment.json"
    alignment = json.loads(fixture.read_text(encoding="utf-8"))
    proof_alignment, proof_audit = render_proof(alignment, timeline, prosody_map, duration_ms)
    proof_audit["timing_validation_ok"] = validation_ok
    proof_audit["final_output_allowed"] = bool(proof_audit["final_output_allowed"] and validation_ok)
    proof_srt = srt_text(proof_alignment["units"], _format_srt_time) if proof_audit["final_output_allowed"] else None
    return proof_alignment, proof_srt, proof_audit


def process_job(
    repository: TimingRepository,
    engine: WhisperXEngine,
    settings: Settings,
    job: TimingJob,
    single_attempt: bool = False,
):
    heartbeat = Heartbeat(repository, job, settings.heartbeat_seconds)
    heartbeat.start()
    HEALTH.update({"state": "processing", "job_id": job.job_id, "video_id": job.video_id})
    try:
        cues = _validated_source_cues(job)
        with TemporaryDirectory(prefix=f"gts-{job.video_id}-") as temporary:
            if job.input_kind == "uploaded_media":
                if not job.media_url or not job.media_size_bytes or not job.media_expires_at:
                    raise ValueError("Uploaded media metadata is incomplete")
                if job.media_expires_at <= datetime.now(timezone.utc):
                    raise ValueError("Uploaded media has expired")
                heartbeat.update("download_uploaded_media", 8)
                audio_path, duration_ms = engine.download_uploaded_media(job.media_url, job.media_size_bytes, Path(temporary))
            else:
                heartbeat.update("download_audio", 8)
                audio_path, duration_ms = engine.download_audio(job.video_id, Path(temporary))
            heartbeat.update("whisperx_transcribe", 30)
            aligned_result = engine.transcribe_and_align(audio_path)
            heartbeat.update("source_word_alignment", 78)
            timeline, asr_words = build_word_timeline(cues, aligned_result)
            heartbeat.update("prosody_map", 88)
            prosody_map = build_prosody_map(timeline)
            if duration_ms <= 0:
                duration_ms = max((word.end_ms or 0 for word in timeline), default=0)
            validation = validate_artifact(
                timeline,
                prosody_map,
                duration_ms,
                min_direct_alignment_ratio=settings.min_direct_alignment_ratio,
                max_unaligned_ratio=settings.max_unaligned_ratio,
            )
            validation["asr_word_count"] = len(asr_words)
            validation["source_cue_count"] = len(cues)
            word_timeline = [word.to_dict() for word in timeline]
            proof_alignment, proof_srt, proof_audit = _proof_payload(
                job,
                word_timeline,
                prosody_map,
                duration_ms,
                bool(validation["ok"]),
            )
            artifact = {
                "timing_version": 1,
                "engine": engine.engine_name,
                "engine_version": engine.engine_version,
                "model": settings.whisper_model,
                "language": str(aligned_result.get("language") or settings.language),
                "duration_ms": duration_ms,
                "word_count": len(timeline),
                "word_timeline": word_timeline,
                "prosody_map": prosody_map,
                "validation": validation,
                "proof_alignment": proof_alignment,
                "proof_srt": proof_srt,
                "proof_audit": proof_audit,
            }
            heartbeat.update("commit_artifact", 96)
            repository.complete(job, artifact, __version__)
            _cleanup_uploaded_media(job, settings)
        HEALTH.update({
            "ok": True,
            "state": "idle",
            "last_job_id": job.job_id,
            "validation_ok": validation["ok"],
            "proof_ready": bool(proof_audit and proof_audit.get("final_output_allowed")),
        })
        LOGGER.info("Completed job %s with validation_ok=%s", job.job_id, validation["ok"])
        return True
    except Exception as error:
        permanent = single_attempt or isinstance(error, ValueError)
        terminal = repository.fail(job, error, permanent=permanent)
        if terminal:
            _cleanup_uploaded_media(job, settings)
        HEALTH.update({"ok": True, "state": "idle", "last_error": str(error)[:300]})
        LOGGER.exception("Job %s failed", job.job_id)
        return False
    finally:
        heartbeat.close()
        HEALTH.pop("job_id", None)
        HEALTH.pop("video_id", None)


def _health_server(port: int):
    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    settings = Settings.from_env()
    repository = TimingRepository(settings.database_url, settings.worker_id, settings.lease_seconds)
    engine = WhisperXEngine(settings)
    server = _health_server(settings.health_port)

    def stop(*_args):
        STOP.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    HEALTH.update({"state": "idle", "worker_id": settings.worker_id})
    LOGGER.info("GreekTube audio timing worker %s started", __version__)
    try:
        while not STOP.is_set():
            try:
                job = repository.claim_next_job()
                if job:
                    process_job(repository, engine, settings, job)
                    continue
                STOP.wait(settings.poll_seconds)
            except Exception as error:
                HEALTH.update({"ok": False, "state": "database_error", "last_error": str(error)[:300]})
                LOGGER.exception("Worker poll failed")
                STOP.wait(min(30.0, settings.poll_seconds * 2))
                HEALTH["ok"] = True
                HEALTH["state"] = "idle"
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
