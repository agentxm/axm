# managed-extensions Specification

## Purpose

Defines the canonical layout, manifest schema, and install/uninstall pipeline for registry-sourced and forked extensions.

## Requirements

### Requirement: Canonical managed extension location

Managed extensions (registry-sourced or forked) SHALL be stored in `.axm/extensions/` with the layout:

```
.axm/extensions/@<scope>/skills/<name>/
  axm-skill.json
  src/
    <skill content files>
.axm/extensions/@<scope>/mcp-servers/<name>/
```

The `axm-skill.json` manifest SHALL reside at the extension root. Skill content files SHALL reside in the `src/` subdirectory.

#### Scenario: Registry-sourced skill installed to managed location

- **WHEN** installing `@acme/code-review` from a registry
- **THEN** skill content files are extracted to `.axm/extensions/@acme/skills/code-review/src/`
- **AND** the manifest resides at `.axm/extensions/@acme/skills/code-review/axm-skill.json`

#### Scenario: Non-registry skills use existing location

- **WHEN** installing a skill from GitHub or local path
- **THEN** files are copied to `.agents/skills/<sanitized-name>/` (existing behavior, no `src/` subdirectory)

#### Scenario: Agent symlinks point to content subdirectory

- **WHEN** a registry-sourced skill is installed
- **THEN** symlinks in agent directories point to `.axm/extensions/@acme/skills/code-review/src/`
- **AND** agents SHALL NOT see `axm-skill.json`

### Requirement: axm-skill.json manifest

Managed skill extensions SHALL have an `axm-skill.json` manifest based on `CommonManifestFields` with additional fields:

- `name`: fully qualified `@scope/name`
- `version`: semver string
- `description`: optional
- `agents`: array of agent identifier strings
- `dependencies`: record of `@scope/name` to semver range (empty for now)
- `license`: optional
- `authors`: array of `{name, email?, url?}`

#### Scenario: Valid manifest

- **WHEN** `axm-skill.json` contains `name: "@acme/code-review"`, `version: "1.0.0"`, `agents: ["claude-code"]`
- **THEN** manifest validation succeeds

#### Scenario: Manifest is source of truth for publish

- **WHEN** an extension is published
- **THEN** the registry `index.json` metadata is derived from `axm-skill.json`

### Requirement: CommonManifestFields author to authors evolution

`CommonManifestFields` SHALL replace the singular optional `author` field with `authors` (array of `{name, email?, url?}`).

#### Scenario: Authors array in manifest

- **WHEN** a manifest has `authors: [{ "name": "Acme Corp" }, { "name": "Jane", "email": "jane@acme.com" }]`
- **THEN** schema validation succeeds

### Requirement: Install pipeline conditional path

Skill operation handlers SHALL delegate canonical path computation to `Workspace.getSkillDir` instead of independently branching on source type. For registry sources, `skillSrcPath` (`<canonical>/src/`) SHALL be used for agent symlinks and file copies.

#### Scenario: Registry source uses managed location

- **WHEN** installing a skill with `source: "registry"`
- **THEN** skill content files are written to the `skillSrcPath` returned by `getSkillDir`
- **AND** `skillSrcPath` resolves to `.axm/extensions/@<scope>/skills/<name>/src/`

#### Scenario: Other sources use existing location

- **WHEN** installing a skill with `source: "github"` or `source: "local"`
- **THEN** files are written to the `skillSrcPath` returned by `getSkillDir`
- **AND** `skillSrcPath` resolves to `.agents/skills/<sanitized-name>/`

#### Scenario: Pre-clean removes from all known locations

- **WHEN** a skill is being installed (regardless of source type)
- **THEN** existing files are removed from both `.axm/extensions/` and `.agents/skills/` and agent symlinks are cleaned up (ensures clean transitions when source type changes)

### Requirement: Uninstall reads lockfile for cleanup location

The `skills uninstall` handler SHALL determine the canonical location from the lockfile entry's source field.

#### Scenario: Uninstall registry-sourced skill

- **WHEN** uninstalling a skill whose lockfile entry has `source: "registry"`
- **THEN** files are removed from `.axm/extensions/@<scope>/skills/<name>/`

#### Scenario: Uninstall git-sourced skill

- **WHEN** uninstalling a skill whose lockfile entry has `source: "github"`
- **THEN** files are removed from `.agents/skills/<name>/`
