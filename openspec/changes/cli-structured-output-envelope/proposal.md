## Why

AXM JSON output had command-specific wrappers, a `command` discriminator, and
error `details` that leaked diagnostic internals. This made machine consumers
branch on transport shape instead of payload fields.

## What Changes

- Success JSON is always a flat envelope: `{ "ok": true, ...payload }`.
- Success payloads no longer include a top-level `command` discriminator.
- Error JSON is `{ ok, code, message, howToFix?, suggestions? }`. The exit
  status is conveyed by `process.exit` only and is not echoed in the envelope.
- Machine stderr NDJSON events no longer include `_version`.
- Machine-mode errors also emit a stderr `error` event.
- Suggestions support `command` argv arrays and `cmd` display strings.
- CLI rendering moves to entity-driven `list`, `detail`, and `tree` APIs backed
  by a TypeScript-only registry.

## Impact

- `packages/core/src/unstable/cli-runtime/*`
- `packages/core/src/unstable/cli-renderer/*`
- `packages/core/src/unstable/app-error/*`
- JSON-capable CLI command handlers and tests
- CLI renderer guide and machine-output specs
