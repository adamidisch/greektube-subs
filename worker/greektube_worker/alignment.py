from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

from .models import AsrWord, SourceCue, SourceToken, TimelineWord


TOKEN_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.UNICODE)


def normalize_token(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold()).replace("’", "'")
    return "".join(char for char in folded if char.isalnum() or char == "'")


def tokenize_source(cues: list[SourceCue]) -> list[SourceToken]:
    tokens: list[SourceToken] = []
    source_index = 0
    for cue in cues:
        matches = list(TOKEN_RE.finditer(cue.text))
        for cue_word_index, match in enumerate(matches):
            next_start = matches[cue_word_index + 1].start() if cue_word_index + 1 < len(matches) else len(cue.text)
            suffix = cue.text[match.end():next_start]
            punctuation = "".join(char for char in suffix if not char.isspace() and not char.isalnum())
            text = match.group(0)
            normalized = normalize_token(text)
            if not normalized:
                continue
            tokens.append(SourceToken(
                source_index=source_index,
                cue_id=cue.cue_id,
                cue_word_index=cue_word_index,
                cue_start_ms=cue.start_ms,
                cue_end_ms=cue.end_ms,
                text=text,
                normalized=normalized,
                trailing_punctuation=punctuation,
            ))
            source_index += 1
    return tokens


def flatten_asr_words(aligned_result: dict[str, Any]) -> list[AsrWord]:
    words: list[AsrWord] = []
    for segment in aligned_result.get("segments", []):
        segment_speaker = segment.get("speaker")
        for raw in segment.get("words", []):
            start = raw.get("start")
            end = raw.get("end")
            text = str(raw.get("word", "")).strip()
            normalized = normalize_token(text)
            if start is None or end is None or not normalized or float(end) <= float(start):
                continue
            words.append(AsrWord(
                asr_index=len(words),
                text=text,
                normalized=normalized,
                start_ms=round(float(start) * 1000),
                end_ms=round(float(end) * 1000),
                confidence=max(0.0, min(1.0, float(raw.get("score", segment.get("score", 0.75))))),
                speaker_id=str(raw.get("speaker") or segment_speaker) if raw.get("speaker") or segment_speaker else None,
            ))
    return words


def _similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    return SequenceMatcher(None, left, right, autojunk=False).ratio()


def _align_small_gap(
    source: list[SourceToken],
    asr: list[AsrWord],
    source_offset: int,
    asr_offset: int,
) -> dict[int, tuple[int, str]]:
    if not source or not asr:
        return {}
    if len(source) > 80 or len(asr) > 80:
        mapping: dict[int, tuple[int, str]] = {}
        cursor = 0
        for source_index, token in enumerate(source):
            candidates = range(cursor, min(len(asr), cursor + 12))
            best = max(candidates, key=lambda index: _similarity(token.normalized, asr[index].normalized), default=-1)
            if best >= 0 and _similarity(token.normalized, asr[best].normalized) >= 0.78:
                mapping[source_offset + source_index] = (asr_offset + best, "fuzzy")
                cursor = best + 1
        return mapping

    rows = len(source) + 1
    cols = len(asr) + 1
    scores = [[0] * cols for _ in range(rows)]
    pointers = [[""] * cols for _ in range(rows)]
    for i in range(1, rows):
        scores[i][0] = -i
        pointers[i][0] = "up"
    for j in range(1, cols):
        scores[0][j] = -j
        pointers[0][j] = "left"

    for i in range(1, rows):
        for j in range(1, cols):
            ratio = _similarity(source[i - 1].normalized, asr[j - 1].normalized)
            match_score = 3 if ratio == 1 else 2 if ratio >= 0.86 else 1 if ratio >= 0.72 else -3
            choices = (
                (scores[i - 1][j - 1] + match_score, "diag"),
                (scores[i - 1][j] - 1, "up"),
                (scores[i][j - 1] - 1, "left"),
            )
            scores[i][j], pointers[i][j] = max(choices, key=lambda item: item[0])

    mapping: dict[int, tuple[int, str]] = {}
    i, j = len(source), len(asr)
    while i > 0 or j > 0:
        pointer = pointers[i][j]
        if pointer == "diag":
            ratio = _similarity(source[i - 1].normalized, asr[j - 1].normalized)
            if ratio >= 0.72:
                mapping[source_offset + i - 1] = (asr_offset + j - 1, "exact" if ratio == 1 else "fuzzy")
            i -= 1
            j -= 1
        elif pointer == "up":
            i -= 1
        else:
            j -= 1
    return mapping


