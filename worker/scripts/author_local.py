"""Author an SRT from a bound word timeline and translated semantic phrases.

This command writes a review draft. It never publishes or asserts human review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from greektube_worker.direct_alignment import alignment_audit
from greektube_worker.models import SourceCue, source_cues_hash
from greektube_worker.speech_authoring import TranslationPhrase, author_phrases, srt, validate_translation_numbers
from .align_local import write_json


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alignment", type=Path, required=True)
    parser.add_argument("--phrases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="JSON draft; SRT is written alongside it")
    args = parser.parse_args()
    protected = {args.alignment.resolve(), args.phrases.resolve()}
    if args.output.resolve() in protected or args.output.with_suffix(".srt").resolve() in protected:
        parser.error("Draft output must not overwrite input evidence")
    alignment = json.loads(args.alignment.read_text())
    translated = json.loads(args.phrases.read_text())
    actual_hash = hashlib.sha256(json.dumps(alignment["words"], sort_keys=True,
                                           separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    if actual_hash != alignment.get("wordTimelineHash"):
        raise ValueError("Word timeline integrity check failed")
    if source_cues_hash([SourceCue.from_dict(cue) for cue in alignment["sourceCues"]]) != alignment.get("selectedSourceHash"):
        raise ValueError("Original source evidence integrity check failed")
    for field in ("sourceHash", "audioSha256", "wordTimelineHash"):
        if translated.get(field) != alignment.get(field):
            raise ValueError(f"Translation belongs to different {field}")
    cue_ids = translated["sourceCueIds"]
    if not cue_ids or len(cue_ids) != len(set(cue_ids)):
        raise ValueError("Invalid source scope")
    words = [word for word in alignment["words"] if word["cue_id"] in cue_ids]
    if list(dict.fromkeys(word["cue_id"] for word in words)) != cue_ids:
        raise ValueError("Missing or reordered source scope")
    phrases = [TranslationPhrase(row["firstWordId"], row["lastWordId"], row["text"],
                                 bool(row.get("hardBreakBefore", False))) for row in translated["phrases"]]
    source_cues = [cue for cue in alignment["sourceCues"] if cue["cueId"] in cue_ids]
    if [cue["cueId"] for cue in source_cues] != cue_ids:
        raise ValueError("Original source evidence is incomplete")
    validate_translation_numbers(" ".join(cue["text"] for cue in source_cues), " ".join(p.text for p in phrases))
    events = author_phrases(words, phrases)
    audit = alignment_audit(words)
    artifact = {"schemaVersion": 1, "status": "draft", "sourceHash": alignment["sourceHash"],
                "audioSha256": alignment["audioSha256"], "wordTimelineHash": actual_hash,
                "sourceCueIds": cue_ids, "events": events, "alignmentAudit": audit,
                "readability": {"events": len(events), "maxCps": max(len(e["text"]) / e["duration"] for e in events),
                                "shortEvents": sum(e["duration"] < 1.5 for e in events)},
                "translationReview": "draft", "humanAudioReview": False,
                "professionalPublished": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.with_suffix(".srt").write_text(srt(events), encoding="utf-8")
    write_json(args.output, artifact)
    print(json.dumps({"output": str(args.output), "readability": artifact["readability"],
                      "alignmentIssues": len(audit["issues"]), "status": "draft"}))


if __name__ == "__main__":
    main()
