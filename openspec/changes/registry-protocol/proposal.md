## Why

Extensions currently install from git repositories and local paths only. There is no versioned distribution mechanism — no way to resolve semver ranges, verify archive integrity, or manage dependencies between extensions.

This change introduces a local registry backed by a static-file layout, a source provider abstraction that unifies how all source types are accessed, a canonical managed extension location (`.axm/extensions/`), and a `skills fork` command for converting unmanaged skills into registry-managed extensions.

## Capabilities

### New Capabilities

- `registry-layout`: Static-file registry layout with JSON schemas for extension index and archive format
- `source-provider`: Abstraction unifying all source types behind `find` and `fetch` operations, with registry-specific extensions for publishing and index access
- `registry-client`: Client-side version resolution (semver range + agent filter), archive extraction, and SHA-256 integrity verification for local registries
- `registry-source-config`: Named source configuration with scope-based routing, location normalization, ordered fallthrough, and a configuration guard for first-time setup
- `registry-publish`: Publishing managed extensions to local registry destinations
- `managed-extensions`: Canonical managed extension location (`.axm/extensions/`) with `axm-skill.json` manifest
- `skills-fork`: `skills fork <source>` command that converts unmanaged skills into managed extensions, with glob support for batch operations

### Modified Capabilities

- `extension-resolution`: Registry resolution becomes a real implementation backed by local file providers
- `extension-sources`: Source configuration evolves from per-type keys to named sources with scope routing
- `settings-service`: Settings schema gains `sources` array replacing the current `sources.registry` field

## Impact

- **Sources** (`src/sources/`): `RegistrySource` standalone type removed — registry is a variant of `Source` (`source: "registry"`). Source string format unchanged (`@scope/name@version`). New source provider abstraction introduced; existing source types (github, gitlab, etc.) migrated to provider model
- **Resolution** (`src/resolution/`): AXM name resolver gains real registry-level resolution via local file provider; resolution dispatches through source provider abstraction
- **Settings** (`src/settings/`): Schema evolves `sources` from per-type config to named source entries with scope filters and location field
- **Lockfile** (`src/lockfile/`): Registry lock entries gain version, checksum, and source name fields
- **Extensions** (`src/extensions/`): New managed extension location and manifest handling
- **Install/uninstall commands**: Updated to handle versioned registry sources and archive extraction with verification
- **New `skills fork` command**: New command under `skills` that reuses install's discovery pipeline plus new fork and publish operations
- **New dependencies**: Semver range matching, zip archive handling, SHA-256 hashing
