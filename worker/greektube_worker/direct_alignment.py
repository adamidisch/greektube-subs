"""Align an authoritative transcript directly to owner-provided local audio.

No transcription, database, queue, publication or speaker inference is involved.
Each cue is aligned independently so repeated phrases cannot borrow another
cue's audio anchors. Interpolated words remain explicitly marked as estimates.
"""
from __future__ import annotations

import json
from copy import deepcopy
import math
import re
from pathlib import Path
from typing import Any, Callable

from .alignment import build_word_timeline, tokenize_source
from .models import SourceCue


def read_source(path: Path) -> list[SourceCue]:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        value = json.loads(text)
        rows = value["source"] if isinstance(value, dict) else value
        cues = [SourceCue(i + 1, round(row["start"] * 1000),
                          round((row["start"] + row["duration"]) * 1000), row["text"])
                for i, row in enumerate(rows)]
    else:
        def milliseconds(value: str) -> int:
            h, m, s, ms = map(int, re.split(r"[:,.]", value))
            return ((h * 60 + m) * 60 + s) * 1000 + ms
        cues = []
        for block in re.split(r"\n\s*\n", text.strip()):
            lines = block.splitlines()
            if len(lines) < 3 or not re.fullmatch(r"\d+", lines[0].strip()):
                raise ValueError("Malformed source SRT block")
            match = re.fullmatch(r"(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})", lines[1].strip())
            if not match:
                raise ValueError(f"Malformed source timestamp: {lines[1]}")
            cues.append(SourceCue(int(lines[0]), milliseconds(match[1]), milliseconds(match[2]), " ".join(lines[2:])))
    if not cues or len({cue.cue_id for cue in cues}) != len(cues):
        raise ValueError("Source must contain unique cues")
    previous_end = -1
    for cue in cues:
        if cue.start_ms < 0 or cue.end_ms <= cue.start_ms or cue.start_ms < previous_end or not cue.text.strip():
            raise ValueError(f"Invalid source cue {cue.cue_id}")
        if cue.end_ms - cue.start_ms > 30000:
            raise ValueError(f"Source cue {cue.cue_id} exceeds the 30-second alignment window")
        previous_end = cue.end_ms
    return cues


def align_cue(cue: SourceCue, result: dict[str, Any], word_offset: int) -> list[dict[str, Any]]:
    """Use only this cue's alignment output; do not match across cue boundaries."""
    return align_cue_group([cue], result, word_offset)


def align_cue_group(cues: list[SourceCue], result: dict[str, Any], word_offset: int) -> list[dict[str, Any]]:
    """A bounded adjacent-cue repair keeps one monotonic alignment across a bad boundary."""
    result = deepcopy(result)
    for segment in result.get("segments", []):
        for word in segment.get("words", []):
            if word.get("score") is None:
                word["score"] = 0.0
    timeline, _ = build_word_timeline(cues, result)
    source_by_id = {cue.cue_id: cue for cue in cues}
    words = []
    for word in timeline:
        cue = source_by_id[word.cue_id]
        word.source_index += word_offset
        word.word_id = f"W{word.source_index + 1:06d}"
        # Models sometimes return NaN scores for unsupported characters.
        if not math.isfinite(word.confidence):
            word.confidence = 0.0
        row = word.to_dict()
        direct = word.alignment_status in {"exact", "fuzzy"}
        valid = (word.start_ms is not None and word.end_ms is not None
                 and max(0, cue.start_ms - 750) <= word.start_ms < word.end_ms <= cue.end_ms + 750
                 and word.end_ms - word.start_ms <= 2000)
        row["timing_evidence"] = "forced_alignment" if direct and valid and word.confidence >= 0.5 else "estimated"
        words.append(row)
    return words


def alignment_audit(words: list[dict[str, Any]]) -> dict[str, Any]:
    issues = []
    previous_end = -1
    for word in words:
        start, end = word["start_ms"], word["end_ms"]
        if start is None or end is None or start >= end:
            issues.append({"wordId": word["word_id"], "code": "missing_or_invalid_time"})
        elif start < previous_end:
            issues.append({"wordId": word["word_id"], "code": "overlap"})
        if end is not None:
            previous_end = max(previous_end, end)
        if word["timing_evidence"] != "forced_alignment":
            issues.append({"wordId": word["word_id"], "code": "timing_needs_review"})
    direct = sum(word["timing_evidence"] == "forced_alignment" for word in words)
    return {"wordCount": len(words), "directWordCount": direct,
            "directRatio": direct / len(words) if words else 0,
            "issues": issues, "fullyAligned": bool(words) and not issues,
            "humanAudioReview": False}


def prefer_boundary_repair(original: list[dict[str, Any]], candidate: list[dict[str, Any]],
                           source_cues: list[SourceCue] | None = None) -> bool:
    """Compare the group AND neighbouring cues so a repair cannot move its defect outside the group."""
    if [(w["word_id"], w["text"]) for w in original] != [(w["word_id"], w["text"]) for w in candidate]:
        return False
    if source_cues is not None:
        source_by_id = {cue.cue_id: cue for cue in source_cues}
        for old_word, word in zip(original, candidate):
            cue = source_by_id.get(word.get("cue_id"))
            start, end = word["start_ms"], word["end_ms"]
            if (cue is None or old_word.get("cue_id") != word.get("cue_id")
                    or start is None or end is None
                    or not max(0, cue.start_ms - 750) <= start < end <= cue.end_ms + 750):
                return False
    old, new = alignment_audit(original), alignment_audit(candidate)
    count = lambda audit, code: sum(issue["code"] == code for issue in audit["issues"])
    return (count(new, "overlap") < count(old, "overlap")
            and count(new, "missing_or_invalid_time") <= count(old, "missing_or_invalid_time")
            and new["directWordCount"] >= old["directWordCount"])


def run_alignment(cues: list[SourceCue], selected: list[SourceCue],
                  align: Callable[[SourceCue], dict[str, Any]], cache: dict[str, Any],
                  checkpoint: Callable[[], None]) -> list[dict[str, Any]]:
    offsets, offset = {}, 0
    for cue in cues:
        offsets[cue.cue_id] = offset
        offset += len(tokenize_source([cue]))
    output = []
    for cue in selected:
        key = str(cue.cue_id)
        if key not in cache["cues"]:
            cache["cues"][key] = align_cue(cue, align(cue), offsets[cue.cue_id])
            checkpoint()
        output.extend(cache["cues"][key])
    return output
