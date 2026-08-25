import unittest

from greektube_worker.models import TimelineWord
from greektube_worker.prosody import build_prosody_map


def word(number, start, end, punctuation="", speaker="SPEAKER_00", status="exact"):
    return TimelineWord(
        word_id=f"W{number:06d}",
        source_index=number - 1,
        cue_id=number,
        cue_word_index=0,
        cue_subword_index=0,
        text="word",
        normalized="word",
        source_punctuation=punctuation,
        start_ms=start,
        end_ms=end,
        confidence=0.95,
        speaker_id=speaker,
        alignment_status=status,
        asr_word_index=number - 1,
    )


class ProsodyTests(unittest.TestCase):
    def test_long_pause_is_sentence_end(self):
        result = build_prosody_map([word(1, 0, 300), word(2, 1100, 1400)])
        self.assertEqual(result[0]["class"], "sentence_end")
        self.assertEqual(result[0]["pause_ms"], 800)

    def test_speaker_change_is_never_auto_applied(self):
        result = build_prosody_map([
            word(1, 0, 300, speaker="SPEAKER_00"),
            word(2, 320, 600, speaker="SPEAKER_01"),
        ])
        self.assertEqual(result[0]["class"], "speaker_change")
        self.assertEqual(result[0]["apply_policy"], "pending_review")

    def test_fallback_boundary_is_uncertain(self):
        result = build_prosody_map([word(1, 0, 300, status="local_fallback"), word(2, 400, 600)])
        self.assertEqual(result[0]["class"], "uncertain")
        self.assertEqual(result[0]["apply_policy"], "pending_review")


if __name__ == "__main__":
    unittest.main()
