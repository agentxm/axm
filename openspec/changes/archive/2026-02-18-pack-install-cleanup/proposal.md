## Why

The pack install handler is doing too much: parsing, fetching, extracting, manifest reading, dependency resolution, and plan building are all tangled together in one 400-line function. The handler should be a thin orchestrator that determines what to install and delegates execution to operations. This also means PackExtensionRef needs to carry dependency information so the handler can construct install operations without fetching or parsing manifests.

## What Changes

- **BREAKING** Simplify accepted input formats to `@scope/packs/pack-name` and `pack-name` (resolved via default scope as `@defaultScope/packs/pack-name`). Remove support for `@scope/pack-name` shorthand.
- **BREAKING** Move fetch, extract, and manifest parsing out of the handler into the install-pack operation. The handler only determines the PackExtensionRef and builds the plan.
- PackExtensionRef carries pack manifest data (dependencies) sourced from the registry's ExtensionManifest. The registry already knows the manifest contents — pass them through to the ref so the handler can construct cascading install operations without a separate fetch/parse step.
- Handler flow becomes: parse input → resolve PackExtensionRef (with manifest deps from registry) → build plan → execute plan.

## Capabilities

### New Capabilities

- `pack-extension-ref-with-deps`: PackExtensionRef carries pack manifest data (dependencies) from the registry's ExtensionManifest, enabling plan construction without a separate fetch/parse step.

### Modified Capabilities

- `cli-packs-install`: Input format changes and handler responsibility narrows to ref resolution + plan orchestration. Fetch/extract/manifest moves to operation.

## Impact

- `packages/cli/src/cli-commands/packs/install/handler.ts` — major simplification
- `packages/cli/src/cli-commands/packs/install/install-pack.ts` — gains fetch/extract/manifest responsibility
- `packages/cli/src/sources/types.ts` — PackExtensionRef types gain dependency fields
- `packages/cli/src/cli-commands/packs/operations.ts` — InstallPackOperation args may change
- Existing pack install tests and e2e tests need updating
