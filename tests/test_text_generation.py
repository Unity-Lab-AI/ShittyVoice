"""Static validation that Pollinations referrer configuration is present."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict

TEST_NAME = "Pollinations referrer configuration"
EXPECTED_REFERRER = "https://www.unityailab.com/"
EXPECTED_IMAGE_REFERRER = "referrer=unityailab.com"

ROOT = Path(__file__).resolve().parent.parent
APP_JS_PATH = ROOT / "app.js"


def run() -> Dict[str, Any]:
    """Ensure the frontend sends the Unity AI Lab referrer to Pollinations."""

    start = time.perf_counter()

    try:
        source = APP_JS_PATH.read_text(encoding="utf-8")

        if EXPECTED_REFERRER not in source:
            raise AssertionError(
                "Unity referrer constant is missing from app.js"
            )

        fetch_block = re.search(
            r"fetch\(POLLINATIONS_TEXT_URL,\s*\{(?P<body>.*?)\}\s*\)",
            source,
            flags=re.DOTALL,
        )
        if not fetch_block:
            raise AssertionError("Could not locate Pollinations fetch configuration")

        body = fetch_block.group("body")
        if "referrer: UNITY_REFERRER" not in body:
            raise AssertionError("Fetch call does not forward UNITY_REFERRER")

        if "referrerPolicy" not in body:
            raise AssertionError("Fetch call is missing an explicit referrer policy")

        if EXPECTED_IMAGE_REFERRER not in source:
            raise AssertionError("Image endpoint is missing the referrer query parameter")

        duration = time.perf_counter() - start
        return {
            "name": TEST_NAME,
            "status": "passed",
            "details": "Verified Pollinations referrer headers are configured.",
            "duration": duration,
        }
    except Exception as exc:  # noqa: BLE001 - report details in CI
        duration = time.perf_counter() - start
        return {
            "name": TEST_NAME,
            "status": "failed",
            "details": f"{type(exc).__name__}: {exc}",
            "duration": duration,
        }


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["status"] != "passed":
        raise SystemExit(1)
