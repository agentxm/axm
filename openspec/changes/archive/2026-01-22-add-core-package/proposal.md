# Change: Add @agentxm/core package

## Why

The CLI architecture separates argument parsing (yargs) from business logic (Effect). Domain logic and utilities should live in a dedicated `@agentxm/core` package so the CLI remains a thin integration layer. This separation enables:

- Reuse of domain logic across multiple consumers (CLI, SDK, tests)
- Clearer boundaries between I/O orchestration and pure business logic
- Independent testing of core functionality without CLI concerns

## What Changes

- **NEW** `packages/core` directory with `@agentxm/core` package
- **NEW** Experimental APIs exposed via `@agentxm/core/experimental` subpath
- **NEW** Core package exports domain types, utilities, and Effect services
- CLI depends on `@agentxm/core` for domain logic
- CLI retains top-level Effect handler functions that wire services together

## Impact

- Affected specs: `core` (new capability)
- Affected code: `packages/core/` (new), `packages/cli/package.json` (dependency)
