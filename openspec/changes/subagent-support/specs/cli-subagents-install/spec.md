## ADDED Requirements

### Requirement: Workspace-scoped agent installation with per-agent targeting

`axm subagents install` SHALL install subagents to all agents configured in the workspace by default. The `--agent` flag SHALL allow per-agent targeting, restricting rendering to only the specified agents.

#### Scenario: Subagent installed to all configured agents

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer`
- **AND** the workspace has configured agents `["claude-code", "cursor", "gemini-cli"]`
- **THEN** the subagent SHALL be rendered to all three agents' subagent directories

#### Scenario: Per-agent targeting with --agent

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer --agent claude-code --agent cursor`
- **AND** the workspace has configured agents `["claude-code", "cursor", "gemini-cli"]`
- **THEN** the subagent SHALL be rendered only for Claude Code and Cursor
- **AND** Gemini CLI SHALL NOT receive a rendered file

### Requirement: Install flow

Subagent installation SHALL follow this sequence: resolve source, materialize subagent package, read manifest and SUBAGENT.md, render to agents, update settings, update lockfile with renderedFiles.

#### Scenario: Full install flow

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer`
- **THEN** the CLI SHALL resolve the source, materialize the package to `.axm/extensions/`, read `subagent.json` and `src/SUBAGENT.md`, render to each configured agent's subagents directory, write a subagent entry to `settings.json`, and write a lock entry with the `renderedFiles` map

#### Scenario: Rendered files placed in agent directories

- **WHEN** a subagent is installed with agents `["claude-code", "codex", "roo"]`
- **THEN** Claude Code SHALL receive a `.md` file in `.claude/agents/`
- **AND** Codex SHALL receive a `.toml` file in `.codex/agents/`
- **AND** Roo Code SHALL have a mode entry merged into `.roomodes`

### Requirement: Source input forms

`axm subagents install` SHALL accept registry subagent names in the fully qualified form `@owner/subagents/name`, optionally with a `@<version>` suffix, bare subagent names resolved through the default owner, local filesystem paths, `file://` URLs, and explicit git-hosted sources such as `github:owner/repo`.

#### Scenario: Fully qualified registry subagent name

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer`
- **THEN** the CLI SHALL install the `code-reviewer` subagent from the `@acme` owner

#### Scenario: Fully qualified with version constraint

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer@^1.0.0`
- **THEN** the CLI SHALL install the newest available version satisfying `^1.0.0`

#### Scenario: Local path source

- **WHEN** user runs `axm subagents install ./subagents/code-reviewer`
- **THEN** the CLI SHALL install from the local filesystem path

#### Scenario: Git-hosted source

- **WHEN** user runs `axm subagents install github:acme/review-subagent`
- **THEN** the CLI SHALL install from the git-hosted source

### Requirement: Bare-name lookup uses default owner

When the user provides a bare subagent name, install SHALL resolve it under the default owner. Project settings SHALL take precedence over user settings when both define a default owner.

#### Scenario: Bare name resolved from project default owner

- **WHEN** user runs `axm subagents install code-reviewer`
- **AND** project settings define default owner `@acme`
- **THEN** the CLI SHALL resolve the request as `@acme/subagents/code-reviewer`

#### Scenario: Bare name without any default owner fails

- **WHEN** user runs `axm subagents install code-reviewer`
- **AND** neither project nor user settings define a default owner
- **THEN** the CLI SHALL fail with guidance to configure an owner or use a fully qualified name

### Requirement: Registry version constraints

Registry installs SHALL accept valid semver ranges. Omitting the version SHALL mean "install the latest available version". Invalid version constraints SHALL fail before installation begins.

#### Scenario: Exact pin accepted

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer@1.2.3`
- **THEN** the CLI SHALL install exactly version `1.2.3`

#### Scenario: Invalid range rejected

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer@not-a-version`
- **THEN** the CLI SHALL fail with an error indicating the version constraint is invalid

### Requirement: Multi-subagent discovery

When the source is a GitHub repo or local directory containing multiple subagents, AXM SHALL discover them by scanning for `subagent.json` files. Without `--subagent` or `--all`, the user SHALL be prompted to select which subagents to install.

#### Scenario: Multi-subagent repo prompts selection

