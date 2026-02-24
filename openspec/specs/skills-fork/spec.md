## MODIFIED Requirements

### Requirement: Glob-based batch forking

When the input is a glob pattern, the handler SHALL match against taxonomy-derived local candidates and build a plan for all matches. Candidate construction SHALL exclude ignored names.

The candidate set SHALL include:

- installed skill names (`Configured ∪ Implicit`)
- unmanaged skill names discovered on disk and derived by classification

#### Scenario: Multiple matches across lifecycle sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** installed names include `effect-basics`
- **AND** unmanaged discovered names include `effect-errors` and `effect-streams`
- **THEN** the command SHALL match all three names
- **AND** the plan SHALL contain fork operations for all matched skills

#### Scenario: Dedupe across lifecycle sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** `effect-basics` appears in both installed and unmanaged discovery inputs
- **THEN** `effect-basics` SHALL appear once in the matched set
- **AND** the plan SHALL include a single fork sequence for `effect-basics`

#### Scenario: Ignored match is excluded

- **WHEN** `skills fork "effect-*"` is called
- **AND** `effect-errors` matches ignored patterns
- **THEN** `effect-errors` SHALL be excluded before glob expansion

#### Scenario: No matches in unignored candidates

- **WHEN** `skills fork "nonexistent-*"` is called and no unignored local candidates match
- **THEN** the command SHALL report no matching skills and exit
- **AND** the error output SHALL include available unignored candidate names
