## ADDED Requirements

### Requirement: Skills install participates in cross-extension lockfile reconciliation

`axm skills install` SHALL execute through `resolvePlan` plan augmentation and SHALL participate in cross-extension lockfile reconciliation when lockfile state is `missing` or `invalid`.

The command SHALL use `materialize_if_missing` policy semantics for install operations.

#### Scenario: Missing lockfile augments skills install plan

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `missing`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation operations before requested install operations

#### Scenario: Invalid lockfile augments with warning

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `invalid`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation + materialization operations
- **AND** warnings SHALL include lockfile parse/validation diagnostics

#### Scenario: Existing valid lockfile does not inject reconciliation

- **WHEN** user runs `axm skills install <source>`
- **AND** lockfile state is `ok`
- **THEN** no lockfile-reconciliation operations SHALL be injected
