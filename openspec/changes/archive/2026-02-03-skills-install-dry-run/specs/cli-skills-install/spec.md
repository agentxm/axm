# cli-skills-install Specification (Delta)

## Purpose

Adds dry-run and JSON output capabilities to the `axm skills install` command.

## ADDED Requirements

### Requirement: Dry-Run Flag

The CLI SHALL support a `--dry-run` flag that previews installation without making changes.

#### Scenario: Dry-run shows plan

- **WHEN** the user runs `axm skills install <source> --dry-run`
- **THEN** the CLI displays the installation plan showing skills to add/update/remove

#### Scenario: Dry-run makes no changes

- **WHEN** the user runs `axm skills install <source> --dry-run`
- **THEN** no files are written, no settings updated, no lockfile modified

#### Scenario: Dry-run with remote source

- **WHEN** the user runs `axm skills install github:owner/repo --dry-run`
- **THEN** the CLI fetches the source to analyze contents and displays "Fetching source to analyze contents..."

#### Scenario: Dry-run exit message

- **WHEN** dry-run completes
- **THEN** the CLI displays "Dry-run complete. No changes made."

### Requirement: JSON Output Flag

The CLI SHALL support a `--json` flag for machine-readable output.

#### Scenario: JSON plan output

- **WHEN** the user runs `axm skills install <source> --dry-run --json`
- **THEN** the CLI outputs the plan as JSON with skills changes array and summary

#### Scenario: JSON format structure

- **WHEN** outputting JSON plan
- **THEN** each change includes `_tag` (Add/Update/Remove), `name`, and type-specific fields

#### Scenario: JSON with real install

- **WHEN** the user runs `axm skills install <source> --json --yes`
- **THEN** the CLI outputs the result as JSON after installation completes

### Requirement: Plan Display

The CLI SHALL display the installation plan before applying changes.

#### Scenario: Plan format

- **WHEN** displaying the installation plan
- **THEN** the CLI shows symbols: `+` for add, `~` for update, `!` for repair, `-` for remove

#### Scenario: Plan summary

- **WHEN** displaying the installation plan
- **THEN** the CLI shows summary: "N to add, N to update, N to repair, N to remove"

#### Scenario: Unchanged skills hidden

- **WHEN** displaying the installation plan
- **THEN** unchanged skills are not shown (only changes displayed)

#### Scenario: Source shown for adds

- **WHEN** displaying an Add change
- **THEN** the skill source is shown (e.g., `github:org/skills@v1.0.0`)

#### Scenario: Hash preview for updates

- **WHEN** displaying an Update change
- **THEN** short hashes are shown (first 7 chars): `abc1234 → def5678`

### Requirement: State-Based Installation

The CLI SHALL use state-based architecture for installation.

#### Scenario: Load current state

- **WHEN** starting installation
- **THEN** the CLI loads actual state from disk and locked state from lockfile

#### Scenario: Build ideal state

- **WHEN** processing install request
- **THEN** the CLI builds ideal state from the resolved source

#### Scenario: Compute diff

- **WHEN** current and ideal states are ready
- **THEN** the CLI computes the diff (plan) between them

#### Scenario: No changes needed

- **WHEN** diff shows no changes
- **THEN** the CLI displays "Already up to date." and exits

#### Scenario: Confirm before apply

- **WHEN** changes are needed and `--yes` not provided
- **THEN** the CLI prompts "Apply changes?" before proceeding
