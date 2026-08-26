import importlib.util
import queue
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("greektube_audio_helper", ROOT / "app.py")
APP = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = APP
SPEC.loader.exec_module(APP)


class AudioHelperTests(unittest.TestCase):
    def test_accepts_supported_youtube_urls(self):
        self.assertTrue(APP.valid_youtube_url("https://www.youtube.com/watch?v=D2RjneeG_xA"))
        self.assertTrue(APP.valid_youtube_url("https://youtu.be/D2RjneeG_xA"))
        self.assertTrue(APP.valid_youtube_url("https://music.youtube.com/watch?v=D2RjneeG_xA"))

    def test_rejects_lookalike_or_credential_urls(self):
        self.assertFalse(APP.valid_youtube_url("https://youtube.com.evil.example/watch?v=123"))
        self.assertFalse(APP.valid_youtube_url("https://youtube.com@evil.example/watch?v=123"))
        self.assertFalse(APP.valid_youtube_url("javascript:alert(1)"))

    def test_download_command_never_uses_shell_and_adds_cookies_only_when_requested(self):
        tools = {"yt_dlp": "C:/safe/yt-dlp.exe", "ffmpeg": "C:/safe/ffmpeg.exe"}
        plain = APP.download_command("https://youtu.be/D2RjneeG_xA", False, tools)
        cookies = APP.download_command("https://youtu.be/D2RjneeG_xA", True, tools)
        self.assertEqual(plain[-2], "--")
        self.assertNotIn("--cookies-from-browser", plain)
        self.assertIn("--cookies-from-browser", cookies)
        self.assertEqual(cookies[cookies.index("--cookies-from-browser") + 1], "firefox")

    def test_missing_tools_fail_before_starting_subprocess(self):
        messages = queue.Queue()
        with patch.object(APP, "check_tools", return_value={"yt_dlp": None, "ffmpeg": None}), patch.object(APP.subprocess, "Popen") as popen:
            APP.run_download("https://youtu.be/D2RjneeG_xA", False, messages)
        self.assertEqual(messages.get()["code"], "ytdlp_missing")
        popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
