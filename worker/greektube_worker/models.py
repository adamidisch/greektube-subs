from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class SourceCue:
    cue_id: int
    start_ms: int
    end_ms: int
    text: str

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "SourceCue":
        return cls(
            cue_id=int(value.get("cueId", value.get("cue_id"))),
            start_ms=int(value.get("startMs", value.get("start_ms"))),
            end_ms=int(value.get("endMs", value.get("end_ms"))),
            text=str(value["text"]),
        )


@dataclass(frozen=True)
class SourceToken:
    source_index: int
    cue_id: int
    cue_word_index: int
    cue_start_ms: int
    cue_end_ms: int
    text: str
    normalized: str
    trailing_punctuation: str


@dataclass(frozen=True)
class AsrWord:
    asr_index: int
    text: str
    normalized: str
    start_ms: int
    end_ms: int
    confidence: float
    speaker_id: str | None


@dataclass
class TimelineWord:
    word_id: str
    source_index: int
    cue_id: int
    cue_word_index: int
    text: str
    normalized: str
    source_punctuation: str
    start_ms: int | None
    end_ms: int | None
    confidence: float
    speaker_id: str | None
    alignment_status: str
    asr_word_index: int | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def source_cues_hash(cues: list[SourceCue]) -> str:
    canonical = "".join(
        f"{cue.cue_id}|{cue.start_ms}|{cue.end_ms}|{' '.join(cue.text.split())}\n"
        for cue in cues
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
