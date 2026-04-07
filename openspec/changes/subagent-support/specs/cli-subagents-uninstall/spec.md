## ADDED Requirements

### Requirement: Uninstall removes canonical source and rendered files

`axm subagents uninstall` SHALL delete the canonical source from `.axm/extensions/` and all rendered agent-native files tracked in the lockfile's `renderedFiles` map.

#### Scenario: Full uninstall

- **WHEN** user runs `axm subagents uninstall code-reviewer`
- **AND** `code-reviewer` is installed with rendered files for `["claude-code", "cursor", "gemini-cli"]`
- **THEN** the CLI SHALL delete `.axm/extensions/@acme/subagents/code-reviewer/`
- **AND** SHALL delete `.claude/agents/code-reviewer.md`, `.cursor/agents/code-reviewer.md`, `.gemini/agents/code-reviewer.md`
- **AND** SHALL remove the subagent entry from `settings.json`
- **AND** SHALL remove the subagent entry from the lockfile

#### Scenario: Roo Code mode entry removed

- **WHEN** `code-reviewer` is installed with Roo Code configured
- **AND** user runs `axm subagents uninstall code-reviewer`
- **THEN** the `code-reviewer` mode entry SHALL be removed from `.roomodes`
- **AND** manual modes in `.roomodes` SHALL remain unchanged

### Requirement: Drift detection on uninstall

`axm subagents uninstall` SHALL detect drift by comparing rendered file content hashes against lockfile values. Without `--force`, drifted files SHALL require confirmation.

#### Scenario: Drifted file requires confirmation

- **WHEN** user runs `axm subagents uninstall code-reviewer`
- **AND** `.claude/agents/code-reviewer.md` has been manually edited (hash differs from lockfile)
- **THEN** the CLI SHALL warn about the drift and prompt for confirmation

#### Scenario: Force skips drift warning

- **WHEN** user runs `axm subagents uninstall code-reviewer --force`
- **AND** rendered files have drifted
- **THEN** the CLI SHALL remove all files without drift warnings

### Requirement: Subagent not found error

Attempting to uninstall a subagent that is not installed SHALL fail with an error.

#### Scenario: Unknown subagent

- **WHEN** user runs `axm subagents uninstall unknown-agent`
- **AND** `unknown-agent` is not installed
- **THEN** the CLI SHALL fail with an error indicating the subagent is not installed

### Requirement: Scope flag

`axm subagents uninstall` SHALL accept `--scope` to target the correct scope. Default SHALL be project scope.

#### Scenario: Uninstall from user scope

- **WHEN** user runs `axm subagents uninstall code-reviewer --scope user`
- **THEN** the CLI SHALL remove the subagent from user-scope settings and delete rendered files from user-level agent directories

### Requirement: Preview flag

`axm subagents uninstall --preview` SHALL show what would be removed without making changes.

#### Scenario: Preview shows removal plan

- **WHEN** user runs `axm subagents uninstall code-reviewer --preview`
- **THEN** the CLI SHALL display which files would be deleted and which settings entries would be removed
- **AND** no files SHALL be deleted

### Requirement: Confirmation and --yes flag

In interactive mode, `axm subagents uninstall` SHALL prompt for confirmation. `--yes` SHALL skip the prompt.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents uninstall code-reviewer --yes`
- **THEN** the CLI SHALL proceed without confirmation