def align_token_sequences(source: list[SourceToken], asr: list[AsrWord]) -> dict[int, tuple[int, str]]:
    source_norms = [token.normalized for token in source]
    asr_norms = [word.normalized for word in asr]
    matcher = SequenceMatcher(None, source_norms, asr_norms, autojunk=False)
    mapping: dict[int, tuple[int, str]] = {}
    previous_source = 0
    previous_asr = 0
    for block in matcher.get_matching_blocks():
        mapping.update(_align_small_gap(
            source[previous_source:block.a],
            asr[previous_asr:block.b],
            previous_source,
            previous_asr,
        ))
        for offset in range(block.size):
            mapping[block.a + offset] = (block.b + offset, "exact")
        previous_source = block.a + block.size
        previous_asr = block.b + block.size
    return mapping


def _fill_local_fallbacks(timeline: list[TimelineWord], tokens: list[SourceToken]) -> None:
    index = 0
    while index < len(timeline):
        if timeline[index].start_ms is not None:
            index += 1
            continue
        group_start = index
        cue_id = timeline[index].cue_id
        while index < len(timeline) and timeline[index].start_ms is None and timeline[index].cue_id == cue_id:
            index += 1
        group_end = index
        token = tokens[group_start]
        previous = timeline[group_start - 1] if group_start > 0 and timeline[group_start - 1].end_ms is not None else None
        following = timeline[group_end] if group_end < len(timeline) and timeline[group_end].start_ms is not None else None
        lower = max(token.cue_start_ms, previous.end_ms if previous and previous.end_ms is not None else token.cue_start_ms)
        upper = min(token.cue_end_ms, following.start_ms if following and following.start_ms is not None else token.cue_end_ms)
        count = group_end - group_start
        if upper - lower < count * 40:
            continue
        step = (upper - lower) / count
        status = "local_fallback" if previous or following else "cue_fallback"
        confidence = 0.42 if status == "local_fallback" else 0.2
        for offset, timeline_index in enumerate(range(group_start, group_end)):
            start_ms = round(lower + offset * step)
            end_ms = round(lower + (offset + 1) * step)
            timeline[timeline_index].start_ms = start_ms
            timeline[timeline_index].end_ms = max(start_ms + 1, end_ms)
            timeline[timeline_index].confidence = confidence
            timeline[timeline_index].alignment_status = status


def build_word_timeline(cues: list[SourceCue], aligned_result: dict[str, Any]) -> tuple[list[TimelineWord], list[AsrWord]]:
    tokens = tokenize_source(cues)
    asr_words = flatten_asr_words(aligned_result)
    mapping = align_token_sequences(tokens, asr_words)
    timeline: list[TimelineWord] = []
    for token in tokens:
        match = mapping.get(token.source_index)
        asr_word = asr_words[match[0]] if match else None
        timeline.append(TimelineWord(
            word_id=f"W{token.source_index + 1:06d}",
            source_index=token.source_index,
            cue_id=token.cue_id,
            cue_word_index=token.cue_word_index,
            text=token.text,
            normalized=token.normalized,
            source_punctuation=token.trailing_punctuation,
            start_ms=asr_word.start_ms if asr_word else None,
            end_ms=asr_word.end_ms if asr_word else None,
            confidence=asr_word.confidence if asr_word else 0.0,
            speaker_id=asr_word.speaker_id if asr_word else None,
            alignment_status=match[1] if match else "unaligned",
            asr_word_index=asr_word.asr_index if asr_word else None,
        ))
    _fill_local_fallbacks(timeline, tokens)
    return timeline, asr_words
