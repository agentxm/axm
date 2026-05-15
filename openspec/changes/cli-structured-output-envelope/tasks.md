## 1. Runtime contracts

- [x] 1.1 Change success JSON to a flat `{ ok: true, ...payload }` envelope.
- [x] 1.2 Remove the success `command` discriminator and `CommandDocument`.
- [x] 1.3 Change error JSON to omit `details`.
- [x] 1.4 Remove `_version` from stderr NDJSON events.
- [x] 1.5 Emit a machine stderr `error` event when JSON error output is produced.
- [x] 1.6 Support suggestion `command` and `cmd`, requiring at least one.

## 2. Renderer API

- [x] 2.1 Add a TypeScript-only entity renderer registry.
- [x] 2.2 Add entity-driven `list`, `detail`, and `tree` renderer methods.
- [x] 2.3 Migrate JSON-capable command handlers off command documents.

## 3. Verification

- [x] 3.1 Update unit tests for runtime envelopes, renderer behavior, and errors.
- [x] 3.2 Update CLI command tests for flat JSON output.
- [x] 3.3 Update docs and OpenSpec delta.
