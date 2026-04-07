## ADDED Requirements

### Requirement: Preview flag on skills uninstall

`axm skills uninstall --preview` SHALL display the uninstall plan without applying changes. The flag is already wired through `resolvePlan`; this requirement covers verified end-to-end behavior.

#### Scenario: Preview uninstall displays plan without applying

- **WHEN** user runs `axm skills uninstall code-review --preview`
- **THEN** the CLI SHALL display what would be removed
- **AND** SHALL NOT delete any files, modify settings, or update the lockfile
- **AND** SHALL return a `PreviewedPlan` result
