"""Compile compact web review drafts without changing source/translation revisions."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from .alignment import tokenize_source
from .models import SourceCue, source_cues_hash


def web_content_hash(cues: list[dict[str, Any]]) -> str:
    # JavaScript Math.round is floor(x + .5) for the nonnegative cue times.
    rows = [[math.floor(cue["start"] * 1000 + .5), math.floor(cue["duration"] * 1000 + .5),
             " ".join(cue["text"].split())] for cue in cues]
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def compile_web_review(alignment: dict, draft: dict, report: dict) -> dict:
    source, translation = report["source"], report["translation"]
    if not source or len(source) != len(translation):
        raise ValueError("Source and translation cue mapping differ")
    if report["sourceHash"] != web_content_hash(source) or report["translationHash"] != web_content_hash(translation):
        raise ValueError("Web report integrity check failed")
    cues = [SourceCue(i + 1, math.floor(c["start"] * 1000 + .5),
                      math.floor((c["start"] + c["duration"]) * 1000 + .5), c["text"]) for i, c in enumerate(source)]
    if alignment["sourceHash"] != source_cues_hash(cues):
        raise ValueError("Alignment belongs to different source; partial pilots cannot replace a full video")
    words = alignment["words"]
    actual_hash = hashlib.sha256(json.dumps(words, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    if actual_hash != alignment["wordTimelineHash"]:
        raise ValueError("Word timeline integrity check failed")
    for field in ("sourceHash", "audioSha256", "wordTimelineHash"):
        if draft.get(field) != alignment[field]:
            raise ValueError(f"Draft belongs to different {field}")
    tokens = tokenize_source(cues)
    if len(tokens) != len(words) or any(w["source_index"] != i or w["text"] != t.text or w["cue_id"] != t.cue_id
                                       for i, (t, w) in enumerate(zip(tokens, words))):
        raise ValueError("Source word coverage differs")
    compact = []
    previous_end = -1
    for w in words:
        start, end, confidence = w["start_ms"], w["end_ms"], w["confidence"]
        if not isinstance(start, int) or not isinstance(end, int) or start < max(0, previous_end) or end <= start:
            raise ValueError(f"Invalid or overlapping audio word {w['word_id']}")
        if not isinstance(confidence, (float, int)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise ValueError("Invalid word confidence")
        direct = int(w["timing_evidence"] == "forced_alignment")
        # Floor prevents 0.4999 rounding up into the accepted 0.5 threshold.
        compact.append([start, end, math.floor(confidence * 1000), direct])
        previous_end = end
    by_id = {w["word_id"]: i for i, w in enumerate(words)}
    events, cursor = [], 0
    for event in draft["events"]:
        first, last = by_id[event["firstWordId"]], by_id[event["lastWordId"]]
        if first != cursor or last < first:
            raise ValueError("Draft word coverage is incomplete or reordered")
        indices = list(dict.fromkeys(t.cue_id - 1 for t in tokens[first:last + 1]))
        events.append({"start": event["start"], "duration": event["duration"], "text": event["text"],
                       "sourceIndices": indices, "sourceWordRange": [first, last],
                       "timing": "audio_aligned" if all(w[3] for w in compact[first:last + 1]) else "estimated"})
        cursor = last + 1
    if cursor != len(words):
        raise ValueError("Full-video source coverage is required")
    return {"schemaVersion": 1, "videoId": report["videoId"], "sourceHash": report["sourceHash"],
            "translationHash": report["translationHash"], "events": events,
            "audioEvidence": {"schemaVersion": 1, "sourceHash": report["sourceHash"],
                              "audioSha256": alignment["audioSha256"], "wordTimelineHash": actual_hash,
                              "model": alignment["model"], "method": alignment["method"], "words": compact},
            "status": "draft", "humanAudioReview": False}
