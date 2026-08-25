import unittest

from greektube_worker.models import TimelineWord
from greektube_worker.prosody import build_prosody_map
from greektube_worker.validation import validate_artifact


def timeline_word(number, start, end, status="exact"):
    return TimelineWord(
        word_id=f"W{number:06d}",
        source_index=number - 1,
        cue_id=1,
        cue_word_index=number - 1,
        cue_subword_index=0,
        text=f"w{number}",
        normalized=f"w{number}",
        source_punctuation="",
        start_ms=start,
        end_ms=end,
        confidence=0.9,
        speaker_id=None,
        alignment_status=status,
        asr_word_index=number - 1,
    )


class ValidationTests(unittest.TestCase):
    def test_clean_timeline_passes(self):
        timeline = [timeline_word(1, 100, 300), timeline_word(2, 350, 600)]
        result = validate_artifact(timeline, build_prosody_map(timeline), 1000)
        self.assertTrue(result["ok"])

    def test_timestamp_regression_fails(self):
        timeline = [timeline_word(1, 500, 700), timeline_word(2, 300, 450)]
        result = validate_artifact(timeline, build_prosody_map(timeline), 1000)
        self.assertFalse(result["ok"])
        self.assertEqual(result["timestamp_regressions"], 1)

    def test_unaligned_word_fails_coverage_gate(self):
        timeline = [timeline_word(1, 100, 300), timeline_word(2, None, None, "unaligned")]
        result = validate_artifact(timeline, build_prosody_map(timeline), 1000)
        self.assertFalse(result["ok"])
        self.assertEqual(result["unaligned_words"], 1)


if __name__ == "__main__":
    unittest.main()
