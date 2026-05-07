## ADDED Requirements

### Requirement: Disable removes rendered files but preserves source

`axm subagents disable` SHALL set `enabled: false` in the subagent's settings entry and remove all rendered agent-native files. The canonical source in `.axm/extensions/` SHALL be preserved.

#### Scenario: Disable a subagent

- **WHEN** user runs `axm subagents disable code-reviewer`
- **AND** `code-reviewer` is installed and enabled
- **THEN** the CLI SHALL set `enabled: false` in `settings.json`
- **AND** SHALL remove `.claude/agents/code-reviewer.md`, `.cursor/agents/code-reviewer.md`, etc. (all rendered files from lockfile)
- **AND** SHALL NOT delete `.axm/extensions/@acme/subagents/code-reviewer/`

#### Scenario: Roo Code mode removed on disable

- **WHEN** `code-reviewer` is disabled
- **AND** Roo Code is configured
- **THEN** the `code-reviewer` mode entry SHALL be removed from `.roomodes`
- **AND** manual modes SHALL remain unchanged

#### Scenario: Already disabled is a no-op

- **WHEN** user runs `axm subagents disable code-reviewer`
- **AND** `code-reviewer` is already disabled
- **THEN** the CLI SHALL complete with a success message indicating the subagent is already disabled

#### Scenario: Subagent not found

- **WHEN** user runs `axm subagents disable unknown-agent`
- **AND** `unknown-agent` is not installed
- **THEN** the CLI SHALL fail with an error indicating the subagent is not installed

### Requirement: Rendered file cleanup uses lockfile paths

Disable SHALL use the `renderedFiles` map from the lockfile to locate and delete all rendered files. Missing files are skipped gracefully.

#### Scenario: Rendered file already missing on disable

- **WHEN** user runs `axm subagents disable code-reviewer`
- **AND** a rendered file was already manually deleted
- **THEN** the CLI SHALL skip that file and continue with remaining cleanup

### Requirement: Re-enable restores rendered files

After disable, `axm subagents enable` SHALL re-render the subagent from the preserved canonical source.

#### Scenario: Enable after disable restores files

- **WHEN** `code-reviewer` was disabled (rendered files removed, source preserved)
- **AND** user runs `axm subagents enable code-reviewer`
- **THEN** the CLI SHALL re-render agent-native files from the canonical `<name>.md`

### Requirement: Scope flag

`--scope` SHALL target the correct scope. Default SHALL be project scope.

#### Scenario: Disable in user scope

- **WHEN** user runs `axm subagents disable code-reviewer --scope user`
- **THEN** the CLI SHALL disable in user-scope settings and remove rendered files from user-level directories

### Requirement: Preview flag

`--preview` SHALL show what would change without applying.

#### Scenario: Preview shows disable plan

- **WHEN** user runs `axm subagents disable code-reviewer --preview`
- **THEN** the CLI SHALL display which rendered files would be removed
- **AND** no changes SHALL be applied

### Requirement: Confirmation and --yes flag

In interactive mode, disable SHALL prompt for confirmation. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents disable code-reviewer --yes`
- **THEN** the CLI SHALL disable without confirmation
