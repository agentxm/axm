## MODIFIED Requirements

### Requirement: Skill Display Name Resolution

`getSkillDisplayName(skill)` SHALL return the skill's `name` field. If `name` is empty or falsy, it SHALL fall back to `basename(skill.path)`.

This function SHALL remain a pure synchronous function. It MAY use `node:path` for the `basename` call as a boundary exception, since making it effectful solely for a single string operation would be disproportionate.

#### Scenario: Skill with name

- **WHEN** a skill has `name: "my-skill"`
- **THEN** `getSkillDisplayName` SHALL return `"my-skill"`

#### Scenario: Skill with empty name

- **WHEN** a skill has `name: ""`
- **THEN** `getSkillDisplayName` SHALL return `basename(skill.path)`

#### Scenario: Skill with falsy name

- **WHEN** a skill has no `name` field (undefined/null)
- **THEN** `getSkillDisplayName` SHALL return `basename(skill.path)`
