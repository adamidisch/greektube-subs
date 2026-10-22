import unittest
from greektube_worker.semantic_authoring import build_translation_packet, translate_and_review
from greektube_worker.speech_authoring import AuthoringNeedsReview


class SemanticAuthoringTests(unittest.TestCase):
    def packet(self):
        return build_translation_packet({"sourceHash": "source", "audioSha256": "audio", "wordTimelineHash": "words",
            "sourceCues": [{"cueId": 1, "text": "Yes."}],
            "words": [{"word_id": "W000001", "text": "Yes", "start_ms": 0, "end_ms": 2000,
                       "cue_id": 1, "timing_evidence": "forced_alignment"}]}, [1],
            {"mainTopic": "A question and its answer", "glossary": []})

    def test_independent_qa_and_authoring_are_cached_without_repeated_model_calls(self):
        calls, cache = [], {}
        def provider(prompt, packet):
            calls.append(prompt)
            return {"status": "approved", "issues": [], "phrases": [
                {"firstWordId": "W000001", "lastWordId": "W000001", "text": "Ναι."}]}
        first = translate_and_review(self.packet(), "test-provider", provider, cache, lambda: None)
        second = translate_and_review(self.packet(), "test-provider", provider, cache, lambda: None)
        self.assertEqual(first, second)
        self.assertEqual(len(calls), 2)
        self.assertFalse(first["humanAudioReview"])

    def test_review_cooldown_resumes_after_translation_without_repeating_it(self):
        calls, cache = [], {}
        def provider(prompt, packet):
            calls.append(prompt)
            if len(calls) == 2:
                raise RuntimeError("provider cooldown")
            return {"status": "approved", "issues": [], "phrases": [
                {"firstWordId": "W000001", "lastWordId": "W000001", "text": "Ναι."}]}
        with self.assertRaises(RuntimeError):
            translate_and_review(self.packet(), "test-provider", provider, cache, lambda: None)
        translate_and_review(self.packet(), "test-provider", provider, cache, lambda: None)
        self.assertEqual(len(calls), 3)

    def test_failed_bilingual_qa_blocks_output(self):
        with self.assertRaises(AuthoringNeedsReview):
            translate_and_review(self.packet(), "test-provider", lambda *_: {"status": "manual_review_required"}, {}, lambda: None)


if __name__ == "__main__":
    unittest.main()
