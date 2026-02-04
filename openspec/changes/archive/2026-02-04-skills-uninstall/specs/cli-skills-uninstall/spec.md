## ADDED Requirements

### Requirement: Uninstall Command

The CLI SHALL provide `axm skills uninstall <skill-name>` to remove installed skills.

#### Scenario: Basic usage

- **WHEN** user runs `axm skills uninstall my-skill`
- **THEN** the CLI removes `my-skill` from all agents it was installed to

#### Scenario: Skill not found

- **WHEN** user runs `axm skills uninstall unknown-skill` and skill is not installed
- **THEN** the CLI displays error: "Skill 'unknown-skill' is not installed"

### Requirement: Agent Selection

The CLI SHALL support `--agent` flag to uninstall from specific agents only.

#### Scenario: Single agent

- **WHEN** user runs `axm skills uninstall my-skill --agent claude`
- **THEN** the CLI removes `my-skill` from claude only, keeping it for other agents

#### Scenario: Multiple agents

- **WHEN** user runs `axm skills uninstall my-skill --agent claude --agent cursor`
- **THEN** the CLI removes `my-skill` from claude and cursor only

#### Scenario: Last agent removes canonical

- **WHEN** uninstalling from the last agent that has the skill
- **THEN** the CLI also removes the canonical copy from `.axm/skills/<name>/`

#### Scenario: Other agents keep skill

- **WHEN** uninstalling from one agent but other agents still have the skill
- **THEN** the canonical copy remains in `.axm/skills/<name>/`

### Requirement: Dry Run

The CLI SHALL support `--dry-run` flag to preview changes without applying.

#### Scenario: Dry run output

- **WHEN** user runs `axm skills uninstall my-skill --dry-run`
- **THEN** the CLI displays the plan but does not remove any files

#### Scenario: Dry run no side effects

- **WHEN** using `--dry-run` flag
- **THEN** no files, lockfile entries, or settings are modified

### Requirement: Confirmation

The CLI SHALL require confirmation before uninstalling unless `--yes` is provided.

#### Scenario: Interactive confirmation

- **WHEN** user runs `axm skills uninstall my-skill` without `--yes`
- **THEN** the CLI prompts for confirmation before proceeding

#### Scenario: Skip confirmation

- **WHEN** user runs `axm skills uninstall my-skill --yes`
- **THEN** the CLI proceeds without prompting

### Requirement: Plan Display

The CLI SHALL display an uninstall plan before applying changes.

#### Scenario: Plan format

- **WHEN** displaying the uninstall plan
- **THEN** the CLI shows: `skill-name @ agent1, agent2 (uninstall)`

#### Scenario: Plan summary

- **WHEN** displaying the uninstall plan
- **THEN** the CLI shows summary: "N skills to uninstall"

### Requirement: State-Based Uninstall

The CLI SHALL use the workspace reconciliation pattern for uninstallation.

#### Scenario: Load current state

- **WHEN** starting uninstallation
- **THEN** the CLI loads current state to find installed skills

#### Scenario: Build ideal state

- **WHEN** processing uninstall request
- **THEN** the CLI builds ideal state with target skill removed (from specified agents or all)

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI computes plan with UninstallSkill steps

#### Scenario: Apply plan

- **WHEN** changes are confirmed
- **THEN** the CLI applies the plan to remove skill files, update lockfile, update settings
