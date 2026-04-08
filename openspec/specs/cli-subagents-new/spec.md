## ADDED Requirements

### Requirement: Scaffold subagent extension

`axm subagents new` SHALL scaffold both `subagent.json` (manifest) and `src/SUBAGENT.md` (instructions with frontmatter) in `.axm/extensions/<owner>/subagents/<name>/`.

#### Scenario: Scaffold with defaults

- **WHEN** user runs `axm subagents new code-reviewer`
- **AND** workspace default owner is `@acme`
- **THEN** the CLI SHALL create `.axm/extensions/@acme/subagents/code-reviewer/subagent.json` with `type: "subagent"`, `name: "code-reviewer"`, `owner: "@acme"`, `version: "0.1.0"`, `model: "default"`, `toolAccess: "full"`, `background: false`
- **AND** SHALL create `.axm/extensions/@acme/subagents/code-reviewer/src/SUBAGENT.md` with YAML frontmatter (`name`, `description` placeholder, `model: default`, `toolAccess: full`, `background: false`) and a starter instructions body

#### Scenario: Scaffold with custom options

- **WHEN** user runs `axm subagents new code-reviewer --tool-access readonly --model fast --background`
- **THEN** both the manifest and SUBAGENT.md frontmatter SHALL reflect `toolAccess: "readonly"`, `model: "fast"`, `background: true`

### Requirement: Name validation

The subagent name SHALL match `[a-z0-9][a-z0-9-]*` and be at most 64 characters.

#### Scenario: Valid name accepted

- **WHEN** user runs `axm subagents new code-reviewer`
- **THEN** the name SHALL be accepted

#### Scenario: Invalid name rejected

- **WHEN** user runs `axm subagents new Code_Reviewer`
- **THEN** the CLI SHALL fail with an error indicating the name format requirement

#### Scenario: Name too long rejected

- **WHEN** user runs `axm subagents new` with a name exceeding 64 characters
- **THEN** the CLI SHALL fail with a length error

### Requirement: Name collision detection

`axm subagents new` SHALL check for existing subagents with the same name in settings.

#### Scenario: Name collision detected

- **WHEN** user runs `axm subagents new code-reviewer`
- **AND** `code-reviewer` already exists in settings
- **THEN** the CLI SHALL fail with an error suggesting `--force`

#### Scenario: Force overwrite

- **WHEN** user runs `axm subagents new code-reviewer --force`
- **AND** `code-reviewer` already exists
- **THEN** the CLI SHALL overwrite the existing subagent files

### Requirement: Immediate rendering

After scaffolding, `axm subagents new` SHALL render agent-native files for configured agents (or `--agent` subset) immediately, so the subagent is usable right away.

#### Scenario: Rendered on creation

- **WHEN** user runs `axm subagents new code-reviewer`
- **AND** workspace has agents `["claude-code", "cursor"]`
- **THEN** `.claude/agents/code-reviewer.md` and `.cursor/agents/code-reviewer.md` SHALL be created
- **AND** the subagent entry SHALL be added to settings and lockfile

#### Scenario: Render for subset of agents

- **WHEN** user runs `axm subagents new code-reviewer --agent claude-code`
- **THEN** only `.claude/agents/code-reviewer.md` SHALL be created

### Requirement: Profile override

`--profile` SHALL override the workspace default owner.

#### Scenario: Custom profile

- **WHEN** user runs `axm subagents new code-reviewer --profile @myorg`
- **THEN** the subagent SHALL be created under `.axm/extensions/@myorg/subagents/code-reviewer/`

### Requirement: Preview flag

`--preview` SHALL show what files would be created without creating them.

#### Scenario: Preview shows plan

- **WHEN** user runs `axm subagents new code-reviewer --preview`
- **THEN** the CLI SHALL display the files that would be created and the agents that would receive rendered files
- **AND** no files SHALL be created

### Requirement: Confirmation and --yes flag

In interactive mode, `axm subagents new` SHALL confirm before creating. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents new code-reviewer --yes`
- **THEN** the CLI SHALL create the subagent without confirmation
