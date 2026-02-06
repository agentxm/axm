## ADDED Requirements

### Requirement: Skill Display Name Resolution

`getSkillDisplayName(skill)` SHALL return the skill's `name` field. If `name` is empty or falsy, it SHALL fall back to `basename(skill.path)`.

#### Scenario: Skill with name

- **WHEN** a skill has `name: "my-skill"`
- **THEN** `getSkillDisplayName` SHALL return `"my-skill"`

#### Scenario: Skill with empty name

- **WHEN** a skill has `name: ""`
- **THEN** `getSkillDisplayName` SHALL return `basename(skill.path)`

#### Scenario: Skill with falsy name

- **WHEN** a skill has no `name` field (undefined/null)
- **THEN** `getSkillDisplayName` SHALL return `basename(skill.path)`

### Requirement: Skill Filtering by Name

`filterSkills(skills, inputNames)` SHALL return skills whose name matches any entry in `inputNames`. Matching SHALL be case-insensitive and SHALL compare against both `skill.name` and `getSkillDisplayName(skill)`.

#### Scenario: Exact name match (case-insensitive)

- **WHEN** filtering skills with `inputNames: ["My-Skill"]` and a skill has `name: "my-skill"`
- **THEN** the skill SHALL be included in results

#### Scenario: Display name fallback match

- **WHEN** filtering skills with `inputNames: ["my-dir"]` and a skill has `name: ""` but `path: "/repo/skills/my-dir"`
- **THEN** the skill SHALL be included (matched via display name `basename(path)`)

#### Scenario: No match

- **WHEN** filtering skills with `inputNames: ["other-skill"]` and no skill has a matching name or display name
- **THEN** the result SHALL be an empty array

#### Scenario: Multiple input names

- **WHEN** filtering with `inputNames: ["skill-a", "skill-b"]`
- **THEN** skills matching either name SHALL be included

### Requirement: Skill Name Sanitization

`sanitizeName(name)` SHALL transform a skill name into a safe on-disk directory name for installation.

The sanitization rules SHALL be applied in order:

1. Convert to lowercase
2. Replace non-alphanumeric characters (except `.` and `_`) with hyphens
3. Strip leading and trailing dots and hyphens
4. Truncate to 255 characters
5. If the result is empty after all transformations, fall back to `"unnamed-skill"`

#### Scenario: Simple name passes through

- **WHEN** sanitizing `"my-skill"`
- **THEN** the result SHALL be `"my-skill"`

#### Scenario: Uppercase converted

- **WHEN** sanitizing `"My-Skill"`
- **THEN** the result SHALL be `"my-skill"`

#### Scenario: Special characters replaced

- **WHEN** sanitizing `"my skill@v2!"`
- **THEN** the result SHALL be `"my-skill-v2-"`
- **AND** after stripping trailing hyphens: `"my-skill-v2"`

#### Scenario: Dots and underscores preserved

- **WHEN** sanitizing `"my_skill.v2"`
- **THEN** the result SHALL be `"my_skill.v2"`

#### Scenario: Leading dots stripped

- **WHEN** sanitizing `".hidden-skill"`
- **THEN** the result SHALL be `"hidden-skill"`

#### Scenario: Empty result falls back

- **WHEN** sanitizing `"..."`
- **THEN** the result SHALL be `"unnamed-skill"` (all characters stripped)

#### Scenario: Long name truncated

- **WHEN** sanitizing a name longer than 255 characters
- **THEN** the result SHALL be truncated to 255 characters
