## ADDED Requirements

### Requirement: Canonical managed extension location

Managed extensions (registry-sourced or forked) SHALL be stored in `.axm/extensions/` with the layout:

```
.axm/extensions/@<scope>/skills/<name>/
.axm/extensions/@<scope>/mcp-servers/<name>/
```

#### Scenario: Registry-sourced skill installed to managed location

- **WHEN** installing `@acme/code-review` from a registry
- **THEN** files are extracted to `.axm/extensions/@acme/skills/code-review/`

#### Scenario: Non-registry skills use existing location

- **WHEN** installing a skill from GitHub or local path
- **THEN** files are copied to `.agents/skills/<sanitized-name>/` (existing behavior)

#### Scenario: Agent symlinks point to correct canonical location

- **WHEN** a registry-sourced skill is installed
- **THEN** symlinks in agent directories point to `.axm/extensions/@acme/skills/code-review/`

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

The `installSkill` operation executor SHALL determine the canonical path based on source type.

#### Scenario: Registry source uses managed location

- **WHEN** installing a skill with `source: "registry"`
- **THEN** files are written to `.axm/extensions/@<scope>/skills/<name>/`

#### Scenario: Other sources use existing location

- **WHEN** installing a skill with `source: "github"` or `source: "local"`
- **THEN** files are written to `.agents/skills/<sanitized-name>/`

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
