from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .config import Settings


class WhisperXEngine:
    engine_name = "whisperx"
    engine_version = "3.8.6"

    def __init__(self, settings: Settings):
        self.settings = settings
        self._model: Any = None
        self._align_models: dict[str, tuple[Any, Any]] = {}
        self._diarization_model: Any = None

    def download_audio(self, video_id: str, temp_dir: Path) -> tuple[Path, int]:
        from yt_dlp import YoutubeDL

        output_template = str(temp_dir / "source.%(ext)s")
        options: dict[str, Any] = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "retries": 3,
            "fragment_retries": 3,
        }
        if self.settings.yt_dlp_cookies_file:
            options["cookiefile"] = self.settings.yt_dlp_cookies_file
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        candidates = [path for path in temp_dir.glob("source.*") if path.suffix.lower() != ".wav"]
        if not candidates:
            raise RuntimeError("yt-dlp did not produce an audio file")
        source_path = max(candidates, key=lambda path: path.stat().st_size)
        wav_path, converted_duration_ms = self.prepare_media(source_path, temp_dir)
        duration_ms = max(0, round(float(info.get("duration") or 0) * 1000))
        return wav_path, duration_ms or converted_duration_ms

    def prepare_media(self, source_path: Path, temp_dir: Path) -> tuple[Path, int]:
        if not source_path.is_file() or source_path.stat().st_size < 1:
            raise ValueError("Uploaded media file is empty or missing")
        wav_path = temp_dir / "audio-16khz-mono.wav"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source_path), "-vn", "-ac", "1", "-ar", "16000", str(wav_path)],
            check=True,
        )
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(wav_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        duration_ms = max(0, round(float(probe.stdout.strip() or 0) * 1000))
        return wav_path, duration_ms

    def download_uploaded_media(self, url: str, declared_size: int, temp_dir: Path) -> tuple[Path, int]:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".blob.vercel-storage.com"):
            raise ValueError("Uploaded media URL is not an allowed Vercel Blob URL")
        if declared_size < 1 or declared_size > self.settings.max_media_bytes:
            raise ValueError("Uploaded media size is outside the allowed range")
        request = Request(url, headers={"User-Agent": "GreekTube-Audio-Timing-Worker/1"})
        source_path = temp_dir / "uploaded-media"
        downloaded = 0
        with urlopen(request, timeout=60) as response, source_path.open("wb") as output:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > self.settings.max_media_bytes:
                raise ValueError("Uploaded media exceeds the worker size limit")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                downloaded += len(chunk)
                if downloaded > self.settings.max_media_bytes:
                    raise ValueError("Uploaded media exceeds the worker size limit")
                output.write(chunk)
        if downloaded != declared_size:
            raise ValueError(f"Uploaded media size mismatch: expected {declared_size}, received {downloaded}")
        return self.prepare_media(source_path, temp_dir)

    def _load_model(self):
        if self._model is None:
            import whisperx

            self._model = whisperx.load_model(
                self.settings.whisper_model,
                self.settings.whisper_device,
                compute_type=self.settings.whisper_compute_type,
                language=self.settings.language,
            )
        return self._model

    def transcribe_and_align(self, audio_path: Path) -> dict[str, Any]:
        import whisperx

        audio = whisperx.load_audio(str(audio_path))
        result = self._load_model().transcribe(
            audio,
            batch_size=self.settings.whisper_batch_size,
            language=self.settings.language,
        )
        language = str(result.get("language") or self.settings.language)
        if language not in self._align_models:
            self._align_models[language] = whisperx.load_align_model(
                language_code=language,
                device=self.settings.whisper_device,
            )
        align_model, metadata = self._align_models[language]
        aligned = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            self.settings.whisper_device,
            return_char_alignments=False,
        )

        if self.settings.hf_token:
            if self._diarization_model is None:
                from whisperx.diarize import DiarizationPipeline

                self._diarization_model = DiarizationPipeline(
                    token=self.settings.hf_token,
                    device=self.settings.whisper_device,
                )
            diarized = self._diarization_model(audio)
            aligned = whisperx.assign_word_speakers(diarized, aligned)
        aligned["language"] = language
        return aligned
