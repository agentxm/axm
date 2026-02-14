## MODIFIED Requirements

### Requirement: Canonical managed extension location

Managed extensions (registry-sourced or forked) SHALL be stored in `.axm/extensions/` with the layout:

```
.axm/extensions/@<scope>/skills/<name>/
  axm-skill.json
  src/
    <skill content files>
.axm/extensions/@<scope>/mcp-servers/<name>/
.axm/extensions/@<scope>/packs/<name>/
  axm-pack.json
  <optional additional files>
```

The `axm-skill.json` manifest SHALL reside at the extension root. Skill content files SHALL reside in the `src/` subdirectory.

Pack extensions SHALL NOT have a `src/` subdirectory. Pack archives SHALL include all files in the pack directory at the root level.

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

#### Scenario: Pack installed to managed location

- **WHEN** installing `@acme/frontend-pack` from a registry
- **THEN** the manifest resides at `.axm/extensions/@acme/packs/frontend-pack/axm-pack.json`
- **AND** any additional files from the archive are extracted alongside the manifest

#### Scenario: No agent symlinks for packs

- **WHEN** a pack is installed
- **THEN** no symlinks are created in any agent directory (packs are metadata-only)
