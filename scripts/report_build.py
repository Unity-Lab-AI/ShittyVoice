"""Produce a GitHub Actions summary for build status artifacts."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent.parent
REPORT_PATH = ROOT / "ci_reports" / "build_status.json"


def load_build_report() -> Dict[str, Any]:
    if not REPORT_PATH.exists():
        return {}
    return json.loads(REPORT_PATH.read_text())


def main() -> None:
    report = load_build_report()
    if not report:
        print("No build status information available.")
        return

    status = report.get("status", "unknown")
    artifact = report.get("artifact", "(none)")
    duration = report.get("duration", 0.0)
    emoji = "✅" if status == "succeeded" else "❌"

    summary_lines = [
        "| Status | Artifact | Duration (s) |",
        "| --- | --- | --- |",
        f"| {emoji} {status.title()} | {artifact} | {duration:.2f} |",
    ]

    table = "\n".join(summary_lines)
    print("Build Summary:\n")
    print(table)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write("## Build Status\n\n")
            handle.write(table)
            handle.write("\n")


if __name__ == "__main__":
    main()