- **WHEN** user runs `axm subagents install owner/repo`
- **AND** the repo contains `code-reviewer/subagent.json` and `security-audit/subagent.json`
- **THEN** the CLI SHALL prompt the user to select which subagents to install

#### Scenario: Cherry-pick with --subagent flag

- **WHEN** user runs `axm subagents install owner/repo --subagent code-reviewer --subagent security-audit`
- **THEN** the CLI SHALL install only the named subagents without prompting

#### Scenario: Install all with --all flag

- **WHEN** user runs `axm subagents install owner/repo --all`
- **THEN** the CLI SHALL install every discovered subagent without prompting

### Requirement: Idempotent subagent install

Installing a subagent that is already installed SHALL be a safe no-op that produces a success result. The operation SHALL re-render agent-native files idempotently.

#### Scenario: Re-installing already installed subagent succeeds

- **WHEN** user runs `axm subagents install code-reviewer`
- **AND** `code-reviewer` is already installed
- **THEN** the install operation SHALL complete with a success result
- **AND** rendered files SHALL be re-written to agents

### Requirement: Name collision handling

Installing a subagent whose name matches an already-installed subagent with a different source SHALL require `--force`. Same-source re-install SHALL be idempotent without `--force`.

#### Scenario: Different source requires force

- **WHEN** user runs `axm subagents install @other/subagents/code-reviewer`
- **AND** `code-reviewer` is already installed from `@acme/subagents/code-reviewer`
- **THEN** the CLI SHALL fail with an error suggesting `--force`

#### Scenario: Force overrides existing

- **WHEN** user runs `axm subagents install @other/subagents/code-reviewer --force`
- **AND** `code-reviewer` is already installed from a different source
- **THEN** the CLI SHALL replace the existing subagent

### Requirement: Manifest agents filter

When the subagent manifest includes an `agents` array, rendering SHALL be restricted to only those agents (intersected with configured agents). The `--agent` flag further restricts within the manifest's agent list.

#### Scenario: Manifest agents filter applied

- **WHEN** a subagent manifest has `agents: ["claude-code", "cursor"]`
- **AND** the workspace has agents `["claude-code", "cursor", "gemini-cli"]`
- **THEN** the subagent SHALL only be rendered for Claude Code and Cursor

#### Scenario: --agent intersects with manifest agents

- **WHEN** a subagent manifest has `agents: ["claude-code", "cursor", "gemini-cli"]`
- **AND** user specifies `--agent claude-code`
- **THEN** the subagent SHALL only be rendered for Claude Code

### Requirement: Lossy rendering warnings at install

When rendering produces lossy-rendering warnings for any agent, the install CLI SHALL display the warnings grouped by agent after a successful install.

#### Scenario: Warnings displayed after install

- **WHEN** a subagent with `background: true` is installed
- **AND** Gemini CLI does not support background mode
- **THEN** the CLI SHALL display a warning for Gemini CLI listing the unsupported feature
- **AND** the subagent SHALL still be installed successfully

### Requirement: Preview flag

`axm subagents install --preview` SHALL display the install plan without applying it, including rendered file paths and formats per agent.

#### Scenario: Preview shows plan without installing

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer --preview`
- **THEN** the install plan SHALL be displayed (source, target agents, rendered file paths, formats)
- **AND** no subagent SHALL be installed

### Requirement: Scope flag

`axm subagents install` SHALL accept `--scope` to control whether the subagent is installed to project or user scope. Default SHALL be project scope.

#### Scenario: User scope installation

- **WHEN** user runs `axm subagents install code-reviewer --scope user`
- **THEN** rendered files SHALL be placed in each agent's user-level subagents directory

#### Scenario: Default is project scope

- **WHEN** user runs `axm subagents install code-reviewer` without `--scope`
- **THEN** rendered files SHALL be placed in each agent's project-level subagents directory

### Requirement: Confirmation and --yes flag

In interactive mode, `axm subagents install` SHALL show the install plan and prompt for confirmation before proceeding. `--yes` SHALL skip the confirmation prompt.

#### Scenario: Interactive confirmation

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer`
- **AND** the terminal is interactive
- **THEN** the CLI SHALL display the install plan and prompt for confirmation

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents install @acme/subagents/code-reviewer --yes`
- **THEN** the CLI SHALL proceed without confirmation
