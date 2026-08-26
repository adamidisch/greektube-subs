from __future__ import annotations

import math
import re
from copy import deepcopy
from typing import Any


TARGET_CPS = 17.0
HARD_MAX_CPS = 20.0
MIN_DURATION_MS = 1_000
MAX_DURATION_MS = 7_000
MAX_LINE_CHARACTERS = 42
MAX_PAUSE_EXTENSION_MS = 500
RESERVED_GAP_MS = 120
PRE_ROLL_MS = 80
POST_ROLL_MS = 120


def words_for_unit(unit: dict[str, Any], timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for reference in unit["source_refs"]:
        selected.extend(
            word for word in timeline
            if word["cue_id"] == reference["cue_id"]
            and reference["token_start"] <= word["cue_word_index"] < reference["token_end"]
        )
    unique = {word["source_index"]: word for word in selected}
    return [unique[index] for index in sorted(unique)]


def lexical_signature(text: str) -> list[str]:
    return [value.casefold() for value in re.findall(r"[^\W_]+(?:['’][^\W_]+)*", text, flags=re.UNICODE)]


def wrap_two_lines(text: str, max_characters: int = MAX_LINE_CHARACTERS) -> str:
    words = " ".join(text.split()).split(" ")
    if not words or len(" ".join(words)) <= max_characters:
        return " ".join(words)
    candidates: list[tuple[int, int, str, str]] = []
    for index in range(1, len(words)):
        first = " ".join(words[:index])
        second = " ".join(words[index:])
        overflow = max(0, len(first) - max_characters) + max(0, len(second) - max_characters)
        balance = abs(len(first) - len(second))
        candidates.append((overflow, balance, first, second))
    _, _, first, second = min(candidates)
    return f"{first}\n{second}"


def apply_prosody_punctuation(
    units: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    prosody_map: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    boundary_by_word = {boundary["after_word_id"]: boundary for boundary in prosody_map}
    rendered = deepcopy(units)
    violations: list[str] = []
    for unit in rendered:
        original = " ".join(unit["greek_text"].split())
        punctuated = original
        words = words_for_unit(unit, timeline)
        boundary = boundary_by_word.get(words[-1]["word_id"]) if words else None
        if boundary and boundary.get("apply_policy", "automatic") == "automatic" and not re.search(r"[.!?,;:…·»”’\])}]$", punctuated):
            boundary_class = boundary.get("class")
            if boundary_class == "question_end":
                punctuated += ";"
            elif boundary_class == "sentence_end":
                punctuated += "."
            elif boundary_class == "soft_clause":
                punctuated += ","
        if lexical_signature(original) != lexical_signature(punctuated):
            violations.append(unit["alignment_id"])
            punctuated = original
        unit["punctuated_text"] = punctuated
        unit["rendered_text"] = wrap_two_lines(punctuated)
        unit["prosody_boundary"] = boundary or None
    return rendered, violations


def _speaker_ids(words: list[dict[str, Any]]) -> list[str]:
    return list(dict.fromkeys(str(word["speaker_id"]) for word in words if word.get("speaker_id")))


def retime_units(
    units: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    duration_ms: int,
) -> list[dict[str, Any]]:
    retimed = deepcopy(units)
    for unit in retimed:
        all_words = words_for_unit(unit, timeline)
        words = [word for word in all_words if word.get("start_ms") is not None and word.get("end_ms") is not None]
        unit["source_word_count"] = len(all_words)
        unit["audio_word_count"] = len(words)
        unit["audio_speaker_ids"] = _speaker_ids(words)
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
        unit["confidence"] = round(min(float(word["confidence"]) for word in words), 3)

    for index, unit in enumerate(retimed):
        display_characters = len(" ".join(unit.get("punctuated_text", unit["greek_text"]).split()))
        required_ms = max(MIN_DURATION_MS, math.ceil(display_characters / TARGET_CPS * 1000))
        available_end = min(duration_ms, unit["audio_anchor_end_ms"] + MAX_PAUSE_EXTENSION_MS)
        speaker_change_after = False
        if index + 1 < len(retimed):
            following = retimed[index + 1]
            current_speakers = unit.get("audio_speaker_ids") or []
            following_speakers = following.get("audio_speaker_ids") or []
            speaker_change_after = bool(current_speakers and following_speakers and current_speakers[-1] != following_speakers[0])
            if speaker_change_after:
                available_end = unit["end_ms"]
            else:
                available_end = min(available_end, following["audio_anchor_start_ms"] - RESERVED_GAP_MS)
        needed = max(0, required_ms - (unit["end_ms"] - unit["start_ms"]))
        extension = min(MAX_PAUSE_EXTENSION_MS, needed, max(0, available_end - unit["end_ms"]))
        unit["end_ms"] += extension
        unit["pause_extension_ms"] = extension
        unit["speaker_change_after"] = speaker_change_after

    for index in range(1, len(retimed)):
        previous = retimed[index - 1]
        current = retimed[index]
        if current["start_ms"] - previous["end_ms"] < RESERVED_GAP_MS:
            boundary = round((previous["audio_anchor_end_ms"] + current["audio_anchor_start_ms"]) / 2)
            previous["end_ms"] = min(previous["end_ms"], boundary - RESERVED_GAP_MS // 2)
            current["start_ms"] = max(current["start_ms"], boundary + RESERVED_GAP_MS // 2)

    for unit in retimed:
        display_characters = len(" ".join(unit.get("punctuated_text", unit["greek_text"]).split()))
        duration = max(1, unit["end_ms"] - unit["start_ms"])
        cps = display_characters / (duration / 1000)
        line_lengths = [len(line) for line in unit.get("rendered_text", unit["greek_text"]).splitlines()]
        issues: list[str] = []
        if duration < MIN_DURATION_MS:
            issues.append("TOO_SHORT")
        if duration > MAX_DURATION_MS:
            issues.append("TOO_LONG")
        if len(line_lengths) > 2:
            issues.append("MORE_THAN_TWO_LINES")
        if max(line_lengths, default=0) > MAX_LINE_CHARACTERS:
            issues.append("LINE_TOO_LONG")
        if len(unit.get("audio_speaker_ids") or []) > 1:
            issues.append("SPEAKER_BOUNDARY_INSIDE")
        if cps > HARD_MAX_CPS:
            issues.append("HARD_CPS_EXCEEDED")
        elif cps > TARGET_CPS:
            issues.append("TARGET_CPS_EXCEEDED")
        if unit["timing_precision"] != "whisperx_source_word_anchors":
            issues.append("AUDIO_ANCHOR_FALLBACK")
        unit["reading_speed_cps"] = round(cps, 2)
        unit["status"] = "pass" if not issues else "review"
        unit["issues"] = issues
    return retimed


def srt_text(units: list[dict[str, Any]], format_time) -> str:
    blocks = []
    for index, unit in enumerate(units, start=1):
        blocks.append(
            f"{index}\n{format_time(unit['start_ms'])} --> {format_time(unit['end_ms'])}\n"
            f"{unit.get('rendered_text') or unit['greek_text']}"
        )
    return "\n\n".join(blocks) + "\n"


def render_proof(
    alignment: dict[str, Any],
    timeline: list[dict[str, Any]],
    prosody_map: list[dict[str, Any]],
    duration_ms: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    punctuated, punctuation_violations = apply_prosody_punctuation(alignment["units"], timeline, prosody_map)
    retimed = retime_units(punctuated, timeline, duration_ms)
    overlaps: list[str] = []
    short_gaps: list[dict[str, Any]] = []
    invalid_durations = [unit["alignment_id"] for unit in retimed if unit["end_ms"] <= unit["start_ms"]]
    for previous, current in zip(retimed, retimed[1:]):
        gap_ms = current["start_ms"] - previous["end_ms"]
        if gap_ms < 0:
            overlaps.append(f"{previous['alignment_id']}->{current['alignment_id']}")
        elif gap_ms < RESERVED_GAP_MS:
            short_gaps.append({"seam": f"{previous['alignment_id']}->{current['alignment_id']}", "gap_ms": gap_ms})
    covered_indexes = {
        word["source_index"]
        for unit in retimed
        for word in words_for_unit(unit, timeline)
    }
    all_indexes = {word["source_index"] for word in timeline}
    hard_cps = [unit["alignment_id"] for unit in retimed if "HARD_CPS_EXCEEDED" in unit["issues"]]
    minimum_duration_failures = [unit["alignment_id"] for unit in retimed if "TOO_SHORT" in unit["issues"]]
    line_failures = [unit["alignment_id"] for unit in retimed if "LINE_TOO_LONG" in unit["issues"] or "MORE_THAN_TWO_LINES" in unit["issues"]]
    speaker_boundary_units = [unit["alignment_id"] for unit in retimed if "SPEAKER_BOUNDARY_INSIDE" in unit["issues"]]
    audit = {
        "unit_count": len(retimed),
        "pass_count": sum(unit["status"] == "pass" for unit in retimed),
        "review_count": sum(unit["status"] != "pass" for unit in retimed),
        "hard_cps_failures": hard_cps,
        "target_cps_warnings": [unit["alignment_id"] for unit in retimed if "TARGET_CPS_EXCEEDED" in unit["issues"]],
        "too_short": minimum_duration_failures,
        "too_long": [unit["alignment_id"] for unit in retimed if "TOO_LONG" in unit["issues"]],
        "line_failures": line_failures,
        "fallback_timing_units": [unit["alignment_id"] for unit in retimed if unit["timing_precision"] != "whisperx_source_word_anchors"],
        "speaker_boundary_units": speaker_boundary_units,
        "punctuation_word_violations": punctuation_violations,
        "overlaps": overlaps,
        "short_gaps": short_gaps,
        "invalid_durations": invalid_durations,
        "source_word_coverage": round(len(covered_indexes) / max(1, len(all_indexes)), 6),
        "uncovered_source_indexes": sorted(all_indexes - covered_indexes),
    }
    audit["final_output_allowed"] = not any((
        hard_cps,
        minimum_duration_failures,
        line_failures,
        speaker_boundary_units,
        overlaps,
        short_gaps,
        invalid_durations,
        punctuation_violations,
    ))
    return {**alignment, "timing_source": "whisperx_audio", "units": retimed}, audit
