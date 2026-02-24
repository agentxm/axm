## ADDED Requirements

### Requirement: Packs add uses plan execution with precomputed delta

The `axm packs add` handler SHALL compute manifest add changes during planning and execute those exact changes via an operation resolved through `ws.resolvePlan()`.

#### Scenario: Build and resolve add-to-pack plan

- **WHEN** the user runs `axm packs add <pack> <extension>` and matching extensions are found
- **THEN** the handler SHALL compute the manifest delta to add
- **AND** the handler SHALL build a plan that carries that precomputed delta
- **AND** the handler SHALL execute the plan via `ws.resolvePlan()`

#### Scenario: Stale manifest conflict on apply

- **WHEN** a precomputed add delta is planned
- **AND** the target manifest changes before apply
- **THEN** the operation SHALL fail with a `CliError` conflict indicating stale manifest state
- **AND** the operation SHALL NOT write a partial manifest update

### Requirement: Packs add supports preview mode

The `axm packs add` command SHALL accept `--preview` and route it through workspace plan resolution.

#### Scenario: Preview mode for packs add

- **WHEN** the user runs `axm packs add <pack> <extension> --preview`
- **THEN** the CLI SHALL display planned manifest additions
- **AND** the pack manifest SHALL remain unchanged
