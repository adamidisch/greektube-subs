import hashlib
import json
import unittest

from greektube_worker.models import SourceCue, source_cues_hash
from greektube_worker.web_review import compile_web_review, web_content_hash


class WebReviewTests(unittest.TestCase):
    def inputs(self):
        source = [{"start": 0, "duration": 2, "text": "Yes."}]
        target = [{"start": 0, "duration": 2, "text": "Ναι."}]
        words = [{"word_id": "W000001", "source_index": 0, "cue_id": 1, "text": "Yes", "start_ms": 100,
                  "end_ms": 1900, "confidence": .9, "timing_evidence": "forced_alignment"}]
        alignment = {"sourceHash": source_cues_hash([SourceCue(1, 0, 2000, "Yes.")]),
                     "audioSha256": "a" * 64, "model": "CTC", "method": "direct", "words": words,
                     "wordTimelineHash": hashlib.sha256(json.dumps(words, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()}
        draft = {**{k: alignment[k] for k in ("sourceHash", "audioSha256", "wordTimelineHash")},
                 "events": [{"start": .1, "duration": 1.8, "text": "Ναι.", "firstWordId": "W000001", "lastWordId": "W000001"}]}
        report = {"videoId": "xYB6uYyRjCA", "source": source, "translation": target,
                  "sourceHash": web_content_hash(source), "translationHash": web_content_hash(target)}
        return alignment, draft, report

    def test_export_is_compact_and_never_asserts_human_review(self):
        artifact = compile_web_review(*self.inputs())
        self.assertFalse(artifact["humanAudioReview"])
        self.assertEqual(artifact["events"][0]["timing"], "audio_aligned")
        self.assertEqual(artifact["events"][0]["sourceWordRange"], [0, 0])
        self.assertEqual(artifact["audioEvidence"]["words"], [[100, 1900, 900, 1]])

    def test_partial_pilot_cannot_replace_whole_video(self):
        a, d, r = self.inputs()
        r["source"].append({"start": 3, "duration": 2, "text": "No."})
        r["translation"].append({"start": 3, "duration": 2, "text": "Όχι."})
        r["sourceHash"] = web_content_hash(r["source"])
        r["translationHash"] = web_content_hash(r["translation"])
        with self.assertRaisesRegex(ValueError, "partial pilots"):
            compile_web_review(a, d, r)

    def test_stale_report_and_changed_word_evidence_stop_export(self):
        for which in ("report", "words", "draft"):
            a, d, r = self.inputs()
            if which == "report":
                r["translation"][0]["text"] = "Άλλαξε."
            elif which == "words":
                a["words"][0]["start_ms"] = 0
            else:
                d["audioSha256"] = "b" * 64
            with self.assertRaises(ValueError):
                compile_web_review(a, d, r)


if __name__ == "__main__":
    unittest.main()
