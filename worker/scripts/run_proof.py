from __future__ import annotations

import argparse
import json
import math
import re
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory

from greektube_worker.alignment import build_word_timeline
from greektube_worker.config import Settings
from greektube_worker.engine import WhisperXEngine
from greektube_worker.models import SourceCue
from greektube_worker.prosody import build_prosody_map
from greektube_worker.proof import render_proof
from greektube_worker.validation import validate_artifact


TARGET_CPS = 17.0
HARD_MAX_CPS = 20.0
MIN_DURATION_MS = 1_000
MAX_PAUSE_EXTENSION_MS = 500
RESERVED_GAP_MS = 120
PRE_ROLL_MS = 80
POST_ROLL_MS = 120


def parse_time(value: str) -> int:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return (((int(hours) * 60 + int(minutes)) * 60) + int(seconds)) * 1000 + int(millis)


def format_time(value: int) -> str:
    value = max(0, round(value))
    hours, remainder = divmod(value, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def parse_srt(path: Path) -> list[SourceCue]:
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").strip())
    cues: list[SourceCue] = []
    for block in blocks:
        lines = block.splitlines()
        start_raw, end_raw = [part.strip() for part in lines[1].split("-->")]
        cues.append(SourceCue(
            cue_id=int(lines[0]),
            start_ms=parse_time(start_raw),
            end_ms=parse_time(end_raw),
            text=" ".join(lines[2:]).strip(),
        ))
    return cues


def settings_from_environment() -> Settings:
    import os

    return Settings(
        database_url="",
        worker_id="proof",
        poll_seconds=5,
        lease_seconds=300,
        heartbeat_seconds=30,
        health_port=8080,
        whisper_model=os.getenv("WHISPER_MODEL", "medium.en"),
        whisper_device=os.getenv("WHISPER_DEVICE", "cpu"),
        whisper_compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
        whisper_batch_size=int(os.getenv("WHISPER_BATCH_SIZE", "8")),
        language="en",
        hf_token=os.getenv("HF_TOKEN") or None,
        yt_dlp_cookies_file=os.getenv("YTDLP_COOKIES_FILE") or None,
        cleanup_url=None,
        max_media_bytes=250 * 1024 * 1024,
        min_direct_alignment_ratio=0.70,
        max_unaligned_ratio=0.02,
    )


def words_for_unit(unit: dict, timeline: list[dict]) -> list[dict]:
    selected: list[dict] = []
    for reference in unit["source_refs"]:
        selected.extend(
            word for word in timeline
            if word["cue_id"] == reference["cue_id"]
            and reference["token_start"] <= word["cue_word_index"] < reference["token_end"]
        )
    unique = {word["source_index"]: word for word in selected}
    return [unique[index] for index in sorted(unique)]


def retime_units(units: list[dict], timeline: list[dict], duration_ms: int) -> list[dict]:
    retimed = deepcopy(units)
    for unit in retimed:
        words = [word for word in words_for_unit(unit, timeline) if word["start_ms"] is not None and word["end_ms"] is not None]
        unit["audio_word_count"] = len(words)
        if not words:
            unit["timing_precision"] = "v8_fallback_no_audio_anchor"
            unit["audio_anchor_start_ms"] = unit["start_ms"]
            unit["audio_anchor_end_ms"] = unit["end_ms"]
            continue
        unit["audio_anchor_start_ms"] = words[0]["start_ms"]
        unit["audio_anchor_end_ms"] = words[-1]["end_ms"]
        unit["start_ms"] = max(0, words[0]["start_ms"] - PRE_ROLL_MS)
        unit["end_ms"] = min(duration_ms, words[-1]["end_ms"] + POST_ROLL_MS)
        unit["timing_precision"] = "whisperx_source_word_anchors"
        unit["confidence"] = round(min(word["confidence"] for word in words), 3)

    for index in range(1, len(retimed)):
        previous = retimed[index - 1]
        current = retimed[index]
        if current["start_ms"] < previous["end_ms"]:
            midpoint = round((previous["audio_anchor_end_ms"] + current["audio_anchor_start_ms"]) / 2)
            midpoint = max(previous["start_ms"] + 1, min(current["end_ms"] - 1, midpoint))
            previous["end_ms"] = midpoint
            current["start_ms"] = midpoint

    for index, unit in enumerate(retimed):
        display_characters = len(" ".join(unit["greek_text"].split()))
        required_ms = max(MIN_DURATION_MS, math.ceil(display_characters / TARGET_CPS * 1000))
        available_end = duration_ms
        if index + 1 < len(retimed):
            following = retimed[index + 1]
            same_speaker = unit.get("speaker") == following.get("speaker")
            if same_speaker:
                available_end = max(unit["end_ms"], following["audio_anchor_start_ms"] - RESERVED_GAP_MS)
            else:
                available_end = unit["end_ms"]
        needed = max(0, required_ms - (unit["end_ms"] - unit["start_ms"]))
        extension = min(MAX_PAUSE_EXTENSION_MS, needed, max(0, available_end - unit["end_ms"]))
        unit["end_ms"] += extension
        unit["pause_extension_ms"] = extension

        duration = max(1, unit["end_ms"] - unit["start_ms"])
        cps = display_characters / (duration / 1000)
        line_lengths = [len(line) for line in unit.get("rendered_text", unit["greek_text"]).splitlines()]
        issues: list[str] = []
        if duration < MIN_DURATION_MS:
            issues.append("TOO_SHORT")
        if len(line_lengths) > 2:
            issues.append("MORE_THAN_TWO_LINES")
        if max(line_lengths, default=0) > 42:
            issues.append("LINE_TOO_LONG")
        if cps > HARD_MAX_CPS:
            issues.append("HARD_CPS_EXCEEDED")
        elif cps > TARGET_CPS:
            issues.append("TARGET_CPS_EXCEEDED")
        unit["reading_speed_cps"] = round(cps, 2)
        unit["status"] = "pass" if not issues else "review"
        unit["issues"] = issues
    return retimed


def write_srt(path: Path, units: list[dict]) -> None:
    blocks = []
    for index, unit in enumerate(units, start=1):
        blocks.append(
            f"{index}\n{format_time(unit['start_ms'])} --> {format_time(unit['end_ms'])}\n"
            f"{unit.get('rendered_text') or unit['greek_text']}"
        )
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-id", default="D2RjneeG_xA")
    parser.add_argument("--media", type=Path)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--alignment", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    cues = parse_srt(args.source)
    alignment = json.loads(args.alignment.read_text(encoding="utf-8"))
    settings = settings_from_environment()
    engine = WhisperXEngine(settings)
    with TemporaryDirectory(prefix="gts-proof-") as temporary:
        if args.media:
            audio_path, duration_ms = engine.prepare_media(args.media.resolve(), Path(temporary))
        else:
            audio_path, duration_ms = engine.download_audio(args.video_id, Path(temporary))
        aligned_result = engine.transcribe_and_align(audio_path)

    timeline_words, asr_words = build_word_timeline(cues, aligned_result)
    timeline = [word.to_dict() for word in timeline_words]
    prosody = build_prosody_map(timeline_words)
    if duration_ms <= 0:
        duration_ms = max((word.end_ms or 0 for word in timeline_words), default=0)
    validation = validate_artifact(timeline_words, prosody, duration_ms)
    validation["asr_word_count"] = len(asr_words)
    validation["source_cue_count"] = len(cues)
    retimed_alignment, proof_audit = render_proof(alignment, timeline, prosody, duration_ms)
    retimed = retimed_alignment["units"]

    timing_artifact = {
        "video_id": args.video_id,
        "timing_version": 1,
        "timing_source": "whisperx_audio",
        "engine": engine.engine_name,
        "engine_version": engine.engine_version,
        "model": settings.whisper_model,
        "language": aligned_result.get("language", "en"),
        "duration_ms": duration_ms,
        "word_timeline": timeline,
        "prosody_map": prosody,
        "validation": validation,
    }
    audit = {
        "video_id": args.video_id,
        "timing_validation": validation,
        **proof_audit,
    }
    audit["final_output_allowed"] = bool(audit["final_output_allowed"] and validation["ok"])
    (args.output / "word-timeline.json").write_text(json.dumps(timing_artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "v81-alignment.json").write_text(json.dumps(retimed_alignment, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "v81-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    write_srt(args.output / "v81-candidate.srt", retimed)
    final_path = args.output / "v81-output.srt"
    if audit["final_output_allowed"]:
        write_srt(final_path, retimed)
    elif final_path.exists():
        final_path.unlink()
    print(json.dumps(audit, ensure_ascii=False))
    if not audit["final_output_allowed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
