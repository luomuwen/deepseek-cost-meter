# Changelog

## 0.3.0 — 2026-11-02

- Add a composer dock cost control with session totals, latest completed turn and provider/model breakdowns.
- Reuse settled `localTurnCost` data without changing pricing, storage or accounting; explicitly exclude the running turn.
- Preserve partial-cost, plan-only, unknown-price, separate-currency and inherited-history semantics.
- Support outside-click and Escape dismissal, focus restoration, session-switch reset and viewport-constrained positioning.
- Add DOM interaction coverage and dock registration checks in the real Harness runtime. All 34 tests pass; the generated client was visually checked in light/dark and narrow-window synthetic previews.

## 0.2.0 — 2026-11-01

- Display recorded usage for all Harness routes, including providers without a configured tariff.
- Add verified CNY prices for six Kimi China API models and MiniMax-M3.1-Flash in China.
- Identify Qwen Token Plan, Kimi Coding, ZAI Coding and other bundled subscription routes; show usage without inventing per-call charges.
- Show known subtotals and missing price dimensions, including Kimi K3 cache-write TTL tiers.
- Add exact-route `additionalRates`, `providerModes`, per-row sources and effective dates; preserve the existing full-catalog configuration.
- Rebuild projections with the new schema while preserving historical price snapshots and DeepSeek accounting behavior.
- Verify 29 tests and mixed-provider fixtures in the real Harness Desktop 0.2.1-rc.5 runtime, including catalog upgrade, rendering and replay.

## 0.1.1 — 2026-11-01

- Publish the public npm package as `deepseek-cost-meter`.
- Align bundle and browser module names; derive the browser module ID from package metadata.
- Rebuild and run tests before packing, and document migration from the old `@local` package.
- Preserve pricing, projection and storage identifiers; no accounting behavior changes.

## 0.1.0 — 2026-10-29

Initial community release.

- Show estimated model cost after every completed, failed or interrupted conversation turn.
- Expand per-model input, cache, output and price details with session totals.
- Count recorded retries and avoid double-counting cumulative usage or inherited fork history.
- Keep exact fixed-point amounts and persistent price snapshots.
- Support official DeepSeek routes and configurable provider tariffs.
- Include Chinese and English interface text, unit tests and a local Harness integration check.

Validated on DeepSeek Harness Desktop 0.2.1-rc.3 for macOS. Built-in peak-calendar coverage ends on 2026-12-31. Estimates exclude independent subagents, title generation, tool fees and account adjustments.
