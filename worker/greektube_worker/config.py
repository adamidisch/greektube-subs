from __future__ import annotations

import os
import socket
from dataclasses import dataclass


def _integer(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _floating(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    database_url: str
    worker_id: str
    poll_seconds: float
    lease_seconds: int
    heartbeat_seconds: int
    health_port: int
    whisper_model: str
    whisper_device: str
    whisper_compute_type: str
    whisper_batch_size: int
    language: str
    hf_token: str | None
    yt_dlp_cookies_file: str | None
    min_direct_alignment_ratio: float
    max_unaligned_ratio: float

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.getenv("AUDIO_TIMING_DATABASE_URL") or os.getenv("DATABASE_URL") or ""
        if not database_url:
            raise RuntimeError("AUDIO_TIMING_DATABASE_URL or DATABASE_URL is required")
        return cls(
            database_url=database_url,
            worker_id=os.getenv("WORKER_ID", f"{socket.gethostname()}-{os.getpid()}"),
            poll_seconds=_floating("POLL_SECONDS", 5.0),
            lease_seconds=_integer("LEASE_SECONDS", 300),
            heartbeat_seconds=_integer("HEARTBEAT_SECONDS", 30),
            health_port=_integer("PORT", 8080),
            whisper_model=os.getenv("WHISPER_MODEL", "large-v3"),
            whisper_device=os.getenv("WHISPER_DEVICE", "cpu"),
            whisper_compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            whisper_batch_size=_integer("WHISPER_BATCH_SIZE", 8),
            language=os.getenv("WHISPER_LANGUAGE", "en"),
            hf_token=os.getenv("HF_TOKEN") or None,
            yt_dlp_cookies_file=os.getenv("YTDLP_COOKIES_FILE") or None,
            min_direct_alignment_ratio=_floating("MIN_DIRECT_ALIGNMENT_RATIO", 0.70),
            max_unaligned_ratio=_floating("MAX_UNALIGNED_RATIO", 0.02),
        )
