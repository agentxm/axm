## Why

Extensions currently install from git repositories and local paths only. There is no versioned distribution mechanism -- no way to resolve semver ranges, verify archive integrity, or manage dependencies between extensions. A local registry provides reproducible, verifiable extension distribution using a static-file layout that works on any filesystem. It also introduces a canonical managed extension location (`.axm/extensions/`) and a `skills fork` command for converting unmanaged skills into registry-managed extensions.

## What Changes

- Define a static-file registry layout: `extensions/@<scope>/<skills|mcp-servers>/<name>/` containing `index.json`, `<version>.json`, and `<version>.zip`
- Define JSON schemas for extension index (all versions + metadata) and per-version metadata
- Define extension archive format (zip with `axm-skill.json` or `axm-mcp-server.json` manifest)
- Introduce a registry provider abstraction: location determines provider (local path = local file provider; URL = future remote provider, out of scope)
- Define client resolution algorithm for local registries: read index, select version by semver + agent compatibility, resolve dependency tree, extract and verify archives
- Introduce named source configuration with scope-based routing, location normalization, and ordered fallthrough semantics
- Mandatory SHA-256 checksum verification before archive extraction
- Hard failure on non-404 errors during source resolution (prevents dependency confusion)
- Establish canonical managed extension location: `.axm/extensions/<scope>/<skills|mcp-servers>/<name>/` in project or global workspace
- Support publishing extensions to local registry destinations (only registry-sourced extensions can be published, not github/git/local sources)
- Add `skills fork <source>` command: converts an existing skill (installed or unmanaged in project) into an axm-managed extension in the canonical location, re-syncing the workspace

## Capabilities

### New Capabilities

- `registry-layout`: Static-file registry layout and JSON schemas for extension index (`index.json`), per-version metadata (`<version>.json`), and archive format (`<version>.zip`)
- `registry-provider`: Provider abstraction that dispatches based on source location -- local file provider reads from filesystem, future remote provider (out of scope) fetches over HTTPS
- `registry-client`: Client-side resolution algorithm for local registries -- version selection (semver range + agent filter + yanked), dependency resolution with cycle detection, archive extraction, and SHA-256 integrity verification
- `registry-source-config`: Named source configuration with scope-based routing, location normalization (local paths, `file://`), and ordered fallthrough with hard-fail on non-404 errors
- `registry-publish`: Publishing extensions to local registry destinations -- only registry-sourced extensions are publishable; builds archive, computes checksum, updates `index.json`
- `managed-extensions`: Canonical managed extension location (`.axm/extensions/<scope>/<skills|mcp-servers>/<name>/`) with `axm-skill.json` or `axm-mcp-server.json` manifest
- `skills-fork`: `skills fork <source>` command that creates an axm-managed copy of an existing skill -- determines scope/name (checking registry for uniqueness), creates in canonical location, uninstalls the original, and installs the managed version

### Modified Capabilities

- `extension-resolution`: Registry resolution level (currently placeholder) becomes a real implementation -- reads `index.json` from configured local registry sources, selects version, resolves dependencies
- `extension-sources`: Registry source configuration evolves from the current `registry: {url|path}` to named sources with scope routing and location normalization; extension identity remains `@scope/name`
- `settings-service`: Settings schema gains `sources` array for named registry sources with scope routing, replacing the current `sources.registry` field

## Impact

- **Sources** (`src/sources/`): `RegistrySource` type and parsing updated for named source configuration; source string format unchanged (`@scope/name@version`)
- **Resolution** (`src/resolution/`): AXM name resolver gains real registry-level resolution via local file provider; new provider abstraction for dispatching by location type
- **Settings** (`src/settings/`): Schema evolves `sources` from per-type config to named source entries with scope filters and location field
- **Lockfile** (`src/lockfile/`): Registry lock entries gain version, checksum, and source name fields
- **Extensions** (`src/extensions/`): New managed extension location and manifest handling
- **Install/uninstall commands**: Updated to handle versioned registry sources, dependency trees, and archive extraction with verification
- **New `skills fork` command**: New command under `skills` that reuses existing install/uninstall operations plus a new fork operation
- **New dependencies**: Semver range matching, zip archive handling, SHA-256 hashing
