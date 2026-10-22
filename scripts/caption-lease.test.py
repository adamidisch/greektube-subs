"""Execute the real lease UPSERT against SQLite's compatible conflict WHERE semantics.

This is a local SQL regression, not a substitute for production Postgres verification.
"""
import re
import sqlite3
from pathlib import Path

source = (Path(__file__).parent.parent / "app/api/shared-cache.ts").read_text()
function = source.split("export async function acquireProcessingLock", 1)[1].split("export async function updateProcessingProgress", 1)[0]
sql = re.search(r"db\.query\(\s*`(.*?)`", function, re.S).group(1)
db = sqlite3.connect(":memory:")
db.create_function("GREATEST", -1, max)
db.execute("""CREATE TABLE video_transcripts(
 video_id TEXT PRIMARY KEY,status TEXT,progress REAL,lock_token TEXT,lock_expires_at TEXT,
 processing_stage TEXT,transcript_version INTEGER,processing_started_at TEXT,created_at TEXT,
 updated_at TEXT,processing_cursor INTEGER DEFAULT 0,retry_count INTEGER DEFAULT 0,
 retry_after TEXT,error TEXT,source_evidence TEXT DEFAULT 'original source')""")
now = "2026-10-21T20:00:00.000Z"
expires = "2026-10-21T20:03:00.000Z"

def acquire(force=False):
    return db.execute(sql, {"1":"test-video","2":"new-token","3":expires,"4":12,"5":now,"6":now,"7":now,"8":int(force)}).fetchall()

def seed(status="processing", version=12, lease="2026-10-21T20:01:00.000Z", token="existing-token"):
    db.execute("DELETE FROM video_transcripts")
    db.execute("INSERT INTO video_transcripts(video_id,status,progress,lock_token,lock_expires_at,transcript_version,updated_at,processing_stage) VALUES(?,?,?,?,?,?,?,?)",("test-video",status,70,token,lease,version,now,"translate"))

for force, status, version in [(False,"processing",12),(True,"processing",12),(True,"ready",12),(True,"failed",12),(False,"processing",11)]:
    seed(status, version)
    assert acquire(force) == [], "An active owner must survive force, failure and version migration"
    assert db.execute("SELECT lock_token,progress FROM video_transcripts").fetchone() == ("existing-token",70)

seed(lease="2026-10-21T19:59:00.000Z")
assert acquire(True) == [("test-video",)]
assert db.execute("SELECT lock_token,progress,source_evidence FROM video_transcripts").fetchone() == ("new-token",3,"original source")
seed(status="ready", lease=None, token=None)
assert acquire(True) == [("test-video",)]
db.execute("DELETE FROM video_transcripts")
assert acquire() == [("test-video",)]
print("caption lease concurrency regressions passed (SQLite conflict semantics)")
