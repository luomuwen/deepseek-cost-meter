# DeepSeek Harness Cost Meter

English · [简体中文](README.md)

[![CI](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/deepseek-cost-meter)](https://www.npmjs.com/package/deepseek-cost-meter)
[![npm downloads](https://img.shields.io/npm/dm/deepseek-cost-meter)](https://www.npmjs.com/package/deepseek-cost-meter)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[npm package](https://www.npmjs.com/package/deepseek-cost-meter) · [dsh market](https://awesome-dsh-plugin.com/p/luomuwen/deepseek-cost-meter/) · [Releases](https://github.com/luomuwen/deepseek-cost-meter/releases) · [Issues](https://github.com/luomuwen/deepseek-cost-meter/issues)

An independent MIT-licensed community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Show estimated model costs after each conversation turn, with expandable token, price and session-total details. Not affiliated with or endorsed by DeepSeek.

```text
Estimated model cost CNY 0.012300 · 1 call
  Uncached input: 1,000 tokens
  Cache read:     2,000 tokens
  Output:          100 tokens
```

The example uses the bundled peak rate for deepseek-v4-pro. Amounts are estimates based on recorded API usage and configured prices, not account billing records.

**New in 0.3.0:** a cost control beneath the composer shows the settled session estimate. Click it for the latest completed turn and per-provider/model costs, calls and recorded tokens. It sits alongside the native statistics controls without replacing them.

**New in 0.2.0:** multi-provider usage with prices for DeepSeek, six Kimi China models and MiniMax-M3.1-Flash in China. Qwen Token Plan, Kimi Coding and ZAI Coding show subscription usage without a per-call charge estimate. Other routes show recorded counters and accept custom prices. The plugin uses models already configured in Harness; it does not enable or switch models. See the [provider matrix and configuration](docs/providers.md).

## Install

Requires an existing DeepSeek Harness installation. Version 0.3.0 was tested against the real Desktop **0.2.1-rc.5 runtime on macOS**; other versions and platforms are unverified. No API key or additional model requests are needed.

Install the npm package into the Desktop profile:

```sh
dsh plugin --profile desktop add deepseek-cost-meter
```

On macOS, if `dsh` is not on PATH, use the bundled CLI:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add deepseek-cost-meter
```

For Web, run `dsh plugin --profile web add deepseek-cost-meter`. Restart the corresponding Harness app or Web service, then complete a conversation turn to see its cost below the reply.

The market display name is **DeepSeek Cost Meter（每轮费用）**; the npm package is **`deepseek-cost-meter`**. The market discovers npm packages through scheduled syncs. If it still shows an older archive, use the npm command above.

### Update the npm installation

```sh
dsh plugin --profile desktop add deepseek-cost-meter@latest
```

Restart Harness afterward. Web users should use `--profile web`. To check the installed version, run `dsh plugin --profile desktop list --depth 0`.

### Upgrade from 0.1.0

Save any custom `config.rates`, remove the old `@local/deepseek-cost-meter` package, then install the new package. Do not enable both:

```sh
dsh plugin --profile desktop remove @local/deepseek-cost-meter
dsh plugin --profile desktop add deepseek-cost-meter
```

Reapply custom prices and restart Harness. Storage and projection identifiers stay unchanged so existing price snapshots remain usable.

### Source or release archive

Tested with the DeepSeek Harness Desktop **0.2.1-rc.5 runtime on macOS**. Other versions and platforms are unverified. Source installation requires Node.js 22+, npm and Git.

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

Alternatively, download a `.tgz` from [Releases](https://github.com/luomuwen/deepseek-cost-meter/releases) and install it with `dsh plugin --profile desktop add /absolute/path/package.tgz`. `npm pack` builds the package locally. Zod is bundled; React is provided by Harness. The public npm package is `deepseek-cost-meter`.

## Composer cost control

The composer dock uses the same settled projection as the per-turn cost rows. It updates after a turn ends; while a turn is running, the dialog explicitly says it is not included. Partial totals are labeled as known costs, subscription-only sessions show plan usage, and unknown amounts never appear as free.

Click the control to see session totals, the latest completed turn and provider/model breakdowns. Currencies remain separate and inherited fork history is excluded from new spending. The dock uses four decimal places, while details retain six; nonzero amounts below display precision use a less-than indicator.

Escape, the close button or an outside click dismisses the dialog. Switching sessions closes it automatically. The panel supports dark/light themes and narrow windows. Existing native statistics and per-turn cost rows remain available. No account-balance reads or additional model calls are made.

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

Prices are per million tokens. Official `deepseek`, `deepseek-official` and `deepseek-account` routes are supported. Unrecognized providers do not inherit official prices. Cache-write prices are route-specific: unknown prices remain unknown. Kimi K3 cache-write TTL tiers are not available in Harness's normalized usage, so those charges are excluded and explicitly marked incomplete. Peak requests are approximated using the step/retry start timestamp in UTC+8.

Prefer `config.additionalRates` to add or override exact provider/model routes while retaining bundled defaults. Every added row requires `effectiveFrom`; `source` records its provenance. Decimal prices must be strings with up to six fractional digits. Use `null` for an unknown price and `'0'` only for a confirmed zero price. Omit `peak` for flat pricing. `config.providerModes` selects `metered`, `subscription` or `usage-only` per provider; a subscription route needs an explicit `metered` override before prices apply. Restart Harness after changes. See the [configuration guide](docs/providers.md) and [architecture](docs/architecture.md).

The existing `config.rates` option still replaces the complete catalog, including provider modes. Source developers can also edit `rates.json`.

Rate changes append immutable snapshots to Harness storage. The initial snapshot starts at `effectiveFrom`; later changes take effect when loaded. Old calls use their saved price history. Losing that history prevents exact reconstruction: this is not an accounting ledger.

New multi-provider rules therefore apply from the time an existing installation loads 0.2.0. Earlier calls retain their historical rules, and new model rows also respect their individual effective dates.

## Download statistics

- The [npm package page](https://www.npmjs.com/package/deepseek-cost-meter) shows versions and downloads. The badge above shows npm downloads over the last month.
- Use the [last-week JSON endpoint](https://api.npmjs.org/downloads/point/last-week/deepseek-cost-meter) or [last-month JSON endpoint](https://api.npmjs.org/downloads/point/last-month/deepseek-cost-meter) for your own reporting.
- [GitHub Release](https://github.com/luomuwen/deepseek-cost-meter/releases) asset downloads are counted separately. npm downloads are not unique users or active installations: CI, repeat installs and caching affect the totals.

The plugin does not upload usage telemetry. Download statistics and market metadata may take time to appear after publication. A temporary 404 from the statistics API or an empty badge does not mean the package is unpublished.

## Troubleshooting

- **No cost row after installation:** check the active `desktop` or `web` profile, restart Harness and complete a turn. Do not enable the old `@local/deepseek-cost-meter` package alongside this one.
- **Incomplete or missing amount:** check recorded usage, provider/model prices, and the tariff and calendar coverage for the request date. Missing data is not treated as zero cost.
- **Different from account billing:** costs use recorded usage and configured model prices. Account discounts, other tool fees and independent subagent sessions are excluded.

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
dsh plugin --profile desktop remove deepseek-cost-meter
```

Restart Harness if needed. The plugin does not modify conversation logs; price snapshots are retained by Harness storage.

## Community and license

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

DeepSeek and DeepSeek Harness names belong to their respective owners.
