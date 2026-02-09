## Why

Extensions currently install from git repositories and local paths only. There is no versioned distribution mechanism -- no way to resolve semver ranges, verify archive integrity, or manage dependencies between extensions. A local registry provides reproducible, verifiable extension distribution using a static-file layout that works on any filesystem. It also introduces a source provider abstraction that unifies how all source types are accessed, a canonical managed extension location (`.axm/extensions/`), and a `skills fork` command for converting unmanaged skills into registry-managed extensions.

## What Changes

- Define a static-file registry layout: `extensions/@<scope>/<skills|mcp-servers>/<name>/` containing `index.json` and `<version>.zip`
- Define JSON schemas for extension index (all versions + metadata) and version entries
- Define extension archive format (zip with `axm-skill.json` or `axm-mcp-server.json` manifest)
- Introduce a source provider abstraction that unifies how all source types (github, gitlab, bitbucket, azurerepos, git, registry, local) are accessed, with each source type implemented as a provider
- Migrate existing source types to the source provider abstraction (not all providers support the same capabilities)
- Implement two registry source providers: a local file provider (local path or `file://`) and a remote provider (URL, out of scope for this change)
- Define client resolution algorithm for local registries: read index, select version by semver + agent compatibility, extract and verify archives (dependency resolution deferred — schema supports it for forward compatibility with extension packs)
- Introduce named source configuration with scope-based routing, location normalization, and ordered fallthrough semantics
- Mandatory SHA-256 checksum verification before archive extraction
- Hard failure on non-404 errors during source resolution (prevents dependency confusion)
- Establish canonical managed extension location: `.axm/extensions/@<scope>/<skills|mcp-servers>/<name>/` in project or global workspace
- Support publishing extensions to local registry destinations (only axm-managed, registry-sourced extensions can be published — fork is required first for non-registry sources)
- Add `skills fork <source>` command: converts an existing skill into an axm-managed extension — copies files to canonical location, publishes to registry, and installs the managed version (install pre-cleans the original)
- Support glob-based forking (e.g., `axm skills fork effect-*`) to fork all matching skills in the project
- Enforce name uniqueness: extensions from non-registry sources cannot share names with registry-sourced extensions

## Capabilities

### New Capabilities

- `registry-layout`: Static-file registry layout and JSON schemas for extension index (`index.json`) and archive format (`<version>.zip`). All version metadata lives in `index.json` — no per-version sidecar files
- `source-provider`: Abstraction that unifies how all source types are accessed — each source type (github, gitlab, git, registry, local, etc.) is implemented as a provider with `find` (search by names + agent compatibility) and `fetch` capabilities. Source identity (`Source` type) is independent from search criteria (`FindOptions`). Registry source providers extend the base with registry-specific operations and dispatch by location: local file provider reads from filesystem, future remote provider (out of scope) fetches over HTTPS
- `registry-client`: Client-side resolution algorithm for local registries -- version selection (semver range + agent filter + yanked), archive extraction, and SHA-256 integrity verification. Dependency resolution is not implemented in this change but the registry index schema includes `dependencies` for forward compatibility with extension packs
- `registry-source-config`: Named source configuration with scope-based routing, location normalization (local paths, `file://`), ordered fallthrough with hard-fail on non-404 errors, and a registry configuration guard that prompts users to configure a local registry when no registry source exists (interactive) or fails with instructions (non-interactive)
- `registry-publish`: Publishing extensions to local registry destinations -- only axm-managed extensions (in `.axm/extensions/`) are publishable; builds archive, computes checksum, updates `index.json`
- `managed-extensions`: Canonical managed extension location (`.axm/extensions/@<scope>/<skills|mcp-servers>/<name>/`) with `axm-skill.json` or `axm-mcp-server.json` manifest
- `skills-fork`: `skills fork <source>` command that creates an axm-managed copy of an existing skill -- determines scope/name (checking registry for uniqueness), copies files to canonical location, publishes to registry, and installs the managed version (install pre-cleans any existing skill by the same name). Supports glob patterns (e.g., `effect-*`) to fork multiple matching skills in a single operation

### Modified Capabilities

- `extension-resolution`: Registry resolution level (currently placeholder) becomes a real implementation -- reads `index.json` from configured local registry sources, selects version by semver range + agent compatibility
- `extension-sources`: Registry source configuration evolves from the current `registry: {url|path}` to named sources with scope routing and location normalization; extension identity remains `@scope/name`
- `settings-service`: Settings schema gains `sources` array for named registry sources with scope routing, replacing the current `sources.registry` field

## Impact

- **Sources** (`src/sources/`): `RegistrySource` type and parsing updated for named source configuration; source string format unchanged (`@scope/name@version`). New source provider abstraction introduced; existing source types (github, gitlab, etc.) migrated to provider model
- **Resolution** (`src/resolution/`): AXM name resolver gains real registry-level resolution via local file provider; resolution dispatches through source provider abstraction
- **Settings** (`src/settings/`): Schema evolves `sources` from per-type config to named source entries with scope filters and location field
- **Lockfile** (`src/lockfile/`): Registry lock entries gain version, checksum, and source name fields
- **Extensions** (`src/extensions/`): New managed extension location and manifest handling
- **Install/uninstall commands**: Updated to handle versioned registry sources and archive extraction with verification
- **New `skills fork` command**: New command under `skills` that reuses install's discovery pipeline plus new fork and publish operations
- **New dependencies**: Semver range matching, zip archive handling, SHA-256 hashing
