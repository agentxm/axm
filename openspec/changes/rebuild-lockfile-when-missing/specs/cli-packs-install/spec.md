## ADDED Requirements

### Requirement: Packs install participates in cross-extension lockfile reconciliation

`axm packs install` SHALL execute through `resolvePlan` plan augmentation and SHALL participate in cross-extension lockfile reconciliation when lockfile state is `missing` or `invalid`.

The command SHALL use `materialize_if_missing` policy semantics for install operations.

#### Scenario: Missing lockfile augments packs install plan

- **WHEN** user runs `axm packs install <source>`
- **AND** lockfile state is `missing`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation operations before requested pack install operations

#### Scenario: Invalid lockfile augments with warning

- **WHEN** user runs `axm packs install <source>`
- **AND** lockfile state is `invalid`
- **THEN** the plan SHALL be augmented with cross-extension reconciliation + materialization operations
- **AND** warnings SHALL include lockfile parse/validation diagnostics

### Requirement: Reconciliation dedupes overlaps with pack dependencies

When pack-derived extension installs and settings-derived reconciliation installs target the same declaration key, plan augmentation SHALL inject one install operation for that key.

#### Scenario: Pack dependency and settings declaration overlap

- **WHEN** reconciliation derives an install for `@acme/skills/tool@^1`
- **AND** pack install flow derives the same declaration key
- **THEN** augmented plan SHALL include one install operation for that key
