import unittest
import json
from pathlib import Path
from greektube_worker.speech_authoring import AuthoringNeedsReview, TranslationPhrase, author_phrases, validate_translation_numbers


def word(index, start, end):
    return {"word_id": f"W{index:06}", "start_ms": start, "end_ms": end,
            "cue_id": index, "timing_evidence": "forced_alignment"}


class SpeechAuthoringTests(unittest.TestCase):
    def test_medical_quantities_cannot_disappear_or_change_during_compression(self):
        validate_translation_numbers("2.5 mg and 50%", "2,5 mg και 50%")
        with self.assertRaises(AuthoringNeedsReview):
            validate_translation_numbers("2.5 mg and 50%", "25 mg και 50%")
        with self.assertRaises(AuthoringNeedsReview):
            validate_translation_numbers("-5 degrees", "5 βαθμοί")

    def test_word_boundaries_anchor_greek_even_when_translation_length_differs(self):
        words = [word(1, 1000, 1900), word(2, 3000, 4500)]
        phrases = [TranslationPhrase("W000001", "W000001", "Ναι."),
                   TranslationPhrase("W000002", "W000002", "Αυτό ισχύει.", True)]
        events = author_phrases(words, phrases)
        self.assertEqual([event["start"] for event in events], [1, 3])
        self.assertEqual([event["text"] for event in events], ["Ναι.", "Αυτό ισχύει."])

    def test_unreadable_translation_requests_repair_without_shifting_next_speech(self):
        words = [word(1, 1000, 1500), word(2, 1600, 2700)]
        phrases = [TranslationPhrase("W000001", "W000001", "Αυτή η υπερβολικά μεγάλη φράση δεν χωρά στον διαθέσιμο χρόνο."),
                   TranslationPhrase("W000002", "W000002", "Ναι.", True)]
        with self.assertRaises(AuthoringNeedsReview):
            author_phrases(words, phrases)

    def test_missing_or_duplicated_source_coverage_is_rejected(self):
        words = [word(1, 0, 1000), word(2, 1100, 2100)]
        with self.assertRaises(AuthoringNeedsReview):
            author_phrases(words, [TranslationPhrase("W000002", "W000002", "Ναι.")])

    def test_adjacent_micro_phrases_can_form_a_stable_readable_block(self):
        words = [word(1, 0, 500), word(2, 600, 2000)]
        phrases = [TranslationPhrase("W000001", "W000001", "Το"),
                   TranslationPhrase("W000002", "W000002", "πιστεύω.")]
        events = author_phrases(words, phrases)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["text"], "Το πιστεύω.")
        self.assertEqual(events[0]["duration"], 2)

    def test_estimated_audio_stays_estimated_even_when_layout_passes(self):
        source_word = word(1, 0, 2000)
        source_word["timing_evidence"] = "estimated"
        events = author_phrases([source_word], [TranslationPhrase("W000001", "W000001", "Ναι.")])
        self.assertEqual(events[0]["timing"], "estimated")

    def test_sarah_opening_uses_actual_word_boundaries_and_has_no_fast_or_tiny_pages(self):
        value = json.loads((Path(__file__).parents[1] / "fixtures" / "sarah-opening-authoring.json").read_text())
        phrases = [TranslationPhrase(p["firstWordId"], p["lastWordId"], p["text"], p.get("hardBreakBefore", False))
                   for p in value["phrases"]]
        events = author_phrases(value["words"], phrases)
        self.assertEqual(len(events), 6)
        self.assertTrue(all(1.5 <= event["duration"] <= 7 for event in events))
        self.assertTrue(all(len(event["text"]) / event["duration"] <= 17 for event in events))
        self.assertTrue(all(len(line) <= 42 for event in events for line in event["lines"]))
        self.assertTrue(all(a["start"] + a["duration"] <= b["start"] + .001 for a, b in zip(events, events[1:])))
        self.assertAlmostEqual(events[-1]["start"] + events[-1]["duration"], 24.761, places=3)
        self.assertIn("δεν διαγιγνώσκεται μόνο", " ".join(event["text"] for event in events))


if __name__ == "__main__":
    unittest.main()
