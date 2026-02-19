## ADDED Requirements

### Requirement: Pack manifest schema

Extension packs SHALL have an `axm-pack.json` manifest based on `CommonManifestFields` with additional fields:

- `name`: fully qualified `@scope/name`
- `version`: semver string
- `description`: optional
- `license`: optional
- `authors`: array of `{name, email?, url?}`
- `skills`: optional record of `@scope/name` to semver range
- `commands`: optional record of `@scope/name` to semver range
- `mcp-servers`: optional record of `@scope/name` to semver range

All extension entries in the manifest SHALL be version-specifier maps (`"@scope/name": "<semver-range>"`). No unmanaged markers, enabled flags, or source strings.

#### Scenario: Valid pack manifest with skills and commands

- **WHEN** `axm-pack.json` contains `name: "@acme/frontend-pack"`, `version: "1.0.0"`, `skills: { "@acme/code-review": "^1.0.0" }`, `commands: { "@acme/formatter": "^1.0.0" }`
- **THEN** manifest validation succeeds

#### Scenario: Empty extension sections are valid

- **WHEN** `axm-pack.json` contains `name: "@acme/empty-pack"`, `version: "1.0.0"` with no `skills`, `commands`, or `mcp-servers` fields
- **THEN** manifest validation succeeds

#### Scenario: Invalid entry format rejected

- **WHEN** `axm-pack.json` contains `skills: { "@acme/code-review": { "source": "@acme/code-review" } }`
- **THEN** manifest validation fails (entries must be version-specifier strings, not objects)

### Requirement: Pack directory structure

Packs SHALL be stored in the managed extensions directory with the layout:

```
.axm/extensions/@<namespace>/packs/<name>/
  axm-pack.json
  <optional additional files>
```

Packs SHALL NOT have a `src/` subdirectory. Packs SHALL NOT have agent symlinks.

#### Scenario: Pack installed to managed location

- **WHEN** installing `@acme/frontend-pack` from a registry
- **THEN** the manifest resides at `.axm/extensions/@acme/packs/frontend-pack/axm-pack.json`

#### Scenario: No agent symlinks for packs

- **WHEN** a pack is installed
- **THEN** no symlinks are created in any agent directory

#### Scenario: Additional files preserved

- **WHEN** a pack archive contains `axm-pack.json` and `README.md`
- **THEN** both files are extracted to `.axm/extensions/@<namespace>/packs/<name>/`

### Requirement: Packs are registry-only

Packs SHALL only support registry sources. GitHub, git, and local path sources SHALL be rejected for pack operations.

#### Scenario: Registry source accepted

- **WHEN** a pack source resolves to a registry source
- **THEN** the operation proceeds normally

#### Scenario: Non-registry source rejected

- **WHEN** a pack source resolves to a GitHub, git, or local path source
- **THEN** the operation fails with a `CliError` indicating packs only support registry sources

### Requirement: PacksMap settings schema

The `packs` field in settings.json SHALL use a narrowly typed `PacksMapSchema` with a `PackEntrySchema` union:

- **Plain string** — source string (e.g., `"@acme/frontend-pack"`)
- **Pack entry object** — `{ source: string }` for explicit managed form

No unmanaged marker. No enabled flag.

#### Scenario: String entry in settings

- **WHEN** settings.json contains `"packs": { "frontend-pack": "@acme/frontend-pack" }`
- **THEN** settings validation succeeds

#### Scenario: Object entry in settings

- **WHEN** settings.json contains `"packs": { "frontend-pack": { "source": "@acme/frontend-pack" } }`
- **THEN** settings validation succeeds

#### Scenario: Invalid entry rejected

- **WHEN** settings.json contains `"packs": { "frontend-pack": { "managed": false } }`
- **THEN** settings validation fails (packs are always managed)

### Requirement: Pack lockfile section

The lockfile SHALL have a separate top-level `packs` section. Pack lock entries SHALL include:

