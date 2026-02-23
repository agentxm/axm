## MODIFIED Requirements

### Requirement: Positional argument glob expansion against lockfile

When a command positional name argument contains `*`, the handler SHALL expand it against taxonomy-derived local skill candidates before source resolution. The candidate set SHALL include installed (`Configured ∪ Implicit`) and unmanaged discovered skill names, and SHALL exclude ignored names.

#### Scenario: Positional glob expands across installed and unmanaged candidates

- **WHEN** a positional argument is `"effect-*"`
- **AND** installed candidates include `effect-basics`
- **AND** unmanaged discovered candidates include `effect-stream`
- **THEN** expansion SHALL produce `effect-basics` and `effect-stream`

#### Scenario: Ignored candidate excluded from expansion

- **WHEN** a positional argument is `"effect-*"`
- **AND** `effect-errors` matches ignored patterns
- **THEN** `effect-errors` SHALL be excluded before expansion

#### Scenario: Non-glob passes through unchanged

- **WHEN** a positional argument is `"my-skill"` (no `*`)
- **THEN** it SHALL NOT be glob-expanded
- **AND** it SHALL be passed directly to `resolveSource`
