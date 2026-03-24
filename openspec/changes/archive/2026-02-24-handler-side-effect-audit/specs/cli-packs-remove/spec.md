## ADDED Requirements

### Requirement: Packs remove uses plan execution with precomputed delta

The `axm packs remove` handler SHALL compute manifest remove changes during planning and execute those exact changes via an operation resolved through `ws.resolvePlan()`.

#### Scenario: Build and resolve remove-from-pack plan

- **WHEN** the user runs `axm packs remove <pack> <extension>` and matching manifest entries are found
- **THEN** the handler SHALL compute the manifest delta to remove
- **AND** the handler SHALL build a plan that carries that precomputed delta
- **AND** the handler SHALL execute the plan via `ws.resolvePlan()`

#### Scenario: Stale manifest conflict on apply

- **WHEN** a precomputed remove delta is planned
- **AND** the target manifest changes before apply
- **THEN** the operation SHALL fail with an `AppError` conflict indicating stale manifest state
- **AND** the operation SHALL NOT write a partial manifest update

### Requirement: Packs remove supports preview mode

The `axm packs remove` command SHALL accept `--preview` and route it through workspace plan resolution.

#### Scenario: Preview mode for packs remove

- **WHEN** the user runs `axm packs remove <pack> <extension> --preview`
- **THEN** the CLI SHALL display planned manifest removals
- **AND** the pack manifest SHALL remain unchanged
