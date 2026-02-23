## MODIFIED Requirements

### Requirement: Expand glob patterns against installed skill names

When any positional argument contains `*`, the publish handler SHALL expand it against installed skill names from `Workspace.getInstalledSkills()`, where installed names are taxonomy-derived (`Configured ∪ Implicit`) and excluded names follow ignored-pattern rules.

#### Scenario: Glob matches installed configured and implicit skills

- **WHEN** `axm skills publish "effect-*"` is called
- **AND** installed skills include configured `effect-basics` and implicit `effect-stream`
- **THEN** the plan SHALL contain publish steps for both matched installed skills

#### Scenario: Ignored names do not participate in expansion

- **WHEN** `axm skills publish "effect-*"` is called
- **AND** `effect-errors` matches ignored patterns
- **THEN** `effect-errors` SHALL NOT be included in expansion results

### Requirement: Only managed skills are publishable via glob

Glob expansion SHALL include installed skills only and SHALL exclude unmanaged discovered-only names.

#### Scenario: Unmanaged discovered skill excluded from glob match

- **WHEN** `axm skills publish "*"` is called
- **AND** installed skills include `effect-basics`
- **AND** unmanaged discovery includes `local-tool`
- **THEN** only `effect-basics` SHALL be included in the publish plan
