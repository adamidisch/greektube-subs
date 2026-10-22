"""Provider-neutral translation/review contract for the word-anchored authorer.

The caller supplies an existing approved JSON provider and global brief. This
module never discovers credentials, starts jobs or retries provider failures.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Callable

from .speech_authoring import AuthoringNeedsReview, TranslationPhrase, author_phrases, validate_translation_numbers


TRANSLATOR_PROMPT = """Translate the complete supplied English discourse into concise, idiomatic Greek subtitles.
Read the whole-video brief, locked glossary and neighbouring context first. Preserve all meaningful content,
negation, hedging, attribution, causality, chronology, names, numbers and units. The existing Greek is an
editable reference, not authoritative evidence. Reconstruct complete meanings instead of translating raw cues.
Return semantic Greek phrases, each with firstWordId and lastWordId from the supplied source words.
Cover every supplied source word exactly once in source order. Do not infer times from Greek word lengths.
A phrase may cover several words or clauses. Keep it short enough for 17 characters/second, two lines
of 42 characters and 1–7 seconds. Aim below 15.5 CPS for margin. Preserve numerical expressions as digits.
Set hardBreakBefore only for a speaker turn or a mandatory semantic boundary. Never change source times.
Do not add a comma immediately before και or ή. Uppercase Greek must have no tonos.
Return JSON only: {"phrases":[{"firstWordId":"W000001","lastWordId":"W000008","text":"...","hardBreakBefore":false}]}.
If essential meaning cannot fit, return {"status":"manual_review_required","issues":["..."]} instead of omitting it."""

REVIEWER_PROMPT = """Independently review the proposed Greek audiovisual subtitles against the full English source,
whole-video brief and glossary. Check meaning, negation, uncertainty, attribution, technical terms, quantities
and units. Read the whole sentence across phrase boundaries. Repair awkward Greek or overlong wording
without adding facts or losing meaning. Check that each source-word range supports its Greek phrase.
Retain complete ordered source-word coverage. Repair any reported authoring failure using natural phrasing,
never by delaying later speech. Preserve numerical expressions as digits. Return JSON only:
{"status":"approved","phrases":[{"firstWordId":"...","lastWordId":"...","text":"...","hardBreakBefore":false}],"issues":[]}.
If fidelity or fit cannot be resolved, return status manual_review_required with actionable issues.
Approval is a bilingual model review, not human audio approval."""


def build_translation_packet(alignment: dict[str, Any], cue_ids: list[int],
                             brief: dict[str, Any], existing_greek: str = "",
                             context: dict[str, str] | None = None) -> dict[str, Any]:
    if not brief.get("mainTopic") or not isinstance(brief.get("glossary"), list):
        raise AuthoringNeedsReview("A whole-video brief and locked glossary are required")
    words = [word for word in alignment["words"] if word["cue_id"] in cue_ids]
    source = [cue for cue in alignment["sourceCues"] if cue["cueId"] in cue_ids]
    if not cue_ids or [cue["cueId"] for cue in source] != cue_ids or not words:
        raise AuthoringNeedsReview("Requested semantic scope is missing or reordered")
    if len(words) > 400:
        raise AuthoringNeedsReview("Split the request at a semantic boundary before sending it to the model")
    return {"schemaVersion": 1, "sourceHash": alignment["sourceHash"],
            "audioSha256": alignment["audioSha256"], "wordTimelineHash": alignment["wordTimelineHash"],
            "globalBrief": brief, "readOnlyContext": context or {}, "sourceCueIds": cue_ids,
            "sourceCues": source, "words": words, "existingGreek": existing_greek,
            "constraints": {"maxCps": 17, "targetCps": 15.5, "maxLineCharacters": 42,
                            "maxLines": 2, "minSeconds": 1, "maxSeconds": 7}}


def parse_phrases(value: Any) -> list[TranslationPhrase]:
    if not isinstance(value, dict) or not isinstance(value.get("phrases"), list) or not value["phrases"]:
        raise AuthoringNeedsReview("The semantic model did not return translated phrases")
    phrases = []
    for row in value["phrases"]:
        if not isinstance(row, dict) or any(not isinstance(row.get(key), str) or not row[key].strip()
                                            for key in ("firstWordId", "lastWordId", "text")):
            raise AuthoringNeedsReview("Malformed translated phrase")
        if "hardBreakBefore" in row and not isinstance(row["hardBreakBefore"], bool):
            raise AuthoringNeedsReview("Invalid semantic boundary flag")
        phrases.append(TranslationPhrase(row["firstWordId"], row["lastWordId"],
                                         " ".join(row["text"].split()), row.get("hardBreakBefore", False)))
    return phrases


def translate_and_review(packet: dict[str, Any], model_identity: str,
                         call_json: Callable[[str, dict[str, Any]], dict[str, Any]],
                         cache: dict[str, Any], checkpoint: Callable[[], None]) -> dict[str, Any]:
    identity = {"packet": packet, "providerModel": model_identity,
                "translationPrompt": TRANSLATOR_PROMPT, "reviewPrompt": REVIEWER_PROMPT}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    entry = cache.setdefault(key, {})
    if entry.get("result"):
        return entry["result"]
    if entry.get("status") == "manual_review_required":
        raise AuthoringNeedsReview(entry["issue"])
    # A provider exception propagates immediately. The caller respects cooldown;
    # the saved first-stage output can be resumed without another translation.
    if "proposed" not in entry:
        entry["proposed"] = call_json(TRANSLATOR_PROMPT, packet)
        checkpoint()
    if "reviewed" not in entry:
        entry["reviewed"] = call_json(REVIEWER_PROMPT, {**packet, "proposedGreek": entry["proposed"]})
        checkpoint()
    try:
        reviewed = entry["reviewed"]
        if not isinstance(reviewed, dict) or reviewed.get("status") != "approved" or reviewed.get("issues"):
            raise AuthoringNeedsReview("Independent bilingual QA requires repair")
        phrases = parse_phrases(reviewed)
        validate_translation_numbers(" ".join(cue["text"] for cue in packet["sourceCues"]),
                                     " ".join(phrase.text for phrase in phrases))
        events = author_phrases(packet["words"], phrases)
    except AuthoringNeedsReview as error:
        entry.update({"status": "manual_review_required", "issue": str(error)})
        checkpoint()
        raise
    result = {"status": "draft", "modelBilingualQa": "approved", "humanAudioReview": False,
              "sourceHash": packet["sourceHash"], "audioSha256": packet["audioSha256"],
              "wordTimelineHash": packet["wordTimelineHash"], "sourceCueIds": packet["sourceCueIds"],
              "phrases": reviewed["phrases"], "events": events}
    entry.update({"status": "draft_ready", "result": result})
    checkpoint()
    return result
