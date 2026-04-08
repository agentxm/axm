# cli-commands-install Specification

## Purpose

The `axm commands install` command installs commands to all configured agents in the workspace.

## Requirements

### Requirement: Workspace-scoped agent installation

`axm commands install` SHALL install commands to all agents configured in the workspace. There SHALL be no `--agent` flag for per-agent targeting. The set of agents is determined by the workspace's configured agent list at install time.

#### Scenario: Command installed to all configured agents

- **WHEN** user runs `axm commands install @acme/commands/review`
- **AND** the workspace has configured agents `["claude-code", "cursor", "gemini-cli"]`
- **THEN** the command SHALL be rendered to all three agents' command directories

#### Scenario: Agent flag is rejected

- **WHEN** user runs `axm commands install review --agent claude-code`
- **THEN** the command SHALL reject the `--agent` flag as unrecognized

### Requirement: Install flow

Command installation SHALL follow this sequence: resolve source, materialize command package, read manifest and body, render to agents, update settings, update lockfile.

#### Scenario: Full install flow

- **WHEN** user runs `axm commands install @acme/commands/review`
- **THEN** the CLI SHALL resolve the source, materialize the package to `.axm/extensions/`, read `command.json` and `COMMAND.md`, render to each configured agent's commands directory, write a command entry to `settings.json`, and write a lock entry with the `agents` array

#### Scenario: Rendered files placed in agent directories

- **WHEN** a command is installed with agents `["claude-code", "copilot"]`
- **THEN** Claude Code SHALL receive a `.md` file in `.claude/commands/`
- **AND** Copilot SHALL receive a `.prompt.md` file in `.github/prompts/`

### Requirement: Source input forms

`axm commands install` SHALL accept registry command names in the fully qualified form `@owner/commands/name`, optionally with a `@<version>` suffix, bare command names resolved through the default owner, local filesystem paths, `file://` URLs, and explicit git-hosted sources such as `github:owner/repo`.

#### Scenario: Fully qualified registry command name

- **WHEN** user runs `axm commands install @acme/commands/review`
- **THEN** the CLI SHALL install the `review` command from the `@acme` owner

#### Scenario: Fully qualified with version constraint

- **WHEN** user runs `axm commands install @acme/commands/review@^1.0.0`
- **THEN** the CLI SHALL install the newest available version satisfying `^1.0.0`

#### Scenario: Local path source

- **WHEN** user runs `axm commands install ./commands/review`
- **THEN** the CLI SHALL install from the local filesystem path

#### Scenario: Git-hosted source

- **WHEN** user runs `axm commands install github:acme/review-command`
- **THEN** the CLI SHALL install from the git-hosted source

### Requirement: Bare-name lookup uses default owner

When the user provides a bare command name, install SHALL resolve it under the default owner. Project settings SHALL take precedence over user settings when both define a default owner.

#### Scenario: Bare name resolved from project default owner

- **WHEN** user runs `axm commands install review`
- **AND** project settings define default owner `@acme`
- **THEN** the CLI SHALL resolve the request as `@acme/commands/review`

#### Scenario: Bare name without any default owner fails

- **WHEN** user runs `axm commands install review`
- **AND** neither project nor user settings define a default owner
- **THEN** the CLI SHALL fail with guidance to configure an owner or use a fully qualified name

### Requirement: Registry version constraints

Registry installs SHALL accept valid semver ranges. Omitting the version SHALL mean "install the latest available version". Invalid version constraints SHALL fail before installation begins.

#### Scenario: Exact pin accepted

- **WHEN** user runs `axm commands install @acme/commands/review@1.2.3`
- **THEN** the CLI SHALL install exactly version `1.2.3`

#### Scenario: Invalid range rejected

- **WHEN** user runs `axm commands install @acme/commands/review@not-a-version`
- **THEN** the CLI SHALL fail with an error indicating the version constraint is invalid

### Requirement: Idempotent command install

Installing a command that is already installed SHALL be a safe no-op that produces a success result. The operation SHALL re-apply idempotently without adverse effects.

#### Scenario: Re-installing already installed command succeeds

- **WHEN** user runs `axm commands install review`
- **AND** `review` is already installed
- **THEN** the install operation SHALL complete with a success result
- **AND** rendered files SHALL be re-written to agents

### Requirement: Name collision handling

Installing a command whose name matches an already-installed command with a different source SHALL require `--force`. Same-source re-install SHALL be idempotent without `--force`.

#### Scenario: Different source requires force

- **WHEN** user runs `axm commands install @other/commands/review`
- **AND** `review` is already installed from `@acme/commands/review`
- **THEN** the CLI SHALL fail with an error suggesting `--force`

#### Scenario: Force overrides existing

- **WHEN** user runs `axm commands install @other/commands/review --force`
- **AND** `review` is already installed from a different source
- **THEN** the CLI SHALL replace the existing command

### Requirement: Lossy rendering warnings at install

When rendering produces lossy-rendering warnings for any agent, the install CLI SHALL display the warnings grouped by agent after a successful install.

#### Scenario: Warnings displayed after install

- **WHEN** a command with `model` and `allowedTools` is installed
- **AND** Cursor does not support either field
- **THEN** the CLI SHALL display warnings for Cursor listing unsupported features
- **AND** the command SHALL still be installed successfully

### Requirement: Preview flag

`axm commands install --preview` SHALL display the install plan without applying it.

#### Scenario: Preview shows plan without installing

- **WHEN** user runs `axm commands install @acme/commands/review --preview`
- **THEN** the install plan SHALL be displayed (source, target agents, potential warnings)
- **AND** no command SHALL be installed

### Requirement: Scope flag

`axm commands install` SHALL accept `--scope` to control whether the command is installed to project or user scope. Default SHALL be project scope.

#### Scenario: User scope installation

- **WHEN** user runs `axm commands install review --scope user`
- **THEN** rendered files SHALL be placed in each agent's user-level commands directory

#### Scenario: Default is project scope

- **WHEN** user runs `axm commands install review` without `--scope`
- **THEN** rendered files SHALL be placed in each agent's project-level commands directory
