## Why

Lockfile `resolvedVersion` fields are occasionally storing semver ranges instead of concrete versions, which breaks the lockfile's purpose as a reproducible snapshot. We should enforce a single rule: lockfile entries always record exact resolved versions, while version constraints remain in user-facing config/manifests.

## What Changes

- Enforce that lockfile `resolvedVersion` values are exact semver versions for registry-backed skills, commands, MCP servers, and packs.
- Enforce that pack lockfile maps (`resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`) store exact versions only (never ranges like `^1.2.0` or `~2.0.0`).
- **BREAKING** Reject lockfiles that contain range values in resolved fields; no compatibility repair path is provided.
- Clarify contract boundaries: settings and pack manifests may contain version constraints, lockfile stores only resolved pins.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `cli-packs-install`: Tighten lockfile guarantees so recorded resolved maps are exact version pins, and define behavior when legacy range values are encountered.
- `skills-install-execute`: Require skill lock entries written during install to persist exact resolved versions for registry refs.
- `commands-install-execute`: Require command lock entries written during install to persist exact resolved versions for registry refs.
- `mcp-servers-install-execute`: Require MCP server lock entries written during install to persist exact resolved versions for registry refs.
- `version-constraints`: Clarify that constraints are accepted at input boundaries (settings/manifest/CLI) but MUST NOT be persisted as lockfile resolved versions.

## Impact

- Affected areas: lockfile schema/validation and extension install/write paths for skills, commands, MCP servers, and packs.
- User-visible behavior: lockfile becomes consistently deterministic; lockfiles with legacy range values fail fast with clear guidance.
- Testing: update/add coverage for exact-pin persistence and legacy range handling across install flows.
