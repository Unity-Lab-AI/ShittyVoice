"""Render a human readable summary of test results for GitHub Actions."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent.parent
REPORT_PATH = ROOT / "ci_reports" / "test_results.json"


def load_results() -> Dict[str, Any]:
    if not REPORT_PATH.exists():
        return {"results": []}
    return json.loads(REPORT_PATH.read_text())


def render_summary(results: Dict[str, Any]) -> str:
    rows = ["| Test | Status | Details |", "| --- | --- | --- |"]
    for entry in results.get("results", []):
        name = entry.get("name", "Unnamed test")
        status = entry.get("status", "unknown")
        details = entry.get("details", "")
        emoji = "✅" if status == "passed" else "❌"
        rows.append(f"| {name} | {emoji} {status.title()} | {details} |")
    return "\n".join(rows)


def main() -> None:
    results = load_results()
    if not results.get("results"):
        print("No test results were generated.")
        return

    summary_table = render_summary(results)
    print("Test Summary:\n")
    print(summary_table)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write("## Test Results\n\n")
            handle.write(summary_table)
            handle.write("\n")


if __name__ == "__main__":
    main()
