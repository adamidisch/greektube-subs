import unittest

from greektube_worker.proof import apply_prosody_punctuation, merge_short_units, render_proof, retime_units


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
        self.assertGreaterEqual(result[1]["start_ms"] - result[0]["end_ms"], 120)
        self.assertEqual(result[0]["audio_anchor_start_ms"], 200)
        self.assertEqual(result[1]["audio_anchor_end_ms"], 1600)

    def test_prosody_pass_changes_only_punctuation(self):
        units = [{
            "alignment_id": "A001",
            "greek_text": "Αυτό είναι δοκιμή",
            "source_refs": [{"cue_id": 1, "token_start": 0, "token_end": 2}],
        }]
        timeline = [
            {"word_id": "w1", "source_index": 0, "cue_id": 1, "cue_word_index": 0},
            {"word_id": "w2", "source_index": 1, "cue_id": 1, "cue_word_index": 1},
        ]
        prosody = [{"after_word_id": "w2", "class": "sentence_end"}]
        rendered, violations = apply_prosody_punctuation(units, timeline, prosody)
        self.assertEqual(rendered[0]["punctuated_text"], "Αυτό είναι δοκιμή.")
        self.assertEqual(violations, [])

    def test_hard_cps_blocks_final_output(self):
        units = [{
            "alignment_id": "A001",
            "greek_text": "Αυτό είναι ένα υπερβολικά μεγάλο κείμενο για έναν πολύ μικρό πραγματικό χρόνο",
            "source_refs": [{"cue_id": 1, "token_start": 0, "token_end": 2}],
            "speaker": "guest",
            "start_ms": 0,
            "end_ms": 500,
        }]
        timeline = [
            {"word_id": "w1", "source_index": 0, "cue_id": 1, "cue_word_index": 0, "start_ms": 0, "end_ms": 150, "confidence": 1.0, "speaker_id": "S1"},
            {"word_id": "w2", "source_index": 1, "cue_id": 1, "cue_word_index": 1, "start_ms": 200, "end_ms": 400, "confidence": 1.0, "speaker_id": "S1"},
        ]
        alignment, audit = render_proof({"units": units}, timeline, [], 500)
        self.assertIn("HARD_CPS_EXCEEDED", alignment["units"][0]["issues"])
        self.assertFalse(audit["final_output_allowed"])

    def test_sentence_rebalancing_repairs_bad_internal_time_allocation(self):
        units = [
            {
                "alignment_id": "A001",
                "greek_text": " ".join(["λέξη"] * 12),
                "source_refs": [{"cue_id": 1, "token_start": 0, "token_end": 1}],
                "speaker": "guest",
                "start_ms": 0,
                "end_ms": 2400,
            },
            {
                "alignment_id": "A002",
                "greek_text": "μικρό τέλος.",
                "source_refs": [{"cue_id": 1, "token_start": 1, "token_end": 2}],
                "speaker": "guest",
                "start_ms": 2520,
                "end_ms": 5000,
            },
        ]
        timeline = [
            {"word_id": "w1", "source_index": 0, "cue_id": 1, "cue_word_index": 0, "start_ms": 80, "end_ms": 2280, "confidence": 1.0, "speaker_id": "S1"},
            {"word_id": "w2", "source_index": 1, "cue_id": 1, "cue_word_index": 1, "start_ms": 2520, "end_ms": 4880, "confidence": 1.0, "speaker_id": "S1"},
        ]

        alignment, audit = render_proof({"units": units}, timeline, [], 5000)

        repaired = alignment["units"]
        self.assertNotIn("HARD_CPS_EXCEEDED", repaired[0]["issues"])
        self.assertGreaterEqual(repaired[1]["start_ms"] - repaired[0]["end_ms"], 120)
        self.assertEqual(repaired[0]["start_ms"], 0)
        self.assertEqual(repaired[-1]["end_ms"], 5000)
        self.assertEqual(audit["rebalanced_sentence_groups"], 0)
        self.assertEqual(audit["text_rebalanced_groups"], 1)
        self.assertTrue(any(unit.get("text_rebalanced") for unit in repaired))

    def test_short_unit_can_merge_with_same_speaker_neighbor(self):
        units = [
            {
                "alignment_id": "A001",
                "greek_text": "πολύ μικρό",
                "punctuated_text": "πολύ μικρό",
                "source_refs": [{"cue_id": 1, "token_start": 0, "token_end": 1}],
                "speaker": "guest",
                "start_ms": 0,
                "end_ms": 700,
                "audio_anchor_end_ms": 650,
                "source_word_count": 1,
                "audio_word_count": 1,
                "audio_speaker_ids": ["S1"],
            },
            {
                "alignment_id": "A002",
                "greek_text": "και η συνέχεια.",
                "punctuated_text": "και η συνέχεια.",
                "source_refs": [{"cue_id": 1, "token_start": 1, "token_end": 3}],
                "speaker": "guest",
                "start_ms": 820,
                "end_ms": 2600,
                "audio_anchor_end_ms": 2500,
                "source_word_count": 2,
                "audio_word_count": 2,
                "audio_speaker_ids": ["S1"],
            },
        ]

        merged = merge_short_units(units)

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["merged_alignment_ids"], ["A001", "A002"])
        self.assertEqual(merged[0]["source_word_count"], 3)


if __name__ == "__main__":
    unittest.main()
