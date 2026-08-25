import unittest

from scripts.run_proof import retime_units


class ProofRenderingTests(unittest.TestCase):
    def test_units_inherit_source_word_anchors_without_overlap(self):
        units = [
            {
                "alignment_id": "A001",
                "greek_text": "Ένα σύντομο κείμενο",
                "rendered_text": "Ένα σύντομο κείμενο",
                "source_refs": [{"cue_id": 1, "token_start": 0, "token_end": 2}],
                "speaker": "guest",
                "start_ms": 0,
                "end_ms": 1500,
            },
            {
                "alignment_id": "A002",
                "greek_text": "και η συνέχειά του.",
                "rendered_text": "και η συνέχειά του.",
                "source_refs": [{"cue_id": 1, "token_start": 2, "token_end": 4}],
                "speaker": "guest",
                "start_ms": 1500,
                "end_ms": 3000,
            },
        ]
        timeline = [
            {"source_index": 0, "cue_id": 1, "cue_word_index": 0, "start_ms": 200, "end_ms": 450, "confidence": 0.9},
            {"source_index": 1, "cue_id": 1, "cue_word_index": 1, "start_ms": 500, "end_ms": 800, "confidence": 0.9},
            {"source_index": 2, "cue_id": 1, "cue_word_index": 2, "start_ms": 900, "end_ms": 1200, "confidence": 0.9},
            {"source_index": 3, "cue_id": 1, "cue_word_index": 3, "start_ms": 1250, "end_ms": 1600, "confidence": 0.9},
        ]
        result = retime_units(units, timeline, 3000)
        self.assertEqual(result[0]["timing_precision"], "whisperx_source_word_anchors")
        self.assertLessEqual(result[0]["end_ms"], result[1]["start_ms"])
        self.assertEqual(result[0]["audio_anchor_start_ms"], 200)
        self.assertEqual(result[1]["audio_anchor_end_ms"], 1600)


if __name__ == "__main__":
    unittest.main()
