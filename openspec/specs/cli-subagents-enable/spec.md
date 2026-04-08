## ADDED Requirements

### Requirement: Enable re-renders to agents

`axm subagents enable` SHALL set `enabled: true` in the subagent's settings entry and re-render the subagent to all configured agents.

#### Scenario: Enable a disabled subagent

- **WHEN** user runs `axm subagents enable code-reviewer`
- **AND** `code-reviewer` is installed with `enabled: false`
- **THEN** the CLI SHALL set `enabled: true` in `settings.json`
- **AND** SHALL render the subagent to all configured agents' subagent directories
- **AND** SHALL update the lockfile `renderedFiles` map

#### Scenario: Already enabled is a no-op

- **WHEN** user runs `axm subagents enable code-reviewer`
- **AND** `code-reviewer` is already enabled
- **THEN** the CLI SHALL complete with a success message indicating the subagent is already enabled

#### Scenario: Subagent not found

- **WHEN** user runs `axm subagents enable unknown-agent`
- **AND** `unknown-agent` is not installed
- **THEN** the CLI SHALL fail with an error indicating the subagent is not installed

### Requirement: Scope flag

`axm subagents enable` SHALL accept `--scope` to target the correct scope. Default SHALL be project scope.

#### Scenario: Enable in user scope

- **WHEN** user runs `axm subagents enable code-reviewer --scope user`
- **THEN** the CLI SHALL enable the subagent in user-scope settings and render to user-level agent directories

### Requirement: Conflict detection on enable

When re-rendering, enable SHALL check for unmanaged files at render paths. `--force` SHALL override conflicts.

#### Scenario: Conflict blocks enable

- **WHEN** user runs `axm subagents enable code-reviewer`
- **AND** `.claude/agents/code-reviewer.md` exists without the managed header (manually created)
- **THEN** the CLI SHALL fail with a conflict error suggesting `--force`

#### Scenario: Force overrides conflict

- **WHEN** user runs `axm subagents enable code-reviewer --force`
- **AND** an unmanaged file exists at the render path
- **THEN** the CLI SHALL overwrite the file with the rendered content

### Requirement: Preview flag

`--preview` SHALL show what would change without applying.

#### Scenario: Preview shows enable plan

- **WHEN** user runs `axm subagents enable code-reviewer --preview`
- **THEN** the CLI SHALL display which files would be rendered
- **AND** no changes SHALL be applied

### Requirement: Confirmation and --yes flag

In interactive mode, enable SHALL prompt for confirmation. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents enable code-reviewer --yes`
- **THEN** the CLI SHALL enable without confirmation
