## ADDED Requirements

### Requirement: Preview flag on skills update

`axm skills update --preview` SHALL display the update plan without applying changes. The flag is already wired through `resolvePlan`; this requirement covers verified end-to-end behavior.

#### Scenario: Preview update displays plan without applying

- **WHEN** user runs `axm skills update code-review --preview`
- **THEN** the CLI SHALL display what would be updated
- **AND** SHALL NOT modify any files, settings, or the lockfile
- **AND** SHALL return a `PreviewedPlan` result