- `type`: `"registry"`
- `scope`: string (with `@` prefix)
- `name`: string (without scope)
- `resolvedVersion`: string (exact semver)
- `checksum`: string (`sha256:<hex>`)
- `sourceName`: string (registry source name)
- `installedAt`: ISO 8601 date string
- `updatedAt`: ISO 8601 date string
- `resolvedSkills`: record of `@scope/name` to exact resolved version
- `resolvedCommands`: record of `@scope/name` to exact resolved version
- `resolvedMcpServers`: record of `@scope/name` to exact resolved version

#### Scenario: Pack lock entry with resolved extensions

- **WHEN** pack `@acme/frontend-pack` version `1.0.0` is installed with skills `@acme/code-review@1.2.0` and `@acme/linting@2.1.0`
- **THEN** the lockfile `packs` section contains an entry with `resolvedSkills: { "@acme/code-review": "1.2.0", "@acme/linting": "2.1.0" }`

#### Scenario: Packs section is separate from skills

- **WHEN** the lockfile is read
- **THEN** pack entries are in the `packs` section, not mixed with skill entries

### Requirement: Transitive skill visibility

`getInstalledSkills()` SHALL return both direct (settings.json) and transitive (pack-provided) skills. Direct entries SHALL take precedence over transitive entries when both exist for the same skill.

Transitive skills SHALL be derived from installed packs' `resolvedSkills` in the lockfile.

`getConfiguredSkills()` SHALL remain unchanged — returning only skills explicitly in settings.json.

#### Scenario: Pack-provided skill visible in installed skills

- **WHEN** pack `@acme/frontend-pack` is installed with `resolvedSkills: { "@acme/code-review": "1.2.0" }`
- **AND** `@acme/code-review` has no direct entry in settings.json
- **THEN** `getInstalledSkills()` includes `@acme/code-review`
- **AND** `getConfiguredSkills()` does NOT include `@acme/code-review`

#### Scenario: Direct entry takes precedence over transitive

- **WHEN** pack `@acme/frontend-pack` provides `@acme/code-review` transitively
- **AND** settings.json contains `"code-review": { "source": "@acme/code-review", "enabled": false }`
- **THEN** `getInstalledSkills()` returns the direct entry with `enabled: false`

### Requirement: Direct entry promotion on disable

When a user disables a skill that only exists transitively (via a pack), the system SHALL create a direct settings.json entry with `enabled: false`.

#### Scenario: Disable transitive skill creates direct entry

- **WHEN** `@acme/code-review` is installed only via pack (no direct settings entry)
- **AND** user runs `axm skills disable @acme/code-review`
- **THEN** settings.json gains entry `"code-review": { "source": "@acme/code-review", "enabled": false }`

#### Scenario: Promoted skill survives pack uninstall

- **WHEN** `@acme/code-review` was promoted to direct (via disable)
- **AND** the pack that originally provided it is uninstalled
- **THEN** `@acme/code-review` is NOT orphaned (direct entry exists)
- **AND** the skill remains installed

### Requirement: Orphan detection for pack uninstall

When a pack is uninstalled, the system SHALL identify orphaned extensions — those that are:

- Listed in the uninstalled pack's `resolved*` fields
- NOT directly listed in settings.json (`getConfiguredSkills`)
- NOT referenced by any other installed pack's `resolved*` fields

Orphaned extensions SHALL be included in the uninstall plan for removal.

#### Scenario: Extension orphaned after pack uninstall

- **WHEN** pack `@acme/pack-a` is uninstalled
- **AND** `@acme/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/code-review` has no direct settings entry
- **AND** no other installed pack references `@acme/code-review`
- **THEN** `@acme/code-review` is included in the uninstall plan as orphaned

#### Scenario: Extension shared by two packs is not orphaned

- **WHEN** pack `@acme/pack-a` is uninstalled
- **AND** `@acme/code-review` is in both `pack-a` and `pack-b`'s `resolvedSkills`
- **AND** `pack-b` is still installed
- **THEN** `@acme/code-review` is NOT orphaned

#### Scenario: Extension with direct entry is not orphaned

- **WHEN** pack `@acme/pack-a` is uninstalled
- **AND** `@acme/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/code-review` has a direct entry in settings.json
- **THEN** `@acme/code-review` is NOT orphaned
