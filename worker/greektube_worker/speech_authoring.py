"""Choose stable subtitle blocks from semantically translated, word-anchored phrases.

Translation phrases explicitly reference source word ranges. Greek character
positions are never used to estimate when an English phrase was spoken.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any


class AuthoringNeedsReview(ValueError):
    pass


def validate_translation_numbers(source: str, target: str) -> None:
    def values(text):
        return [value.replace(",", ".").replace(" ", "").replace("–", "-").replace("−", "-")
                for value in re.findall(r"(?<!\w)[−-]?\d+(?:[.,:/–-]\d+)*\s*%?", text)]
    if values(source) != values(target):
        raise AuthoringNeedsReview("Numeric content changed; bilingual repair is required")


@dataclass(frozen=True)
class TranslationPhrase:
    first_word: str
    last_word: str
    text: str
    hard_break_before: bool = False


def subtitle_lines(text: str) -> list[str] | None:
    text = " ".join(text.split())
    if not text or len(text) > 84:
        return None
    if len(text) <= 42:
        return [text]
    words = text.split()
    dangling = {"ο", "η", "το", "οι", "τα", "και", "ή", "να", "θα", "δεν", "σε", "με", "για", "από", "του", "της", "των"}
    choices = []
    for split in range(1, len(words)):
        left, right = " ".join(words[:split]), " ".join(words[split:])
        if len(left) <= 42 and len(right) <= 42:
            penalty = abs(len(left) - len(right))
            if words[split - 1].lower().strip(".,;:") in dangling:
                penalty += 30
            if left.endswith((".", ";", "!", "?", ":")):
                penalty -= 10
            choices.append((penalty, left, right))
    if not choices:
        return None
    _, left, right = min(choices)
    return [left, right]


def author_phrases(words: list[dict[str, Any]], phrases: list[TranslationPhrase],
                   max_cps: float = 17.0) -> list[dict[str, Any]]:
    if not words or not phrases or max_cps <= 0:
        raise AuthoringNeedsReview("Empty or invalid authoring input")
    indexes = {word["word_id"]: i for i, word in enumerate(words)}
    if len(indexes) != len(words):
        raise AuthoringNeedsReview("Duplicate source word identifiers")
    ranges = []
    cursor = 0
    for phrase in phrases:
        first, last = indexes.get(phrase.first_word, -1), indexes.get(phrase.last_word, -1)
        if first != cursor or last < first or not phrase.text.strip():
            raise AuthoringNeedsReview("Translation must cover each source word once, in order")
        ranges.append((first, last))
        cursor = last + 1
    if cursor != len(words):
        raise AuthoringNeedsReview("Translation source coverage is incomplete")
    previous_end = -1
    for word in words:
        start, end = word["start_ms"], word["end_ms"]
        if start is None or end is None or start < previous_end or end <= start:
            raise AuthoringNeedsReview(f"Invalid word timing: {word['word_id']}")
        previous_end = end

    n = len(phrases)
    best = [float("inf")] * (n + 1)
    paths: list[Any] = [None] * (n + 1)
    best[0] = 0
    for first_phrase in range(n):
        if best[first_phrase] == float("inf"):
            continue
        text = ""
        for last_phrase in range(first_phrase, n):
            if last_phrase > first_phrase:
                if phrases[last_phrase].hard_break_before:
                    break
                prior_last = words[ranges[last_phrase - 1][1]]
                next_first = words[ranges[last_phrase][0]]
                if next_first["start_ms"] - prior_last["end_ms"] > 600:
                    break
            text = " ".join((text + " " + phrases[last_phrase].text).split())
            lines = subtitle_lines(text)
            if len(text) > 84:
                break
            if lines is None:
                continue
            first_word, last_word = ranges[first_phrase][0], ranges[last_phrase][1]
            start = words[first_word]["start_ms"]
            speech_end = words[last_word]["end_ms"]
            next_start = words[last_word + 1]["start_ms"] if last_word + 1 < len(words) else speech_end
            end = min(speech_end + 250, next_start)
            duration = (end - start) / 1000
            if duration < 1 or duration > 7 or len(text) / duration > max_cps:
                continue
            # Prefer fewer stable blocks, natural phrase endings and balanced lines.
            score = best[first_phrase] + 10 + abs(len(text) - 62) / 50
            if text.endswith((".", ";", "!", "?")):
                score -= 2
            if len(lines) == 2:
                score += abs(len(lines[0]) - len(lines[1])) / 100
            if score < best[last_phrase + 1]:
                evidence = all(word.get("timing_evidence") == "forced_alignment"
                               for word in words[first_word:last_word + 1])
                event = {"start": start / 1000, "duration": duration, "text": text,
                         "lines": lines, "firstWordId": words[first_word]["word_id"],
                         "lastWordId": words[last_word]["word_id"],
                         "sourceCueIds": list(dict.fromkeys(word["cue_id"] for word in words[first_word:last_word + 1])),
                         "timing": "audio_aligned" if evidence else "estimated"}
                best[last_phrase + 1] = score
                paths[last_phrase + 1] = (first_phrase, event)
    if paths[n] is None:
        reachable = max(i for i, score in enumerate(best) if score != float("inf"))
        phrase = phrases[min(reachable, n - 1)]
        raise AuthoringNeedsReview(f"Wording or timing needs review near {phrase.first_word}: {phrase.text}")
    events = []
    cursor = n
    while cursor:
        cursor, event = paths[cursor]
        events.append(event)
    return list(reversed(events))


def srt(events: list[dict[str, Any]]) -> str:
    def timestamp(seconds: float) -> str:
        value = round(seconds * 1000)
        return f"{value // 3600000:02}:{value // 60000 % 60:02}:{value // 1000 % 60:02},{value % 1000:03}"
    return "\n\n".join(f"{i + 1}\n{timestamp(event['start'])} --> {timestamp(event['start'] + event['duration'])}\n" + "\n".join(event["lines"])
                         for i, event in enumerate(events)) + "\n"
