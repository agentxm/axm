## MODIFIED Requirements

### Requirement: Plan Display

The CLI SHALL display the installation plan before applying changes.

#### Scenario: Plan format

- **WHEN** displaying the installation plan
- **THEN** the CLI shows action labels: `(install)` for install, `(update)` for update, `(uninstall)` for uninstall

#### Scenario: Plan with agents

- **WHEN** displaying a plan step
- **THEN** the CLI shows the skill name followed by agents: `skill-name @ agent1, agent2`

#### Scenario: Plan summary

- **WHEN** displaying the installation plan
- **THEN** the CLI shows summary: "N skills to install, N to update, N to uninstall"

#### Scenario: Unchanged skills hidden

- **WHEN** displaying the installation plan
- **THEN** unchanged skills are not shown (only changes displayed)

#### Scenario: Version shown for updates

- **WHEN** displaying an UpdateSkill step with versions
- **THEN** versions are shown: `1.0.0 → 2.0.0`

#### Scenario: Hash shown for git updates

- **WHEN** displaying an UpdateSkill step with git hashes (no versions)
- **THEN** short hashes are shown (first 7 chars): `abc1234 → def5678`

### Requirement: State-Based Installation

The CLI SHALL use the workspace reconciliation pattern for installation.

#### Scenario: Load current state

- **WHEN** starting installation
- **THEN** the CLI calls loadCurrentState to get merged actual and locked state with issues

#### Scenario: Check workspace health

- **WHEN** current state has error-severity issues and --force not provided
- **THEN** the CLI fails with UnhealthyWorkspaceError listing the issues

#### Scenario: Build ideal state

- **WHEN** processing install request
- **THEN** the CLI calls buildIdealState with skills-install command

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI calls buildPlan to compute the execution plan

#### Scenario: No changes needed

- **WHEN** plan has no steps
- **THEN** the CLI displays "Already up to date." and exits

#### Scenario: Apply plan

- **WHEN** changes are confirmed (--yes or user confirms)
- **THEN** the CLI calls applyPlan to execute the plan

## REMOVED Requirements

### Requirement: Repair in Plan Display

**Reason**: Repair concept removed; replaced by explicit reinstall via install --force.

**Migration**: Users with hash mismatches should run `axm skills install <source> --force` to reinstall.
