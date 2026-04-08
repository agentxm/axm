## ADDED Requirements

### Requirement: List installed subagents

`axm subagents list` SHALL display installed subagents with their name, source type, enabled status, and which agents they are rendered for.

#### Scenario: List shows installed subagents

- **WHEN** user runs `axm subagents list`
- **AND** `code-reviewer` and `security-audit` are installed
- **THEN** the CLI SHALL display both subagents with their source type (registry/github/local), enabled/disabled status, and agents list

#### Scenario: No subagents installed

- **WHEN** user runs `axm subagents list`
- **AND** no subagents are installed
- **THEN** the CLI SHALL display a message indicating no subagents are installed

### Requirement: Agent filter

`--agent` SHALL filter the list to subagents whose `renderedFiles` include the specified agent(s). Multiple `--agent` values use OR logic.

#### Scenario: Filter by single agent

- **WHEN** user runs `axm subagents list --agent claude-code`
- **AND** `code-reviewer` is rendered for `["claude-code", "cursor"]`
- **AND** `security-audit` is rendered for `["cursor"]` only
- **THEN** the CLI SHALL display only `code-reviewer`

#### Scenario: Filter by multiple agents (OR logic)

- **WHEN** user runs `axm subagents list --agent claude-code --agent gemini-cli`
- **THEN** the CLI SHALL display subagents rendered for either Claude Code or Gemini CLI

### Requirement: Scope flag

`--scope` SHALL control whether project or user-level subagents are listed. Default SHALL be project scope.

#### Scenario: List user-scope subagents

- **WHEN** user runs `axm subagents list --scope user`
- **THEN** the CLI SHALL display subagents from user-level settings

### Requirement: JSON output

`--json` SHALL emit structured JSON output with subagent details.

#### Scenario: JSON output format

- **WHEN** user runs `axm subagents list --json`
- **THEN** the CLI SHALL emit structured JSON with each subagent's name, source, enabled status, and rendered agents

### Requirement: Alias

`axm subagents ls` SHALL be an alias for `axm subagents list`.

#### Scenario: Alias works

- **WHEN** user runs `axm subagents ls`
- **THEN** the CLI SHALL behave identically to `axm subagents list`
