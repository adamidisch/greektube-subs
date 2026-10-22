"""Convert a complete alignment + authored draft to the existing web review format.

No model calls, network requests, writes to the application or review assertions.
"""
import argparse
import json
from pathlib import Path

from greektube_worker.web_review import compile_web_review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("alignment", "draft", "report", "output"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    args = parser.parse_args()
    if args.output.resolve() in {args.alignment.resolve(), args.draft.resolve(), args.report.resolve()}:
        parser.error("Output must not overwrite input evidence")
    result = compile_web_review(*(json.loads(p.read_text()) for p in (args.alignment, args.draft, args.report)))
    text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    if len(text.encode()) > 4_000_000:
        raise ValueError("Review exceeds the web request budget; do not upload")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    print(json.dumps({"output": str(args.output), "bytes": len(text.encode()), "status": "draft"}))


if __name__ == "__main__":
    main()
