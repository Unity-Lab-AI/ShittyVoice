# Voice Chat App

[![Pull Request Workflow Status](../../actions/workflows/pull-request.yml/badge.svg)](../../actions/workflows/pull-request.yml)
[![Main Branch Workflow Status](../../actions/workflows/main-branch.yml/badge.svg?branch=main)](../../actions/workflows/main-branch.yml)
[![Main Branch Tests](../../actions/workflows/main-branch.yml/badge.svg?branch=main&job=Run%20Tests)](../../actions/workflows/main-branch.yml)

A lightweight voice chat application prototype with automated continuous
integration. The workflows are designed so that deployments and pull requests
are never blocked by automated checks while still surfacing rich status
information.

## Continuous Integration

- **Pull Request Workflow** runs on every pull request event and executes all
  tests located in the `tests/` directory. It publishes a markdown summary with
  the individual results for quick review.
- **Main Branch Workflow** runs when changes land on `main`. It builds the static
  site bundle, uploads artifacts, deploys to GitHub Pages, and runs the same test
  suite. Build and test summaries are exposed through job outputs and workflow
  badges for quick visibility.

## Local Testing

To execute the same checks locally, run:

```bash
python tests/run_tests.py
```

The command writes a structured report to `ci_reports/test_results.json` that the
workflows reuse when generating their summaries.
