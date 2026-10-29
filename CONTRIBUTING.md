# Contributing / 参与贡献

欢迎提交可复现的问题、定价修正和 Pull Request。中文和英文均可。

## Local development

Use Node.js 22+ and npm:

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm pack
```

Edit `src/client-factory.js` or `locale/*.json`, then regenerate and commit `client.js`. Keep dependencies pinned and commit `package-lock.json`. Use two spaces, LF endings and descriptive commit messages.

For an optional integration check on macOS with Harness installed:

```sh
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
  --expose-internals scripts/runtime-smoke.cjs
```

`DSH_RUNTIME_ROOT` can override the runtime directory. The check uses a temporary storage directory and synthetic events with flat fixture prices, makes no model calls, and removes its temporary data. It requires the real Harness runtime and is not part of hosted CI.

## Changes worth testing

- Pricing: UTC+8 peak boundaries, holidays, expired calendars, currency separation and exact arithmetic.
- Usage: retries, interruptions, missing counters, cumulative samples and reasoning-token inclusion.
- Projection: persisted-state replay, forks, completed-turn totals and disposal.

For pricing changes, include an official source, verification date and effective date. Do not infer missing usage or unknown provider pricing. Update `CHANGELOG.md` for user-facing changes. Bump projection checkpoint compatibility if an algorithm change makes old state invalid.

## Pull requests

Explain the problem, resulting behavior, and verification performed. Keep changes focused. CI must pass; runtime integration results should identify the tested Harness version. Avoid adding personal conversations, API keys, account identifiers or machine-specific paths to fixtures and screenshots.

Be respectful and constructive. Code and documentation contributions are accepted under this repository's MIT License; do not copy code whose license is incompatible.
