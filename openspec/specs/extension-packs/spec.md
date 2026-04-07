## ADDED Requirements

### Requirement: Extension extension pack manifest schema

Extension packs SHALL have an `extension-pack.json` manifest based on `CommonManifestFields` with additional fields:

- `name`: fully qualified `@owner/packs/name`
- `version`: semver string
- `description`: optional
- `license`: optional
- `authors`: array of `{name, email?, url?}`
- `skills`: optional record of `@owner/skills/name` to semver range
- `commands`: optional record of `@owner/commands/name` to semver range
- `mcp-servers`: optional record of `@owner/mcp-servers/name` to semver range

All extension entries in the manifest SHALL use three-segment fully qualified names and version-specifier maps (`"@owner/type-plural/name": "<semver-range>"`). No unmanaged markers, enabled flags, or source strings.

#### Scenario: Valid extension pack manifest with skills and commands

- **WHEN** `extension-pack.json` contains `name: "@acme/packs/frontend-pack"`, `version: "1.0.0"`, `skills: { "@acme/skills/code-review": "^1.0.0" }`, `commands: { "@acme/commands/formatter": "^1.0.0" }`
- **THEN** manifest validation succeeds

#### Scenario: Empty extension sections are valid

- **WHEN** `extension-pack.json` contains `name: "@acme/packs/empty-pack"`, `version: "1.0.0"` with no `skills`, `commands`, or `mcp-servers` fields
- **THEN** manifest validation succeeds

#### Scenario: Invalid entry format rejected

- **WHEN** `extension-pack.json` contains `skills: { "@acme/skills/code-review": { "source": "@acme/skills/code-review" } }`
- **THEN** manifest validation fails (entries must be version-specifier strings, not objects)

### Requirement: Extension extension pack directory structure

Extension packs SHALL be stored in the managed extensions directory with the layout:

```
.axm/extensions/@<owner>/packs/<name>/
  extension-pack.json
  <optional additional files>
```

Extension packs SHALL NOT have a `src/` subdirectory. Extension packs SHALL NOT have agent symlinks.

#### Scenario: Pack installed to managed location

- **WHEN** installing `@acme/packs/frontend-pack` from a registry
- **THEN** the manifest resides at `.axm/extensions/@acme/packs/frontend-pack/extension-pack.json`

#### Scenario: No agent symlinks for packs

- **WHEN** an extension extension pack is installed
- **THEN** no symlinks are created in any agent directory

#### Scenario: Additional files preserved

- **WHEN** an extension pack archive contains `extension-pack.json` and `README.md`
- **THEN** both files are extracted to `.axm/extensions/@<owner>/packs/<name>/`

### Requirement: Packs are registry-only

Extension packs SHALL only support registry sources. GitHub, git, and local path sources SHALL be rejected for extension pack operations.

#### Scenario: Registry source accepted

- **WHEN** an extension extension pack source resolves to a registry source
- **THEN** the operation proceeds normally

#### Scenario: Non-registry source rejected

- **WHEN** an extension extension pack source resolves to a GitHub, git, or local path source
- **THEN** the operation fails with a `AppError` indicating packs only support registry sources

### Requirement: Transitive skill visibility

Skills provided by installed extension packs SHALL still appear as installed skills in user-visible skill views. Skills explicitly listed in settings SHALL take precedence over pack-provided entries with the same name.

#### Scenario: Extension-pack-provided skill visible in installed skills

- **WHEN** pack `@acme/packs/frontend-pack` is installed with `resolvedSkills: { "@acme/skills/code-review": "1.2.0" }`
- **AND** `@acme/skills/code-review` has no direct entry in settings.json
- **THEN** installed skills SHALL include `@acme/skills/code-review`
- **AND** configured skills SHALL NOT include `@acme/skills/code-review`

#### Scenario: Direct entry takes precedence over transitive

- **WHEN** pack `@acme/packs/frontend-pack` provides `@acme/skills/code-review` transitively
- **AND** settings.json contains `"code-review": { "source": "@acme/skills/code-review", "enabled": false }`
- **THEN** installed skills SHALL use the direct entry with `enabled: false`

### Requirement: Direct entry promotion on disable

When a user disables a skill that only exists transitively (via an extension pack), the system SHALL create a direct settings.json entry with `enabled: false`.

#### Scenario: Disable transitive skill creates direct entry

- **WHEN** `@acme/skills/code-review` is installed only via pack (no direct settings entry)
- **AND** user runs `axm skills disable @acme/skills/code-review`
- **THEN** settings.json gains entry `"code-review": { "source": "@acme/skills/code-review", "enabled": false }`

#### Scenario: Promoted skill survives extension pack uninstall

- **WHEN** `@acme/skills/code-review` was promoted to direct (via disable)
- **AND** the extension pack that originally provided it is uninstalled
- **THEN** `@acme/skills/code-review` is NOT orphaned (direct entry exists)
- **AND** the skill remains installed

### Requirement: Orphan detection for extension pack uninstall

When an extension pack is uninstalled, the system SHALL identify orphaned extensions — those that are:

- Listed in the uninstalled extension pack's `resolved*` fields
- NOT directly listed in settings.json (`getConfiguredSkills`)
- NOT referenced by any other installed extension extension pack's `resolved*` fields

Orphaned extensions SHALL be included in the uninstall plan for removal.

#### Scenario: Extension orphaned after extension pack uninstall

- **WHEN** pack `@acme/packs/pack-a` is uninstalled
- **AND** `@acme/skills/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/skills/code-review` has no direct settings entry
- **AND** no other installed extension pack references `@acme/skills/code-review`
- **THEN** `@acme/skills/code-review` is included in the uninstall plan as orphaned

#### Scenario: Extension shared by two packs is not orphaned

- **WHEN** pack `@acme/packs/pack-a` is uninstalled
- **AND** `@acme/skills/code-review` is in both `pack-a` and `pack-b`'s `resolvedSkills`
- **AND** `@acme/packs/pack-b` is still installed
- **THEN** `@acme/skills/code-review` is NOT orphaned

#### Scenario: Extension with direct entry is not orphaned

- **WHEN** pack `@acme/packs/pack-a` is uninstalled
- **AND** `@acme/skills/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/skills/code-review` has a direct entry in settings.json
- **THEN** `@acme/skills/code-review` is NOT orphaned
