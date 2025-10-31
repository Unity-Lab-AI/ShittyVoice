"""Lightweight test runner that executes every test module in this directory."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent.parent
TEST_DIR = Path(__file__).resolve().parent
REPORT_DIR = ROOT / "ci_reports"
REPORT_PATH = REPORT_DIR / "test_results.json"


def discover_tests() -> List[Path]:
    return sorted(TEST_DIR.glob("test_*.py"))


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load spec for {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_test_module(path: Path) -> Dict[str, Any]:
    module = load_module(path)
    if not hasattr(module, "run"):
        raise AttributeError(f"Test module {path.name} must define a run() function")
    result = module.run()
    if not isinstance(result, dict):
        raise TypeError(f"Test module {path.name} returned non-dict result: {result!r}")
    return result


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    results: List[Dict[str, Any]] = []
    failures = 0

    for test_path in discover_tests():
        print(f"\n⏱️  Running {test_path.name}...")
        try:
            result = run_test_module(test_path)
        except Exception as exc:  # noqa: BLE001 - keep runner resilient
            failures += 1
            result = {
                "name": test_path.stem,
                "status": "failed",
                "details": f"{type(exc).__name__}: {exc}",
                "duration": 0.0,
            }
        else:
            if result.get("status") != "passed":
                failures += 1

        results.append(result)
        status = result.get("status", "unknown").upper()
        details = result.get("details", "")
        print(f"   → {status}")
        if details:
            print(f"     {details}")

    REPORT_PATH.write_text(json.dumps({"results": results}, indent=2))
    print(f"\n📄 Wrote detailed report to {REPORT_PATH.relative_to(ROOT)}")

    if failures:
        print(f"❌ {failures} test(s) failed.")
    else:
        print("✅ All tests passed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
