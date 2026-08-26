#!/usr/bin/env python3
"""GreekTube Audio Helper.

Serves a private page on 127.0.0.1 and uses local yt-dlp plus FFmpeg to
download YouTube audio as MP3. Browser cookies are optional and never leave
the computer. The helper contains no cloud upload code or stored secrets.
"""

import json
import os
import queue
import secrets
import shutil
import subprocess
import threading
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
DOWNLOADS = Path(os.environ.get("GTS_AUDIO_DOWNLOADS", str(Path.home() / "Downloads")))
PORT = 8756
SESSION_COOKIE = "gts_audio_session"
SESSION_TOKEN = secrets.token_urlsafe(32)
MAX_REQUEST_BYTES = 4_096
DOWNLOAD_LOCK = threading.Lock()
ALLOWED_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


def tool_path(name: str) -> str | None:
    """Find a bundled executable first and then fall back to PATH."""
    suffix = ".exe" if os.name == "nt" else ""
    local = HERE / "bin" / f"{name}{suffix}"
    if local.is_file():
        return str(local)
    return shutil.which(name)


def check_tools() -> dict[str, str | None]:
    return {
        "yt_dlp": tool_path("yt-dlp"),
        "ffmpeg": tool_path("ffmpeg"),
    }


def valid_youtube_url(value: str) -> bool:
    try:
        parsed = urlparse(value.strip())
        return (
            parsed.scheme in {"http", "https"}
            and parsed.hostname is not None
            and parsed.hostname.lower() in ALLOWED_YOUTUBE_HOSTS
            and parsed.username is None
            and parsed.password is None
            and parsed.port is None
            and bool(parsed.path and parsed.path != "/")
        )
    except ValueError:
        return False


def download_command(link: str, use_cookies: bool, tools: dict[str, str | None]) -> list[str]:
    ytdlp = tools["yt_dlp"]
    ffmpeg = tools["ffmpeg"]
    if not ytdlp or not ffmpeg:
        raise ValueError("Missing download tools")
    output = str(DOWNLOADS / "%(title).150B [%(id)s].%(ext)s")
    command = [
        ytdlp,
        "--newline",
        "--no-colors",
        "--no-playlist",
        "--print",
        "after_move:__GTS_FILE__:%(filepath)s",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "128K",
        "--ffmpeg-location",
        os.path.dirname(ffmpeg) or ".",
        "-o",
        output,
    ]
    if use_cookies:
        command += ["--cookies-from-browser", "firefox"]
    return command + ["--", link.strip()]


def event(kind: str, code: str = "", **values) -> dict:
    return {"type": kind, **({"code": code} if code else {}), **values}


def run_download(link: str, use_cookies: bool, messages: queue.Queue):
    """Run one local yt-dlp process and stream structured progress events."""
    tools = check_tools()
    if not tools["yt_dlp"]:
        messages.put(event("error", "ytdlp_missing"))
        return
    if not tools["ffmpeg"]:
        messages.put(event("error", "ffmpeg_missing"))
        return
    if not valid_youtube_url(link):
        messages.put(event("error", "invalid_url"))
        return
    if not DOWNLOAD_LOCK.acquire(blocking=False):
        messages.put(event("error", "busy"))
        return

    try:
        DOWNLOADS.mkdir(parents=True, exist_ok=True)
        command = download_command(link, use_cookies, tools)
        messages.put(event("status", "starting"))
        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError:
            messages.put(event("error", "launch_failed"))
            return

        final_file: str | None = None
        bot_wall = False
        if process.stdout is not None:
            for raw_line in process.stdout:
                line = raw_line.rstrip("\r\n")
                if line.startswith("__GTS_FILE__:"):
                    final_file = line.split(":", 1)[1].strip()
                    continue
                progress = None
                if "[download]" in line and "%" in line:
                    try:
                        progress = float(line.split("[download]", 1)[1].split("%", 1)[0].strip())
                    except ValueError:
                        progress = None
                if progress is not None:
                    messages.put(event("progress", percent=max(0.0, min(100.0, progress))))
                lowered = line.lower()
                if "sign in to confirm" in lowered or "not a bot" in lowered:
                    bot_wall = True
                messages.put(event("log", message=line[:2_000]))

        return_code = process.wait()
        if return_code == 0 and final_file and Path(final_file).is_file():
            messages.put(event("done", file=final_file))
        elif bot_wall and not use_cookies:
            messages.put(event("bot_wall", "bot_wall"))
        elif return_code == 0:
            messages.put(event("error", "file_missing"))
        else:
            messages.put(event("error", "download_failed"))
    finally:
        DOWNLOAD_LOCK.release()


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "GreekTubeAudioHelper/1.0"
    sys_version = ""

    def log_message(self, *_args):
        pass

    def _host_allowed(self) -> bool:
        return self.headers.get("Host", "").lower() == f"127.0.0.1:{PORT}"

    def _session_allowed(self) -> bool:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            supplied = cookie.get(SESSION_COOKIE)
            return supplied is not None and secrets.compare_digest(supplied.value, SESSION_TOKEN)
        except (KeyError, TypeError):
            return False

    def _security_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")

    def _send(self, code: int, body: str | bytes, content_type: str = "application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(data)

    def _reject(self, code: int = 403):
        self._send(code, json.dumps({"error": "forbidden"}))

    def do_GET(self):
        if not self._host_allowed():
            self._reject(421)
            return
        parsed = urlparse(self.path)
        if parsed.path == "/" and parse_qs(parsed.query).get("token") == [SESSION_TOKEN]:
            self.send_response(303)
            self.send_header("Location", "/")
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/")
            self._security_headers()
            self.end_headers()
            return
        if not self._session_allowed():
            self._reject()
            return
        if parsed.path == "/":
            self._send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif parsed.path == "/tools":
            tools = check_tools()
            self._send(200, json.dumps({"yt_dlp": bool(tools["yt_dlp"]), "ffmpeg": bool(tools["ffmpeg"])}))
        else:
            self._send(404, json.dumps({"error": "not_found"}))

    def do_POST(self):
        if not self._host_allowed() or not self._session_allowed():
            self._reject()
            return
        if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}":
            self._reject()
            return
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            self._send(415, json.dumps({"error": "unsupported_media_type"}))
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._send(413, json.dumps({"error": "invalid_request_size"}))
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send(400, json.dumps({"error": "invalid_json"}))
            return
        if not isinstance(payload, dict) or urlparse(self.path).path != "/download":
            self._send(404, json.dumps({"error": "not_found"}))
            return

        link = str(payload.get("link", ""))
        use_cookies = payload.get("use_cookies") is True
        messages: queue.Queue = queue.Queue()
        threading.Thread(target=run_download, args=(link, use_cookies, messages), daemon=True).start()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self._security_headers()
        self.end_headers()
        while True:
            message = messages.get()
            try:
                self.wfile.write(f"data: {json.dumps(message, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                break
            if message["type"] in {"done", "error", "bot_wall"}:
                break


def main():
    launch_url = f"http://127.0.0.1:{PORT}/?token={SESSION_TOKEN}"
    if os.environ.get("GTS_NO_BROWSER") != "1":
        threading.Timer(0.6, lambda: webbrowser.open(launch_url)).start()
    print(f"GreekTube Audio Helper -> http://127.0.0.1:{PORT}/  (Ctrl+C to stop)")
    LocalServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
