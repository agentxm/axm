## MODIFIED Requirements

### Requirement: Fork command accepts source and optional skill filter

The fork command SHALL accept a `<source>` positional argument supporting source strings and glob patterns. For glob positional input, expansion SHALL run against taxonomy-derived local extension candidates and SHALL exclude ignored names.

The local candidate set for skill glob positional expansion SHALL include:

- installed skill names (`Configured ∪ Implicit`)
- unmanaged discovered skill names derived by classification

#### Scenario: Fork with glob as positional argument

- **WHEN** running `axm skills fork "effect-*"`
- **AND** taxonomy candidates include `effect-basics`, `effect-errors`, `effect-stream`
- **THEN** the handler SHALL expand `"effect-*"` against that candidate set
- **AND** resolve each matched name for discovery
- **AND** discover and fork all matched skills

#### Scenario: Ignored names excluded from positional glob expansion

- **WHEN** running `axm skills fork "effect-*"`
- **AND** `effect-errors` matches ignored patterns
- **THEN** `effect-errors` SHALL be excluded from candidate names before expansion
