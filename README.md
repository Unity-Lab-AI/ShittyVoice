# Unity Voice Chat Preview

[![Pull Request Workflow Status](../../actions/workflows/pull-request.yml/badge.svg)](../../actions/workflows/pull-request.yml)
[![Main Branch Workflow Status](../../actions/workflows/main-branch.yml/badge.svg?branch=main)](../../actions/workflows/main-branch.yml)
[![Main Branch Tests](../../actions/workflows/main-branch.yml/badge.svg?branch=main&job=Run%20Tests)](../../actions/workflows/main-branch.yml)

A responsive, speech-driven art experience powered by the Pollinations Unity
model. The interface now features dedicated activity monitors for Unity (left)
and the user microphone (right) so it is clear who is speaking at all times.
The microphone toggle stays anchored to the bottom of the screen for easy access
on both mobile and desktop.

## Features

- **Dual voice monitors** – modern circular visualizers spaced using the rule of
  thirds, highlighting Unity (left) and the user (right) with independent
  activity states.
- **Bottom-aligned mute control** – a persistent, centered control that guides
  users through granting microphone permissions and starting conversations.
- **Graceful voice handling** – contextual ARIA labels, explicit error feedback,
  and automatic re-listening when the browser allows continuous recognition.
- **Dynamic imagery** – every prompt swaps the blurred cinematic background using
  the selected Pollinations image model (`flux`, `turbo`, or `kontext`).

## Continuous Integration

Two separate GitHub Actions workflows keep deployments fast and informative:

- **Pull Request Checks** (`.github/workflows/pull-request.yml`)
  - Runs on every pull request update.
  - Executes each script under `tests/` via `tests/run_tests.py`.
  - Publishes a markdown summary of individual test results.

- **Main Branch Delivery** (`.github/workflows/main-branch.yml`)
  - Triggers on pushes to `main` and manual dispatches.
  - Runs `scripts/build_static.py`, which inlines the CSS and JavaScript so the
    GitHub Pages artifact is a self-contained `index.html` (eliminating missing
    asset issues on the published site).
  - Uploads the bundle artifact and records a machine-readable build summary.
  - Executes the same test suite and reports results without blocking deploys.
  - Deploys successful builds to GitHub Pages.

Badges at the top of this document surface the latest workflow and main-branch
test status directly from GitHub Actions.

## Local Development

Install the lightweight test dependency and run the suite:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
python tests/run_tests.py
```

The runner writes a structured report to `ci_reports/test_results.json` that the
workflows reuse when generating their summaries.
