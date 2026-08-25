import unittest

from greektube_worker.alignment import build_word_timeline, normalize_token
from greektube_worker.models import SourceCue, source_cues_hash


class AlignmentTests(unittest.TestCase):
    def test_normalize_token_handles_case_and_curly_apostrophe(self):
        self.assertEqual(normalize_token("DON’T"), "don't")

    def test_source_hash_matches_the_typescript_canonical_format(self):
        cues = [SourceCue(1, 80, 3077, "  Multiple   spaces  ")]
        self.assertEqual(
            source_cues_hash(cues),
            "70b9370feca20f15dab2e4be1df8f7c5a31b5fecb06a4422416144d0a09462bc",
        )

    def test_exact_and_fuzzy_source_words_receive_audio_anchors(self):
        cues = [SourceCue(1, 0, 2400, "The insulin receptar works.")]
        aligned = {
            "segments": [{
                "words": [
                    {"word": "The", "start": 0.10, "end": 0.30, "score": 0.99},
                    {"word": "insulin", "start": 0.31, "end": 0.75, "score": 0.98},
                    {"word": "receptor", "start": 0.76, "end": 1.20, "score": 0.96},
                    {"word": "works", "start": 1.21, "end": 1.60, "score": 0.99},
                ]
            }]
        }
        timeline, _ = build_word_timeline(cues, aligned)
        self.assertEqual([word.text for word in timeline], ["The", "insulin", "receptar", "works"])
        self.assertEqual(timeline[2].alignment_status, "fuzzy")
        self.assertEqual(timeline[2].start_ms, 760)
        self.assertEqual(timeline[-1].source_punctuation, ".")

    def test_missing_word_uses_only_local_bounded_fallback(self):
        cues = [SourceCue(7, 1000, 3000, "The ketogenic event")]
        aligned = {
            "segments": [{
                "words": [
                    {"word": "The", "start": 1.10, "end": 1.30, "score": 0.99},
                    {"word": "event", "start": 2.10, "end": 2.40, "score": 0.98},
                ]
            }]
        }
        timeline, _ = build_word_timeline(cues, aligned)
        fallback = timeline[1]
        self.assertEqual(fallback.alignment_status, "local_fallback")
        self.assertGreaterEqual(fallback.start_ms, timeline[0].end_ms)
        self.assertLessEqual(fallback.end_ms, timeline[2].start_ms)
        self.assertEqual(fallback.text, "ketogenic")


if __name__ == "__main__":
    unittest.main()
