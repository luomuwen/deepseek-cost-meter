# DeepSeek Harness Cost Meter

English · [简体中文](README.md)

[![CI](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml)

An independent MIT-licensed community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Show estimated model costs after each conversation turn, with expandable token, price and session-total details. Not affiliated with or endorsed by DeepSeek.

```text
Estimated model cost CNY 0.012300 · 1 call
  Uncached input: 1,000 tokens
  Cache read:     2,000 tokens
  Output:          100 tokens
```

The example uses the bundled peak rate for deepseek-v4-pro. Amounts are estimates based on recorded API usage and configured prices, not account billing records.

## Install

Tested with DeepSeek Harness Desktop **0.2.1-rc.3 on macOS**. Other versions and platforms are unverified. Source installation requires Node.js 22+, npm and Git.

```sh
git clone https://github.com/luomuwen/deepseek-cost-meter.git
cd deepseek-cost-meter
npm ci --ignore-scripts
bash scripts/install-local.sh
```

The installer uses the bundled macOS Desktop CLI when available; otherwise it uses `dsh` on PATH and the `web` profile. Pass `desktop` or `web` to override the profile. This links the source directory: keep it in place and restart Harness after installation or code changes.

Manual installation:

```sh
dsh plugin --profile desktop add "$PWD"
```

On macOS, the bundled CLI is `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`. For Web, use `--profile web` and restart `dsh web`.

Alternatively, download a `.tgz` from [Releases](https://github.com/luomuwen/deepseek-cost-meter/releases) and install it with `dsh plugin --profile desktop add /absolute/path/package.tgz`. `npm pack` builds the package locally. Zod is bundled; React is provided by Harness. The package retains the name `@local/deepseek-cost-meter` for compatibility and is not published to the npm registry.

## Accounting model

- A turn runs from `turn/start` to `turn/end`, including recorded retries in that session.
- Uses persisted usage events, never token estimates from text length. Cumulative samples are replaced by their final value.
- Uncached input, cache reads, cache writes and output are disjoint. Reasoning tokens are already included in output.
- Uses exact fixed-point integer arithmetic, displayed to six decimal places.
- Missing usage or prices is shown as incomplete, not free. Known totals may be partial.
- Inherited fork history is displayed without adding it to new session spending.
- Excludes independent subagent sessions, title generation, search/fetch and other tool fees, discounts and account adjustments.
- No API key, additional model calls or telemetry. Aggregate state does not copy prompts, responses or tool payloads.

## Prices and configuration

The bundled CNY tariff was checked on **2026-10-29** against [DeepSeek's official pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/). It applies from that date; earlier prices are unknown. Peak-calendar coverage ends on **2026-12-31**. Expired calendars are marked unavailable instead of silently using stale rules.

Prices are per million tokens. Official `deepseek`, `deepseek-official` and `deepseek-account` routes are supported. Unrecognized providers do not inherit official prices. Cache writes default to the uncached-input rate. Peak requests are approximated using the step/retry start timestamp in UTC+8.

Edit `rates.json` and restart, or supply the complete same-shaped object under the plugin's `config.rates`. Decimal prices must be strings with up to six fractional digits. Omit `peak` for flat pricing. See the [Chinese configuration guide](README.md#修改价格) and [architecture](docs/architecture.md) for the full contract.

Rate changes append immutable snapshots to Harness storage. The initial snapshot starts at `effectiveFrom`; later changes take effect when loaded. Old calls use their saved price history. Losing that history prevents exact reconstruction: this is not an accounting ledger.

## Development

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm pack
```

CI checks syntax, unit tests, deterministic client generation and package contents on Node.js 22 and 24. The real Harness integration check needs a separate local Harness installation; it is not run in hosted CI. See [CONTRIBUTING.md](CONTRIBUTING.md) and [VERIFICATION.md](VERIFICATION.md).

## Uninstall

Disable or remove the plugin in Harness, or run:

```sh
dsh plugin --profile desktop remove @local/deepseek-cost-meter
```

Restart Harness if needed. The plugin does not modify conversation logs; price snapshots are retained by Harness storage.

## Community and license

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

DeepSeek and DeepSeek Harness names belong to their respective owners.
