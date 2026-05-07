## ADDED Requirements

### Requirement: Update subagents and re-render

`axm subagents update` SHALL fetch the latest versions matching version constraints, update the canonical <name>.md, and re-render all agent-native files.

#### Scenario: Update all subagents

- **WHEN** user runs `axm subagents update`
- **AND** `code-reviewer` has a newer version available matching the constraint
- **THEN** the CLI SHALL update the canonical source in `.axm/extensions/`
- **AND** SHALL re-render agent-native files for all configured agents
- **AND** SHALL update the lockfile version, source hash, and rendered file paths

#### Scenario: No updates available

- **WHEN** user runs `axm subagents update`
- **AND** all subagents are at their latest matching versions
- **THEN** the CLI SHALL report that everything is up to date

### Requirement: Selective update with --subagent

`--subagent` SHALL restrict the update to specific subagents by name. Repeatable.

#### Scenario: Update specific subagent

- **WHEN** user runs `axm subagents update --subagent code-reviewer`
- **THEN** only `code-reviewer` SHALL be checked and updated

#### Scenario: Multiple specific subagents

- **WHEN** user runs `axm subagents update --subagent code-reviewer --subagent security-audit`
- **THEN** both named subagents SHALL be checked and updated

### Requirement: Source-scoped update

An optional positional `source` argument SHALL limit the update to subagents from a specific source.

#### Scenario: Update from specific source

- **WHEN** user runs `axm subagents update owner/repo`
- **THEN** only subagents originally installed from `owner/repo` SHALL be updated

### Requirement: Re-render with --agent

`--agent` SHALL restrict re-rendering to specific agents during the update.

#### Scenario: Re-render for specific agents

- **WHEN** user runs `axm subagents update --agent claude-code`
- **THEN** the update SHALL fetch new versions for all subagents but only re-render for Claude Code

### Requirement: Update overwrites managed rendered files

When updating, the CLI SHALL overwrite all rendered files that contain the AXM managed marker. Manually edited rendered files that still have the marker are overwritten without warning — the source hash change from the upstream update is sufficient reason to re-render. To preserve manual edits, uninstall the extension.

#### Scenario: Managed file overwritten on update

- **WHEN** a rendered file has been manually edited but retains the managed marker
- **AND** user runs `axm subagents update`
- **THEN** the CLI SHALL re-render and overwrite the file

#### Scenario: Unmanaged file at render path blocks update

- **WHEN** a rendered file's managed marker has been removed
- **AND** user runs `axm subagents update`
- **THEN** the CLI SHALL treat it as a conflict (block unless `--force`)

### Requirement: Preview flag

`--preview` SHALL show what would be updated without making changes.

#### Scenario: Preview shows update plan

- **WHEN** user runs `axm subagents update --preview`
- **THEN** the CLI SHALL display version changes and which rendered files would change
- **AND** no updates SHALL be applied

### Requirement: Scope flag

`--scope` SHALL target project or user-level subagents. Default SHALL be project.

#### Scenario: Update user-scope subagents

- **WHEN** user runs `axm subagents update --scope user`
- **THEN** only user-scope subagents SHALL be updated

### Requirement: Confirmation and --yes flag

In interactive mode, update SHALL prompt after showing the plan. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents update --yes`
- **THEN** the CLI SHALL proceed without confirmation
