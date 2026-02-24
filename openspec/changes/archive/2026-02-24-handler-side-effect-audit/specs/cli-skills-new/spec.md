## ADDED Requirements

### Requirement: Skills new handler uses plan execution

The `axm skills new` handler SHALL model workspace mutations as an operation plan and execute them through `ws.resolvePlan()`.

#### Scenario: Build and resolve create-skill plan

- **WHEN** the user runs `axm skills new <name>` with valid input
- **THEN** the handler SHALL build a single-step plan for skill scaffolding
- **AND** the handler SHALL execute that plan via `ws.resolvePlan()`
- **AND** the handler SHALL NOT perform direct mutation writes outside operation handlers

#### Scenario: Preview mode for skills new

- **WHEN** the user runs `axm skills new <name> --preview`
- **THEN** the CLI SHALL display planned scaffold actions (directory/file creation, settings entry, agent links)
- **AND** no files, settings, or lockfile entries SHALL be modified

#### Scenario: Apply mode executes operation side-effects

- **WHEN** the user runs `axm skills new <name>` without preview and confirms apply (or passes `--yes`)
- **THEN** the operation handler SHALL perform skill scaffolding side-effects
- **AND** the handler result SHALL be reported through the plan execution flow
