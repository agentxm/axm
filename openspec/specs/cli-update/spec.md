## ADDED Requirements

### Requirement: Root update command updates all configured extensions

The `axm update` command with no arguments SHALL update all configured, enabled, registry-sourced extensions across all extension types (skills, commands, subagents, MCP servers, packs) in the active workspace scope.

The command SHALL read configured entries from `settings.json`, resolve each against the registry, and build a unified plan that re-resolves and reinstalls extensions that have newer versions available.

#### Scenario: Workspace update with outdated extensions

- **WHEN** the user runs `axm update` with no arguments
- **AND** the workspace has configured registry extensions with newer versions available
- **THEN** the command SHALL build a plan covering all extension types
- **AND** display the plan for confirmation
- **AND** apply the plan after confirmation, updating each extension to the latest version satisfying its declared constraint

#### Scenario: Workspace update with everything current

- **WHEN** the user runs `axm update` with no arguments
- **AND** all configured extensions are already at their latest matching version
- **THEN** the command SHALL report that all extensions are up to date
- **AND** make no changes

#### Scenario: Workspace update with no configured extensions

- **WHEN** the user runs `axm update` with no arguments
- **AND** the workspace has no configured extensions
- **THEN** the command SHALL report that there are no configured extensions

### Requirement: Root update command updates a single extension by FQN

The `axm update` command with a positional `source` argument SHALL update a single extension identified by its registry FQN (`@owner/<plural-type>/<name>`).

The command SHALL parse the FQN to determine the extension type, then dispatch to the appropriate per-type update workflow.

#### Scenario: FQN update for a specific extension

- **WHEN** the user runs `axm update @acme/skills/code-review`
- **THEN** the command SHALL parse the FQN to determine type `skill`
- **AND** dispatch to the skills update workflow for that extension
- **AND** update the extension to the latest version satisfying its declared constraint

#### Scenario: FQN with invalid format

- **WHEN** the user runs `axm update foo`
- **AND** the argument is not a valid registry FQN
- **THEN** the command SHALL report an error explaining the expected format
- **AND** suggest using `axm <type> update` for non-registry sources

### Requirement: Root update command supports standard flags

The `axm update` command SHALL support `--scope`, `--yes`, `--force`, and `--preview` flags with the same semantics as `axm install`.

#### Scenario: Preview flag shows plan without applying

- **WHEN** the user runs `axm update --preview`
- **THEN** the command SHALL display the update plan
- **AND** SHALL NOT apply any changes

#### Scenario: Yes flag skips confirmation

- **WHEN** the user runs `axm update --yes`
- **THEN** the command SHALL apply the update plan without prompting for confirmation

#### Scenario: Scope flag targets user or project scope

- **WHEN** the user runs `axm update --scope user`
- **THEN** the command SHALL update extensions configured in the user-scope workspace

#### Scenario: Force flag overrides constraints

- **WHEN** the user runs `axm update --force`
- **THEN** the command SHALL update extensions even when conflicts exist (e.g., unmanaged files at render paths)

### Requirement: Root update command produces JSON output

The `axm update` command SHALL support `--json` output following the standard JSON envelope.

#### Scenario: JSON output for workspace update

- **WHEN** the user runs `axm update --json --yes`
- **THEN** the command SHALL output a JSON object with `command` and `data` fields
- **AND** the `data` field SHALL include the plan resolution result

### Requirement: Root update command aggregates per-type update workflows

The root `axm update` command SHALL dispatch to existing per-type update workflows rather than reimplementing update logic. Each extension type's update behavior (constraint resolution, conflict handling) SHALL be preserved.

#### Scenario: Skills update respects pack constraints

- **WHEN** the user runs `axm update` with skills that have pack constraints
- **THEN** the skills update workflow SHALL apply pack constraint resolution as it does in `axm skills update`

#### Scenario: Per-type update logic is preserved

- **WHEN** the user runs `axm update` with mixed extension types
- **THEN** each type's update workflow SHALL execute with its full per-type behavior
- **AND** the results SHALL be aggregated into a single plan
