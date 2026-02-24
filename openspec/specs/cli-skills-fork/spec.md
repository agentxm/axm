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

### Requirement: Fork orchestration pipeline

The fork handler SHALL follow this pipeline: registry guard -> resolve namespace -> discover skills -> filter by `--skill` -> build fork+publish+install plan -> resolve plan.

When the source is a glob pattern, the discover phase SHALL:

- collect taxonomy-derived local candidates excluding ignored names
- expand the glob against that candidate set
- resolve each match and discover skill references
- merge discovered skills into a single deduplicated list

#### Scenario: Full fork pipeline with glob source

- **WHEN** running `axm skills fork "effect-*" --yes`
- **AND** taxonomy-derived local candidates contain matching names
- **THEN** the handler SHALL detect the glob pattern
- **AND** expand against the taxonomy-derived candidate set
- **AND** resolve each matched name
- **AND** discover skills for each match
- **AND** merge and dedupe discovered skills
- **AND** ensure a registry is configured
- **AND** resolve the user's namespace
- **AND** build a plan with fork + publish + install steps for each skill
- **AND** resolve the plan
