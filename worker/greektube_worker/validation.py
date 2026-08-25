from __future__ import annotations

from typing import Any

from .models import TimelineWord


def validate_artifact(
    timeline: list[TimelineWord],
    prosody_map: list[dict[str, Any]],
    duration_ms: int,
    min_direct_alignment_ratio: float = 0.70,
    max_unaligned_ratio: float = 0.02,
) -> dict[str, Any]:
    total = len(timeline)
    direct = sum(word.alignment_status in {"exact", "fuzzy"} for word in timeline)
    fallback = sum(word.alignment_status in {"local_fallback", "cue_fallback"} for word in timeline)
    unaligned = sum(word.start_ms is None or word.end_ms is None for word in timeline)
    direct_ratio = direct / total if total else 0.0
    unaligned_ratio = unaligned / total if total else 1.0

    word_ids = [word.word_id for word in timeline]
    source_coordinates = [(word.cue_id, word.cue_word_index, word.cue_subword_index) for word in timeline]
    duplicate_word_ids = total - len(set(word_ids))
    duplicate_source_coordinates = total - len(set(source_coordinates))
    invalid_durations = sum(
        word.start_ms is not None and word.end_ms is not None and word.end_ms <= word.start_ms
        for word in timeline
    )
    out_of_bounds = sum(
        word.start_ms is not None
        and word.end_ms is not None
        and (word.start_ms < 0 or word.end_ms > duration_ms + 2_000)
        for word in timeline
    )
    timed = [word for word in timeline if word.start_ms is not None and word.end_ms is not None]
    timestamp_regressions = sum(
        following.start_ms < current.start_ms
        for current, following in zip(timed, timed[1:])
        if current.start_ms is not None and following.start_ms is not None
    )
    prosody_count_ok = len(prosody_map) == max(0, total - 1)

    checks = {
        "has_words": total > 0,
        "unique_word_ids": duplicate_word_ids == 0,
        "unique_source_coordinates": duplicate_source_coordinates == 0,
        "positive_durations": invalid_durations == 0,
        "ordered_timestamps": timestamp_regressions == 0,
        "timestamps_within_audio": out_of_bounds == 0,
        "prosody_coverage": prosody_count_ok,
        "direct_alignment_ratio": direct_ratio >= min_direct_alignment_ratio,
        "unaligned_ratio": unaligned_ratio <= max_unaligned_ratio,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "word_count": total,
        "direct_aligned_words": direct,
        "fallback_words": fallback,
        "unaligned_words": unaligned,
        "direct_alignment_ratio": round(direct_ratio, 6),
        "unaligned_ratio": round(unaligned_ratio, 6),
        "duplicate_word_ids": duplicate_word_ids,
        "duplicate_source_coordinates": duplicate_source_coordinates,
        "invalid_durations": invalid_durations,
        "timestamp_regressions": timestamp_regressions,
        "out_of_bounds": out_of_bounds,
        "prosody_boundary_count": len(prosody_map),
    }
