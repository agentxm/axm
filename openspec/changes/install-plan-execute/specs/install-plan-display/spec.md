## ADDED Requirements

### Requirement: Display plan summary

The plan display SHALL render a human-readable summary of the plan via Clack.

#### Scenario: Show skills to install

- **WHEN** the plan contains actions with `action: "execute"`
- **THEN** the display SHALL list each skill name under an "install" heading

#### Scenario: Show skipped skills

- **WHEN** the plan contains actions with `action: "no-op"`
- **THEN** the display SHALL list each skill name with its reason under a "skip" heading

#### Scenario: Show summary line

- **WHEN** displaying a plan
- **THEN** the display SHALL show a summary: "N to install, M to skip"

#### Scenario: All no-ops

- **WHEN** every action in the plan is `"no-op"`
- **THEN** the display SHALL show the skipped skills and summary
- **AND** the summary SHALL indicate nothing to install
