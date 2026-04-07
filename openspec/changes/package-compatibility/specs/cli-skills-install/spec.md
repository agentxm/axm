## MODIFIED Requirements

### Requirement: Discovery-only inspection uses preview

Discovery-only inspection of available skills SHALL use `--preview` instead of `--list`. The `--list` flag SHALL NOT be accepted.

When the skill being previewed has non-empty `compatiblePackages` metadata, the preview output SHALL include a "Compatible packages" section listing the packages the skill is designed for. Each entry SHALL display the purl in a human-readable form (e.g., package name and ecosystem).

#### Scenario: Preview shows plan without applying

- **WHEN** user runs `axm skills install @acme/skills --preview`
- **THEN** the install plan SHALL be displayed without applying
- **AND** no skills SHALL be installed

#### Scenario: List flag is rejected

- **WHEN** user runs `axm skills install @acme/skills --list`
- **THEN** the command SHALL reject the `--list` flag as unrecognized

#### Scenario: Preview shows compatible packages

- **WHEN** user runs `axm skills install @acme/skills/react-testing --preview`
- **AND** the skill has `compatiblePackages: ["pkg:npm/react", "pkg:npm/react-dom"]`
- **THEN** the preview output SHALL include a "Compatible packages" section showing `react (npm)` and `react-dom (npm)`

#### Scenario: Preview omits compatibility section when empty

- **WHEN** user runs `axm skills install @acme/skills/general-review --preview`
- **AND** the skill has no `compatiblePackages` field
- **THEN** the preview output SHALL NOT include a "Compatible packages" section
