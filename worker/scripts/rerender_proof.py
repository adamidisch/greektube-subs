from __future__ import annotations

import argparse
import json
from pathlib import Path

from greektube_worker.proof import render_proof, srt_text


def format_time(value: int) -> str:
    value = max(0, round(value))
    hours, remainder = divmod(value, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timing-artifact", type=Path, required=True)
    parser.add_argument("--alignment", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    timing_artifact = json.loads(args.timing_artifact.read_text(encoding="utf-8"))
    alignment = json.loads(args.alignment.read_text(encoding="utf-8"))
    retimed_alignment, proof_audit = render_proof(
        alignment,
        timing_artifact["word_timeline"],
        timing_artifact["prosody_map"],
        int(timing_artifact["duration_ms"]),
    )
    audit = {
        "video_id": timing_artifact["video_id"],
        "timing_validation": timing_artifact["validation"],
        **proof_audit,
    }
    audit["final_output_allowed"] = bool(
        audit["final_output_allowed"] and timing_artifact["validation"]["ok"]
    )

    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "v81-alignment.json").write_text(
        json.dumps(retimed_alignment, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (args.output / "v81-audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    candidate = srt_text(retimed_alignment["units"], format_time)
    (args.output / "v81-candidate.srt").write_text(candidate, encoding="utf-8")
    final_path = args.output / "v81-output.srt"
    if audit["final_output_allowed"]:
        final_path.write_text(candidate, encoding="utf-8")
    elif final_path.exists():
        final_path.unlink()
    print(json.dumps(audit, ensure_ascii=False))
    if not audit["final_output_allowed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
