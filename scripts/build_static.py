"""Build the GitHub Pages bundle with inlined assets."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CI_REPORTS = ROOT / "ci_reports"

CSS_START = "<!-- build:css -->"
CSS_END = "<!-- endbuild css -->"
JS_START = "<!-- build:js -->"
JS_END = "<!-- endbuild js -->"


def replace_block(source: str, start_marker: str, end_marker: str, replacement: str) -> str:
    """Replace the block delimited by the provided markers.

    Raises a ValueError when the markers are missing so the workflow fails fast
    instead of silently producing a broken bundle.
    """

    try:
        start_index = source.index(start_marker) + len(start_marker)
        end_index = source.index(end_marker)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise ValueError(
            "Build markers missing in index.html. Ensure the start and end "
            f"markers {start_marker!r} and {end_marker!r} exist."
        ) from exc

    before = source[:start_index]
    after = source[end_index:]
    return f"{before}\n{replacement}\n{after}"


def build() -> None:
    start = time.perf_counter()

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True, exist_ok=True)

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    javascript = (ROOT / "app.js").read_text(encoding="utf-8")

    inlined_index = replace_block(
        index_html,
        CSS_START,
        CSS_END,
        f"<style>\n{css}\n</style>",
    )
    inlined_index = replace_block(
        inlined_index,
        JS_START,
        JS_END,
        f"<script>\n{javascript}\n</script>",
    )

    (DIST / "index.html").write_text(inlined_index, encoding="utf-8")

    # Keep the original assets alongside the inlined bundle for local debugging
    # and to avoid breaking any bookmarked resources.
    shutil.copy2(ROOT / "style.css", DIST / "style.css")
    shutil.copy2(ROOT / "app.js", DIST / "app.js")
    shutil.copy2(ROOT / "ai-instruct.txt", DIST / "ai-instruct.txt")

    duration = time.perf_counter() - start
    CI_REPORTS.mkdir(parents=True, exist_ok=True)
    (CI_REPORTS / "build_status.json").write_text(
        json.dumps(
            {
                "status": "succeeded",
                "artifact": "github-pages",
                "duration": duration,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
