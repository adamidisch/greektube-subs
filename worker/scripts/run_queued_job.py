from __future__ import annotations

from greektube_worker.config import Settings
from greektube_worker.engine import WhisperXEngine
from greektube_worker.main import process_job
from greektube_worker.repository import TimingRepository


def main() -> None:
    settings = Settings.from_env()
    repository = TimingRepository(settings.database_url, settings.worker_id, settings.lease_seconds)
    job = repository.claim_next_job()
    if not job:
        raise SystemExit("No queued audio timing job was found")
    if not process_job(repository, WhisperXEngine(settings), settings, job, single_attempt=True):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
