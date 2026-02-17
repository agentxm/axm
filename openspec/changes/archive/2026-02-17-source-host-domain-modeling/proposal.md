## Why

The current source domain model muddles several distinct concepts — host configuration, source coordinates, and extension identity are tangled across `SourceInput`, `Source`, `SourceConfig`, and two competing `ExtensionRef` types. This makes it hard to reason about what information is needed where, leads to duplicated discovery logic between resolution and providers, and blocks clean implementation of features like source-level operation capabilities (e.g., registry supports publish, GitHub does not).

## What Changes

- **BREAKING**: Replace `SourceInput` / `Source` / `SourceConfig` type hierarchy with a clear three-layer model: `SourceHost` (how to reach a source), `SourceParams` (coordinates within a source), and `Source` (the combination)
- **BREAKING**: Replace `SourceProvider` interface with `SourceHostProvider` that declares which operations it supports (discover, publish, fetch) per source type
- **BREAKING**: Introduce `SourceExtensionRef` as the unified way to reference a specific extension at a specific source, replacing the two competing `ExtensionRef` types
- Add `"builtin"` to `SourceType` (currently only in lockfile schema) and define `SourceType` as the canonical discriminator across all source-related types
- Enable future source refinement — the `match` method on `SourceHostProvider` allows sources (e.g., URL) to resolve into more specific source types (e.g., well-known provider, Mintlify) during resolution, but new source types are not added in this change
- Consolidate all source domain types into `sources/types.ts` as the single source of truth

## Capabilities

### New Capabilities

- `source-domain-model`: Core domain types — `SourceType`, `SourceHost`, `SourceParams`, `Source`, `SourceExtensionRef`, and their per-source-type variants (GitHub, GitLab, Bitbucket, Azure Repos, Git, Registry, Local). Defines the type algebra and relationships between layers.

### Modified Capabilities

- `source-provider`: Evolves into `SourceHostProvider` — adds operation capability declarations (discover, publish, fetch) so callers can check what a provider supports before invoking. Not all providers support all operations.
- `extension-sources`: Source configuration schema (`SourceConfig` in settings) maps to the new `SourceHost` model instead of the current flat config types.
- `resolve-source`: Source parsing pipeline produces `Source` (SourceHost + SourceParams) instead of current `SourceInput` + config merge.
- `extension-resolution`: Resolution orchestration uses new domain types throughout — resolvers return `SourceExtensionRef` instead of the old `ExtensionRef`.

## Impact

- **`packages/cli/src/sources/`** — Complete rewrite of `types.ts`; provider interface and implementations updated to `SourceHostProvider`
- **`packages/cli/src/resolution/`** — Resolvers and resolver types updated to produce `SourceExtensionRef`
- **`packages/cli/src/settings/schema.ts`** — `SourceConfig` schema aligned with `SourceHost`
- **`packages/cli/src/lockfile/schema.ts`** — Lock entry source fields aligned with new model
- **`packages/cli/src/extensions/`** — Extension ref types consolidated into `SourceExtensionRef`
- **All command handlers** that interact with sources or extension refs need type updates
- **All existing specs** in the modified capabilities list need delta specs
