# Security policy

## Supported versions

Security fixes target the latest release on `main`. This project is a community plugin and does not guarantee compatibility with every Harness version.

## Reporting a vulnerability

Use this repository's **Security → Report a vulnerability** private reporting flow when available. If it is unavailable, open an issue asking for a private contact channel without including exploit details or sensitive data. Do not attach API keys, full conversation logs, credentials or personal account data to public issues.

Include the plugin version, Harness version, operating system, affected component, impact and a minimal sanitized reproduction. There is no guaranteed response time.

## Data handling

The plugin reads local session events and stores aggregate usage/cost projections and price snapshots through Harness services. It does not send telemetry or issue model API requests. It does not intentionally copy prompts, answers, tool results or credentials into its own state. It runs with the permissions of the Harness host; it is not a security boundary.

A cost estimate is not a spending limit or a billing guarantee. Missing usage, unavailable tariffs and expired calendars must remain visible as incomplete.
