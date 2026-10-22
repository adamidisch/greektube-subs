"""One bounded repair pass for overlapping cue boundaries; reuses completed groups."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

from greektube_worker.direct_alignment import align_cue_group, alignment_audit, read_source, prefer_boundary_repair
from greektube_worker.models import source_cues_hash
from .align_local import write_json


def overlapping_groups(words, cues):
    cue_positions = {cue.cue_id: i for i, cue in enumerate(cues)}
    intervals = []
    previous = None
    for word in words:
        if word["start_ms"] is None or word["end_ms"] is None:
            continue
        if previous and word["start_ms"] < previous["end_ms"]:
            intervals.append((cue_positions[previous["cue_id"]], cue_positions[word["cue_id"]]))
        if previous is None or word["end_ms"] >= previous["end_ms"]:
            previous = word
    merged = []
    for first, last in sorted(intervals):
        if merged and first <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(last, merged[-1][1]))
        else:
            merged.append((first, last))
    groups = []
    for first, last in merged:
        cursor = first
        while cursor <= last:
            end = cursor
            while end < last and cues[end + 1].end_ms - cues[cursor].start_ms <= 25000:
                end += 1
            if end == cursor and cursor < last:
                # Keep the unresolved boundary explicit rather than using an unbounded window.
                break
            groups.append(cues[cursor:end + 1])
            if end == last:
                break
            cursor = end
    return groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("audio", "source", "alignment", "output", "checkpoint"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    if args.limit <= 0:
        parser.error("limit must be positive")
    protected = {args.audio.resolve(), args.source.resolve(), args.alignment.resolve()}
    if args.output.resolve() in protected or args.checkpoint.resolve() in protected or args.output.resolve() == args.checkpoint.resolve():
        parser.error("Repair outputs must not overwrite inputs")
    cues = read_source(args.source)
    original = json.loads(args.alignment.read_text())
    with args.audio.open("rb") as audio:
        audio_hash = hashlib.file_digest(audio, "sha256").hexdigest()
    if original["sourceHash"] != source_cues_hash(cues) or original["audioSha256"] != audio_hash:
        raise ValueError("Repair input evidence does not match")
    identity = {"sourceHash": original["sourceHash"], "audioSha256": audio_hash,
                "inputTimelineHash": original["wordTimelineHash"], "method": "joint-ctc-boundary-repair-v1"}
    cache = {**identity, "groups": {}}
    if args.checkpoint.exists():
        cache = json.loads(args.checkpoint.read_text())
        if any(cache.get(key) != value for key, value in identity.items()):
            raise ValueError("Repair checkpoint belongs to a different timeline")
    groups = overlapping_groups(original["words"], cues)
    words = {word["source_index"]: word for word in original["words"]}
    offsets = {word["cue_id"]: word["source_index"] for word in reversed(original["words"])}
    cue_positions = {cue.cue_id: i for i, cue in enumerate(cues)}
    engine = None
    began = time.monotonic()
    for group in groups[:args.limit]:
        key = ",".join(str(cue.cue_id) for cue in group)
        if key not in cache["groups"]:
            if engine is None:
                import torch
                import whisperx
                torch.set_num_threads(min(4, torch.get_num_threads()))
                audio = whisperx.load_audio(str(args.audio))
                model, metadata = whisperx.load_align_model("en", "cpu", model_name=original["model"])
                engine = (whisperx, audio, model, metadata)
            whisperx, audio, model, metadata = engine
            text = re.sub(r"(?<=\w)[-–](?=\w)", " ", " ".join(cue.text for cue in group).replace("’", "'"))
            result = whisperx.align([{"start": max(0, group[0].start_ms / 1000 - .75),
                                      "end": min(len(audio) / 16000, group[-1].end_ms / 1000 + .75), "text": text}],
                                    model, metadata, audio, "cpu", interpolate_method="ignore", return_char_alignments=False)
            repaired = align_cue_group(group, result, offsets[group[0].cue_id])
            expected = [word for word in original["words"] if word["cue_id"] in {cue.cue_id for cue in group}]
            if [(w["word_id"], w["text"]) for w in repaired] != [(w["word_id"], w["text"]) for w in expected]:
                raise ValueError("Repair changed source word coverage")
            cache["groups"][key] = {"accepted": False, "words": repaired}
        replacement = {w["source_index"]: w for w in cache["groups"][key]["words"]}
        first = max(0, cue_positions[group[0].cue_id] - 1)
        last = min(len(cues) - 1, cue_positions[group[-1].cue_id] + 1)
        context_ids = {cue.cue_id for cue in cues[first:last + 1]}
        old_context = [words[index] for index in sorted(words) if words[index]["cue_id"] in context_ids]
        new_context = [replacement.get(w["source_index"], w) for w in old_context]
        accepted = prefer_boundary_repair(old_context, new_context)
        cache["groups"][key]["accepted"] = accepted
        write_json(args.checkpoint, cache)
        print(f"Boundary group {key}: {'accepted' if accepted else 'needs review'}", flush=True)
        if accepted:
            words.update(replacement)
    output_words = [words[index] for index in sorted(words)]
    result = {**original, "words": output_words, "audit": alignment_audit(output_words),
              "sourceCues": [{"cueId": cue.cue_id, "startMs": cue.start_ms, "endMs": cue.end_ms, "text": cue.text} for cue in cues],
              "selectedSourceHash": source_cues_hash(cues),
              "wordTimelineHash": hashlib.sha256(json.dumps(output_words, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
              "boundaryRepair": {"method": identity["method"], "totalGroups": len(groups), "processedGroups": min(len(groups), args.limit),
                                 "acceptedGroups": sum(g["accepted"] for g in cache["groups"].values()),
                                 "elapsedSeconds": round(time.monotonic() - began, 2)}}
    write_json(args.output, result)
    print(json.dumps({"repair": result["boundaryRepair"], "directRatio": result["audit"]["directRatio"],
                      "issues": len(result["audit"]["issues"])}), flush=True)


if __name__ == "__main__":
    main()
