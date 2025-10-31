"""Integration test for the Pollinations text API using the Unity model."""

from __future__ import annotations

import json
import time
from typing import Any, Dict

import requests

TEST_NAME = "Pollinations Unity text response"
API_URL = "https://text.pollinations.ai/openai"
REQUEST_HEADERS = {
    "Content-Type": "application/json",
    # Pollinations expects requests to identify the Unity AI Lab origin when
    # using the OpenAI-compatible endpoint. Without these headers the service
    # replies with HTTP 402 (Payment Required) even though the public endpoint
    # is free to use. Supplying Origin/Referer makes the intent explicit and
    # avoids the erroneous billing prompt.
    "Origin": "https://unityailab.com",
    "Referer": "https://unityailab.com/",
    "User-Agent": "ShittyVoiceTest/1.0",
}


def run() -> Dict[str, Any]:
    """Execute the test and return a structured result dictionary."""
    start = time.perf_counter()
    payload = {
        "model": "unity",
        "messages": [
            {"role": "system", "content": "You are Unity, a concise greeter."},
            {"role": "user", "content": "Say hello and include the word Unity exactly once."},
        ],
    }

    try:
        response = requests.post(
            API_URL,
            json=payload,
            headers=REQUEST_HEADERS,
            timeout=20,
        )
        duration = time.perf_counter() - start
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        if not content:
            raise ValueError("No content returned from Pollinations API")

        if "unity" not in content.lower():
            raise AssertionError("Response did not mention Unity")

        return {
            "name": TEST_NAME,
            "status": "passed",
            "details": content,
            "duration": duration,
        }
    except Exception as exc:  # noqa: BLE001 - broad catch to report failure details
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
