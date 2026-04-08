## ADDED Requirements

### Requirement: Preview flag on skills enable

`axm skills enable --preview` SHALL display the enable plan without applying changes. The flag is already wired through `resolvePlan`; this requirement covers verified end-to-end behavior.

#### Scenario: Preview enable displays plan without applying

- **WHEN** user runs `axm skills enable code-review --preview`
- **THEN** the CLI SHALL display what would be enabled
- **AND** SHALL NOT modify settings or the lockfile
- **AND** SHALL return a `PreviewedPlan` result

### Requirement: Preview flag on skills disable

`axm skills disable --preview` SHALL display the disable plan without applying changes. The flag is already wired through `resolvePlan`; this requirement covers verified end-to-end behavior.

#### Scenario: Preview disable displays plan without applying

- **WHEN** user runs `axm skills disable code-review --preview`
- **THEN** the CLI SHALL display what would be disabled
- **AND** SHALL NOT delete any files, modify settings, or update the lockfile
- **AND** SHALL return a `PreviewedPlan` result
