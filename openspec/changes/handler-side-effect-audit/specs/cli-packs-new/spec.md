## ADDED Requirements

### Requirement: Packs new handler uses plan execution

The `axm packs new` handler SHALL model pack scaffolding mutations as an operation plan and execute them through `ws.resolvePlan()`.

#### Scenario: Build and resolve create-pack plan

- **WHEN** the user runs `axm packs new <name>` with valid input
- **THEN** the handler SHALL build a single-step plan for pack scaffolding
- **AND** the handler SHALL execute that plan via `ws.resolvePlan()`
- **AND** the handler SHALL NOT perform direct mutation writes outside operation handlers

#### Scenario: Apply mode executes operation side-effects

- **WHEN** the user runs `axm packs new <name>` without preview and confirms apply (or passes `--yes`)
- **THEN** the operation handler SHALL create the pack directory and manifest
- **AND** the operation handler SHALL update workspace settings/lockfile metadata for the new pack

### Requirement: Packs new supports preview mode

The `axm packs new` command SHALL accept `--preview` and route it through workspace plan resolution.

#### Scenario: Preview mode for packs new

- **WHEN** the user runs `axm packs new <name> --preview`
- **THEN** the CLI SHALL display planned pack scaffolding actions
- **AND** no files, settings, or lockfile entries SHALL be modified
