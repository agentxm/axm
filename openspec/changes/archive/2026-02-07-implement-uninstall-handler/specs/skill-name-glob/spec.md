## ADDED Requirements

### Requirement: Expand glob pattern against skill names

The glob expansion function SHALL accept a pattern string and a `ReadonlyArray<string>` of skill names, and return a `ReadonlyArray<string>` of matching names. It SHALL be a pure function with no Effect dependencies.

#### Scenario: Wildcard prefix match

- **WHEN** the pattern is `effect-*` and the skill names are `["effect-basics", "effect-stream", "testing-unit"]`
- **THEN** the result SHALL be `["effect-basics", "effect-stream"]`

#### Scenario: Wildcard suffix match

- **WHEN** the pattern is `*-testing` and the skill names are `["unit-testing", "e2e-testing", "effect-basics"]`
- **THEN** the result SHALL be `["unit-testing", "e2e-testing"]`

#### Scenario: Wildcard in middle

- **WHEN** the pattern is `effect-*-basics` and the skill names are `["effect-ts-basics", "effect-basics", "testing"]`
- **THEN** the result SHALL be `["effect-ts-basics"]`

#### Scenario: Match all with standalone wildcard

- **WHEN** the pattern is `*` and the skill names are `["a", "b", "c"]`
- **THEN** the result SHALL be `["a", "b", "c"]`

#### Scenario: Literal name without wildcards

- **WHEN** the pattern is `effect-basics` and the skill names are `["effect-basics", "effect-stream"]`
- **THEN** the result SHALL be `["effect-basics"]`

#### Scenario: Literal name not found

- **WHEN** the pattern is `nonexistent` and the skill names are `["effect-basics"]`
- **THEN** the result SHALL be an empty array

#### Scenario: Zero matches for glob pattern

- **WHEN** the pattern is `foo-*` and the skill names are `["bar-a", "baz-b"]`
- **THEN** the result SHALL be an empty array

### Requirement: Only `*` wildcard is supported

The glob expansion SHALL only support `*` as a wildcard character. All other characters SHALL be treated as literals, including `?`, `[`, `]`, `{`, and `}`.

#### Scenario: Question mark treated as literal

- **WHEN** the pattern is `effect-?` and the skill names are `["effect-?", "effect-a"]`
- **THEN** the result SHALL be `["effect-?"]`

#### Scenario: Brackets treated as literal

- **WHEN** the pattern is `effect-[ab]` and the skill names are `["effect-[ab]", "effect-a"]`
- **THEN** the result SHALL be `["effect-[ab]"]`

### Requirement: Case-sensitive matching

Glob matching SHALL be case-sensitive. Patterns SHALL match against skill names exactly as stored in the lockfile.

#### Scenario: Case mismatch does not match

- **WHEN** the pattern is `Effect-*` and the skill names are `["effect-basics", "Effect-Basics"]`
- **THEN** the result SHALL be `["Effect-Basics"]`
