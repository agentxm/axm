## MODIFIED Requirements

### Requirement: Canonical managed extension location

Managed extensions (registry-sourced or forked) SHALL be stored in `.axm/extensions/` with the layout:

```
.axm/extensions/@<namespace>/skills/<name>/
  axm-skill.json
  src/
    <skill content files>
.axm/extensions/@<namespace>/mcp-servers/<name>/
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

### Requirement: Install pipeline conditional path

The `installSkill` operation executor SHALL determine the canonical path based on source type. For registry sources, a `contentPath` (`<canonical>/src/`) SHALL be used for agent symlinks and file copies.

#### Scenario: Registry source uses managed location

- **WHEN** installing a skill with `source: "registry"`
- **THEN** skill content files are written to `.axm/extensions/@<namespace>/skills/<name>/src/`

#### Scenario: Other sources use existing location

- **WHEN** installing a skill with `source: "github"` or `source: "local"`
- **THEN** files are written to `.agents/skills/<sanitized-name>/`

#### Scenario: Pre-clean removes from all known locations

- **WHEN** a skill is being installed (regardless of source type)
- **THEN** existing files are removed from both `.axm/extensions/` and `.agents/skills/` and agent symlinks are cleaned up (ensures clean transitions when source type changes)
