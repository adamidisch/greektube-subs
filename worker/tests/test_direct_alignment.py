import unittest
from greektube_worker.direct_alignment import align_cue, alignment_audit, run_alignment, prefer_boundary_repair
from greektube_worker.models import SourceCue


class DirectAlignmentTests(unittest.TestCase):
    def test_boundary_repair_cannot_move_overlap_to_a_neighbour(self):
        def word(n, start, end):
            return {"word_id": str(n), "text": str(n), "start_ms": start, "end_ms": end, "timing_evidence": "forced_alignment"}
        original = [word(1, 0, 1000), word(2, 1100, 2000), word(3, 1900, 3000)]
        candidate = [word(1, 0, 1000), word(2, 900, 1800), word(3, 1900, 3000)]
        self.assertFalse(prefer_boundary_repair(original, candidate))
        clean = [word(1, 0, 1000), word(2, 1100, 1800), word(3, 1900, 3000)]
        self.assertTrue(prefer_boundary_repair(original, clean))

    def test_identical_words_in_another_cue_cannot_supply_missing_audio(self):
        first = SourceCue(1, 0, 1000, "Yes")
        second = SourceCue(2, 2000, 3000, "Yes")
        rows = align_cue(first, {"segments": [{"words": [{"word": "Yes", "start": .2, "end": .6, "score": .99}]}]}, 0)
        missing = align_cue(second, {"segments": []}, 1)
        self.assertEqual(rows[0]["timing_evidence"], "forced_alignment")
        self.assertEqual(missing[0]["timing_evidence"], "estimated")
        self.assertGreaterEqual(missing[0]["start_ms"], 2000)
        self.assertEqual(missing[0]["word_id"], "W000002")

    def test_bad_model_confidence_does_not_become_verified_evidence(self):
        rows = align_cue(SourceCue(1, 0, 1000, "Yes"), {"segments": [{"words": [
            {"word": "Yes", "start": .1, "end": .5, "score": float("nan")}
        ]}]}, 0)
        self.assertEqual(rows[0]["timing_evidence"], "estimated")
        self.assertFalse(alignment_audit(rows)["fullyAligned"])

    def test_checkpoint_resumes_without_another_model_call(self):
        cues = [SourceCue(1, 0, 1000, "Hello")]
        cache = {"cues": {}}
        calls = []
        def align(cue):
            calls.append(cue.cue_id)
            return {"segments": [{"words": [{"word": "Hello", "start": .1, "end": .6, "score": .9}]}]}
        first = run_alignment(cues, cues, align, cache, lambda: None)
        second = run_alignment(cues, cues, align, cache, lambda: None)
        self.assertEqual(first, second)
        self.assertEqual(calls, [1])

    def test_missing_model_score_is_not_treated_as_measured_confidence(self):
        rows = align_cue(SourceCue(1, 0, 1000, "Yes"), {"segments": [{"words": [
            {"word": "Yes", "start": .1, "end": .5}
        ]}]}, 0)
        self.assertEqual(rows[0]["timing_evidence"], "estimated")

    def test_nonfinite_model_timing_is_rejected_instead_of_crashing_or_passing(self):
        rows = align_cue(SourceCue(1, 0, 1000, "Yes"), {"segments": [{"words": [
            {"word": "Yes", "start": float("nan"), "end": .5, "score": .9}
        ]}]}, 0)
        self.assertEqual(rows[0]["timing_evidence"], "estimated")


if __name__ == "__main__":
    unittest.main()
