## ADDED Requirements

### Requirement: Outdated command reports version currency for all extensions

The `axm outdated` command SHALL report installed vs available versions for all configured, enabled, registry-sourced extensions in the active workspace scope.

For each outdated extension, the output SHALL include the extension FQN, installed version, declared constraint, and latest available version.

#### Scenario: Extensions with available updates

- **WHEN** the user runs `axm outdated`
- **AND** some configured extensions have newer versions available
- **THEN** the command SHALL display a table listing each outdated extension
- **AND** each row SHALL include the FQN, installed version, declared constraint, and latest version satisfying the constraint

#### Scenario: All extensions are current

- **WHEN** the user runs `axm outdated`
- **AND** all configured extensions are at their latest matching version
- **THEN** the command SHALL report that all extensions are up to date

#### Scenario: No configured extensions

- **WHEN** the user runs `axm outdated`
- **AND** the workspace has no configured extensions
- **THEN** the command SHALL report that there are no configured extensions

### Requirement: Outdated command distinguishes major version updates

The `axm outdated` command SHALL distinguish between minor/patch updates and major (semver-breaking) updates in its output.

#### Scenario: Major version update available

- **WHEN** an extension has installed version `1.2.3` and the latest available is `3.0.0`
- **THEN** the output SHALL indicate that this is a major update

#### Scenario: Minor version update available

- **WHEN** an extension has installed version `1.2.3` and the latest available is `1.4.0`
- **THEN** the output SHALL display the update without a major-update indicator

### Requirement: Outdated command supports scope and type filtering

The `axm outdated` command SHALL support `--scope` and `--type` flags to filter results.

#### Scenario: Filter by extension type

- **WHEN** the user runs `axm outdated --type skills`
- **THEN** the command SHALL report currency only for skill extensions

#### Scenario: Filter by scope

- **WHEN** the user runs `axm outdated --scope user`
- **THEN** the command SHALL report currency for extensions in the user-scope workspace

### Requirement: Outdated command produces JSON output

The `axm outdated` command SHALL support `--json` output following the standard JSON envelope.

#### Scenario: JSON output lists outdated extensions

- **WHEN** the user runs `axm outdated --json`
- **THEN** the command SHALL output a JSON object with `command` and `data` fields
- **AND** `data` SHALL include an array of entries, each with `ref`, `type`, `installedVersion`, `constraint`, `latestMatching`, and `latestAvailable` fields

### Requirement: Outdated command is read-only

The `axm outdated` command SHALL NOT make any mutations to the workspace, settings, lockfile, or installed extensions.

#### Scenario: No side effects

- **WHEN** the user runs `axm outdated`
- **THEN** the workspace state SHALL be identical before and after the command runs
