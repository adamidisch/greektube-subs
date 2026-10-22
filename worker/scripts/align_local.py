"""One-shot, resumable forced alignment; never starts the queued worker.

python -m scripts.align_local --audio owner.mp3 --source source.srt \
    --output alignment.json --checkpoint alignment-cache.json --duration 120
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

from greektube_worker.direct_alignment import alignment_audit, read_source, run_alignment
from greektube_worker.models import source_cues_hash


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--duration", type=float, default=120)
    parser.add_argument("--model", default="WAV2VEC2_ASR_BASE_960H")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    args = parser.parse_args()
    if args.start < 0 or args.duration <= 0:
        parser.error("start must be nonnegative and duration positive")
    protected = {args.source.resolve(), args.audio.resolve()}
    if args.output.resolve() in protected or args.checkpoint.resolve() in protected or args.output.resolve() == args.checkpoint.resolve():
        parser.error("Output and checkpoint must be separate from each other and from source files")
    cues = read_source(args.source)
    selected = [cue for cue in cues if cue.start_ms >= args.start * 1000
                and cue.end_ms <= (args.start + args.duration) * 1000]
    if not selected:
        parser.error("No complete source cue fits the requested sample")
    with args.audio.open("rb") as source:
        audio_hash = hashlib.file_digest(source, "sha256").hexdigest()
    identity = {"schemaVersion": 1, "audioSha256": audio_hash,
                "sourceHash": source_cues_hash(cues), "model": args.model,
                "engineVersion": importlib.metadata.version("whisperx"),
                "method": "direct-ctc-padded-no-interpolation-v2", "device": args.device}
    cache = {**identity, "cues": {}}
    if args.checkpoint.exists():
        cache = json.loads(args.checkpoint.read_text())
        if any(cache.get(key) != value for key, value in identity.items()):
            raise ValueError("Checkpoint belongs to different audio, source or alignment settings")
    began = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="greektube-align-") as directory:
        # Decode only the requested window. All returned times remain video-absolute.
        clip_start = max(0, selected[0].start_ms / 1000 - .75)
        clip_end = selected[-1].end_ms / 1000 + .75
        wav = Path(directory) / "sample.wav"
        engine = None

        def align(cue):
            nonlocal engine
            if engine is None:
                import torch
                import whisperx
                torch.set_num_threads(min(4, torch.get_num_threads()))
                subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                                "-ss", str(clip_start), "-i", str(args.audio), "-t", str(clip_end - clip_start),
                                "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
                audio = whisperx.load_audio(str(wav))
                model, metadata = whisperx.load_align_model("en", args.device, model_name=args.model)
                engine = (whisperx, audio, model, metadata)
            whisperx, audio, model, metadata = engine
            # Orthographic normalization only; original source text stays immutable.
            alignment_text = re.sub(r"(?<=\w)[-–](?=\w)", " ", cue.text.replace("’", "'"))
            result = whisperx.align([{"start": max(0, cue.start_ms / 1000 - clip_start - .75),
                                      "end": min(len(audio) / 16000, cue.end_ms / 1000 - clip_start + .75),
                                      "text": alignment_text}],
                                    model, metadata, audio, args.device,
                                    interpolate_method="ignore", return_char_alignments=False)
            for segment in result.get("segments", []):
                for word in segment.get("words", []):
                    for field in ("start", "end"):
                        if word.get(field) is not None:
                            word[field] += clip_start
            print(f"Aligned source cue {cue.cue_id}", flush=True)
            return result

        words = run_alignment(cues, selected, align, cache, lambda: write_json(args.checkpoint, cache))
    words_hash = hashlib.sha256(json.dumps(words, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    artifact = {**identity, "wordTimelineHash": words_hash, "selectedSourceHash": source_cues_hash(selected),
                "range": {"startMs": selected[0].start_ms, "endMs": selected[-1].end_ms},
                "sourceCueIds": [cue.cue_id for cue in selected],
                "sourceCues": [{"cueId": cue.cue_id, "startMs": cue.start_ms, "endMs": cue.end_ms, "text": cue.text}
                               for cue in selected], "words": words,
                "audit": alignment_audit(words), "elapsedSeconds": round(time.monotonic() - began, 2)}
    write_json(args.output, artifact)
    print(json.dumps({"output": str(args.output), "wordCount": len(words),
                      "directRatio": artifact["audit"]["directRatio"],
                      "issues": len(artifact["audit"]["issues"]),
                      "elapsedSeconds": artifact["elapsedSeconds"]}), flush=True)


if __name__ == "__main__":
    main()
