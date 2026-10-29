# Changelog

## 0.1.0 — 2026-10-29

Initial community release.

- Show estimated model cost after every completed, failed or interrupted conversation turn.
- Expand per-model input, cache, output and price details with session totals.
- Count recorded retries and avoid double-counting cumulative usage or inherited fork history.
- Keep exact fixed-point amounts and persistent price snapshots.
- Support official DeepSeek routes and configurable provider tariffs.
- Include Chinese and English interface text, unit tests and a local Harness integration check.

Validated on DeepSeek Harness Desktop 0.2.1-rc.3 for macOS. Built-in peak-calendar coverage ends on 2026-12-31. Estimates exclude independent subagents, title generation, tool fees and account adjustments.
