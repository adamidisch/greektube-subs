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
    if len(words) == 1:
        return words[0]
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


def _display_characters(unit: dict[str, Any]) -> int:
    return len(" ".join(unit.get("punctuated_text", unit["greek_text"]).split()))


def _ends_sentence(unit: dict[str, Any]) -> bool:
    boundary = unit.get("prosody_boundary") or {}
    if boundary.get("class") in {"sentence_end", "question_end"}:
        return True
    text = unit.get("punctuated_text", unit["greek_text"]).rstrip()
    return bool(re.search(r"[.!;…][»”’'\")\]}]*$", text))


def _same_speaker(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_ids = left.get("audio_speaker_ids") or []
    right_ids = right.get("audio_speaker_ids") or []
    if left_ids and right_ids:
        return left_ids[-1] == right_ids[0]
    return left.get("speaker") == right.get("speaker")


def _sentence_groups(units: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for index, unit in enumerate(units):
        current.append(unit)
        following = units[index + 1] if index + 1 < len(units) else None
        if _ends_sentence(unit) or following is None or not _same_speaker(unit, following):
            groups.append(current)
            current = []
    return groups


def _needs_hard_rebalance(group: list[dict[str, Any]]) -> bool:
    return any(
        _display_characters(unit) / (max(1, unit["end_ms"] - unit["start_ms"]) / 1000) > HARD_MAX_CPS
        or unit["end_ms"] - unit["start_ms"] < MIN_DURATION_MS
        for unit in group
    )


def _partition_group_text(group: list[dict[str, Any]], group_id: str, strategy: str) -> bool:
    if len(group) < 2:
        return False
    original_chunks = [unit.get("punctuated_text", unit["greek_text"]) for unit in group]
    words = [word for chunk in original_chunks for word in chunk.split()]
    if len(words) < len(group):
        return False
    original_boundaries: list[int] = []
    cursor = 0
    for chunk in original_chunks[:-1]:
        cursor += len(chunk.split())
        original_boundaries.append(cursor)

    states: dict[int, tuple[float, list[tuple[int, int]]]] = {0: (0.0, [])}
    for unit_index, unit in enumerate(group):
        following_states: dict[int, tuple[float, list[tuple[int, int]]]] = {}
        duration_seconds = max(1, unit["end_ms"] - unit["start_ms"]) / 1000
        units_left = len(group) - unit_index - 1
        for start, (cost, partitions) in states.items():
            minimum_end = start + 1
            maximum_end = len(words) - units_left
            for end in range(minimum_end, maximum_end + 1):
                text = " ".join(words[start:end])
                characters = len(text)
                cps = characters / duration_seconds
                rendered = wrap_two_lines(text)
                line_lengths = [len(line) for line in rendered.splitlines()]
                if cps > HARD_MAX_CPS or len(line_lengths) > 2 or max(line_lengths, default=0) > MAX_LINE_CHARACTERS:
                    continue
                speed_cost = max(0.0, cps - TARGET_CPS) ** 2 * 25
                boundary_cost = 0.0
                if unit_index < len(group) - 1:
                    boundary_cost = abs(end - original_boundaries[unit_index]) * 8
                candidate = (cost + speed_cost + boundary_cost, [*partitions, (start, end)])
                previous = following_states.get(end)
                if previous is None or candidate[0] < previous[0]:
                    following_states[end] = candidate
        states = following_states
        if not states:
            return False

    result = states.get(len(words))
    if result is None:
        return False
    for unit, (start, end), original in zip(group, result[1], original_chunks):
        text = " ".join(words[start:end])
        unit.setdefault("pre_rebalance_greek_text", original)
        unit["greek_text"] = text
        unit["punctuated_text"] = text
        unit["rendered_text"] = wrap_two_lines(text)
        unit["text_rebalanced"] = text != original
        unit["text_rebalance_group"] = group_id
        unit["text_rebalance_strategy"] = strategy
    return True


def rebalance_sentence_text(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Re-segment Greek words locally while leaving WhisperX timing anchors untouched."""
    rebalanced = deepcopy(units)
    original_signature = lexical_signature(" ".join(unit.get("punctuated_text", unit["greek_text"]) for unit in rebalanced))
    groups = _sentence_groups(rebalanced)
    for group_number, group in enumerate(groups, start=1):
        if _needs_hard_rebalance(group):
            _partition_group_text(group, f"S{group_number}", "within_sentence")

    claimed: set[int] = set()
    for group_index, group in enumerate(groups):
        if group_index in claimed or not _needs_hard_rebalance(group):
            continue
        candidates: list[tuple[int, int]] = []
        for size in range(2, min(5, len(groups)) + 1):
            first_start = max(0, group_index - size + 1)
            last_start = min(group_index, len(groups) - size)
            for start in range(first_start, last_start + 1):
                end = start + size
                if any(index in claimed for index in range(start, end)):
                    continue
                if all(_same_speaker(groups[index][-1], groups[index + 1][0]) for index in range(start, end - 1)):
                    candidates.append((start, end))
        candidates.sort(key=lambda value: (value[1] - value[0], groups[value[1] - 1][-1]["end_ms"] - groups[value[0]][0]["start_ms"]))
        for start, end in candidates:
            cluster = [unit for sentence in groups[start:end] for unit in sentence]
            if _partition_group_text(cluster, f"C{start + 1}-{end}", "adjacent_sentence_cluster"):
                claimed.update(range(start, end))
                break

    if lexical_signature(" ".join(unit["greek_text"] for unit in rebalanced)) != original_signature:
        return deepcopy(units)
    character_cursor = 0
    for unit in rebalanced:
        text = " ".join(unit["greek_text"].split())
        unit["greek_range"] = {"start_char": character_cursor, "end_char": character_cursor + len(text)}
        character_cursor += len(text) + 1
    return rebalanced


def _merge_pair(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any] | None:
    if not _same_speaker(left, right):
        return None
    text = " ".join((
        left.get("punctuated_text", left["greek_text"]),
        right.get("punctuated_text", right["greek_text"]),
    ))
    duration = right["end_ms"] - left["start_ms"]
    rendered = wrap_two_lines(text)
    line_lengths = [len(line) for line in rendered.splitlines()]
    if duration < MIN_DURATION_MS or len(text) / (duration / 1000) > HARD_MAX_CPS:
        return None
    if len(line_lengths) > 2 or max(line_lengths, default=0) > MAX_LINE_CHARACTERS:
        return None
    merged = deepcopy(left)
    left_ids = left.get("merged_alignment_ids") or [left["alignment_id"]]
    right_ids = right.get("merged_alignment_ids") or [right["alignment_id"]]
    merged["alignment_id"] = "+".join([*left_ids, *right_ids])
    merged["merged_alignment_ids"] = [*left_ids, *right_ids]
    merged["source_refs"] = [*left["source_refs"], *right["source_refs"]]
    merged["greek_text"] = text
    merged["punctuated_text"] = text
    merged["rendered_text"] = rendered
    merged["end_ms"] = right["end_ms"]
    merged["audio_anchor_end_ms"] = right["audio_anchor_end_ms"]
    merged["source_word_count"] = left.get("source_word_count", 0) + right.get("source_word_count", 0)
    merged["audio_word_count"] = left.get("audio_word_count", 0) + right.get("audio_word_count", 0)
    merged["audio_speaker_ids"] = list(dict.fromkeys([
        *(left.get("audio_speaker_ids") or []),
        *(right.get("audio_speaker_ids") or []),
    ]))
    merged["confidence"] = min(float(left.get("confidence", 1)), float(right.get("confidence", 1)))
    merged["prosody_boundary"] = right.get("prosody_boundary")
    merged["speaker_change_after"] = right.get("speaker_change_after", False)
    merged["pause_extension_ms"] = right.get("pause_extension_ms", 0)
    return merged


def merge_short_units(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged = deepcopy(units)
    index = 0
    while index < len(merged):
        unit = merged[index]
        if unit["end_ms"] - unit["start_ms"] >= MIN_DURATION_MS:
            index += 1
            continue
        candidates: list[tuple[int, int, dict[str, Any]]] = []
        if index > 0:
            candidate = _merge_pair(merged[index - 1], unit)
            if candidate is not None:
                candidates.append((candidate["end_ms"] - candidate["start_ms"], index - 1, candidate))
        if index + 1 < len(merged):
            candidate = _merge_pair(unit, merged[index + 1])
            if candidate is not None:
                candidates.append((candidate["end_ms"] - candidate["start_ms"], index, candidate))
        if not candidates:
            index += 1
            continue
        _, replace_at, candidate = min(candidates, key=lambda value: value[0])
        merged[replace_at:replace_at + 2] = [candidate]
        index = max(0, replace_at - 1)
    return merged


def borrow_safe_pause_time(units: list[dict[str, Any]], duration_ms: int) -> list[dict[str, Any]]:
    extended = deepcopy(units)
    for index, unit in enumerate(extended):
        characters = _display_characters(unit)
        required = max(MIN_DURATION_MS, math.ceil(characters / HARD_MAX_CPS * 1000))
        need = max(0, required - (unit["end_ms"] - unit["start_ms"]))
        if not need:
            continue
        previous_end = extended[index - 1]["end_ms"] if index > 0 else 0
        following_start = extended[index + 1]["start_ms"] if index + 1 < len(extended) else duration_ms
        before = min(MAX_PAUSE_EXTENSION_MS, max(0, unit["start_ms"] - previous_end - RESERVED_GAP_MS))
        after = min(MAX_PAUSE_EXTENSION_MS, max(0, following_start - unit["end_ms"] - RESERVED_GAP_MS))
        use_before = min(need, before)
        unit["start_ms"] -= use_before
        need -= use_before
        use_after = min(need, after)
        unit["end_ms"] += use_after
        if use_before or use_after:
            unit["safe_pause_extension_before_ms"] = use_before
            unit["safe_pause_extension_after_ms"] = use_after
    return extended


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
        unit["audio_anchor_start_ms"] = max(0, words[0]["start_ms"])
        unit["audio_anchor_end_ms"] = min(duration_ms, words[-1]["end_ms"])
        unit["start_ms"] = max(0, unit["audio_anchor_start_ms"] - PRE_ROLL_MS)
        unit["end_ms"] = min(duration_ms, unit["audio_anchor_end_ms"] + POST_ROLL_MS)
        unit["timing_precision"] = "whisperx_source_word_anchors"
        unit["confidence"] = round(min(float(word["confidence"]) for word in words), 3)

    for index, unit in enumerate(retimed):
        display_characters = _display_characters(unit)
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

    retimed = merge_short_units(retimed)
    retimed = rebalance_sentence_text(retimed)
    retimed = borrow_safe_pause_time(retimed, duration_ms)

    for unit in retimed:
        display_characters = _display_characters(unit)
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
    late_anchor_starts = [
        unit["alignment_id"]
        for unit in retimed
        if unit["start_ms"] - unit["audio_anchor_start_ms"] > RESERVED_GAP_MS
    ]
    early_anchor_ends = [
        unit["alignment_id"]
        for unit in retimed
        if unit["audio_anchor_end_ms"] - unit["end_ms"] > RESERVED_GAP_MS
    ]
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
        "rebalanced_sentence_groups": len({
            unit["timing_rebalance_group"]
            for unit in retimed
            if unit.get("timing_rebalanced")
        }),
        "text_rebalanced_groups": len({
            unit["text_rebalance_group"]
            for unit in retimed
            if unit.get("text_rebalanced")
        }),
        "text_rebalanced_units": [unit["alignment_id"] for unit in retimed if unit.get("text_rebalanced")],
        "merged_units": [
            {"alignment_id": unit["alignment_id"], "source_alignment_ids": unit["merged_alignment_ids"]}
            for unit in retimed
            if unit.get("merged_alignment_ids")
        ],
        "safe_pause_extended_units": [
            unit["alignment_id"]
            for unit in retimed
            if unit.get("safe_pause_extension_before_ms") or unit.get("safe_pause_extension_after_ms")
        ],
        "max_timing_shift_ms": max((
            max(abs(unit.get("timing_shift_start_ms", 0)), abs(unit.get("timing_shift_end_ms", 0)))
            for unit in retimed
        ), default=0),
        "late_anchor_starts": late_anchor_starts,
        "early_anchor_ends": early_anchor_ends,
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
        late_anchor_starts,
        early_anchor_ends,
    ))
    return {**alignment, "timing_source": "whisperx_audio", "units": retimed}, audit
