from __future__ import annotations

from typing import Any

from .models import TimelineWord


HESITATIONS = {"ah", "eh", "er", "erm", "hmm", "uh", "um"}


def build_prosody_map(timeline: list[TimelineWord]) -> list[dict[str, Any]]:
    boundaries: list[dict[str, Any]] = []
    for current, following in zip(timeline, timeline[1:]):
        pause_ms = None
        if current.end_ms is not None and following.start_ms is not None:
            pause_ms = max(0, following.start_ms - current.end_ms)
        speaker_change = bool(
            current.speaker_id
            and following.speaker_id
            and current.speaker_id != following.speaker_id
        )
        uncertain = (
            pause_ms is None
            or current.alignment_status not in {"exact", "fuzzy"}
            or following.alignment_status not in {"exact", "fuzzy"}
        )
        punctuation = current.source_punctuation

        if speaker_change:
            boundary_class = "speaker_change"
        elif "?" in punctuation:
            boundary_class = "question_end"
        elif current.normalized in HESITATIONS and (pause_ms or 0) >= 150:
            boundary_class = "hesitation"
        elif any(mark in punctuation for mark in ".!") or (pause_ms or 0) >= 700:
            boundary_class = "sentence_end"
        elif any(mark in punctuation for mark in ",;:") or (pause_ms or 0) >= 300:
            boundary_class = "soft_clause"
        elif uncertain:
            boundary_class = "uncertain"
        else:
            boundary_class = "continuing"

        timing_confidence = min(current.confidence, following.confidence)
        confidence = round(max(0.0, min(1.0, timing_confidence)), 3)
        if boundary_class == "uncertain":
            confidence = min(confidence, 0.49)
        boundaries.append({
            "after_cue_id": current.cue_id,
            "after_word_index": current.cue_word_index,
            "after_subword_index": current.cue_subword_index,
            "after_word_id": current.word_id,
            "pause_ms": pause_ms,
            "speaker_id": following.speaker_id or current.speaker_id,
            "class": boundary_class,
            "confidence": confidence,
            "apply_policy": "pending_review" if speaker_change or uncertain else "automatic",
        })
    return boundaries
