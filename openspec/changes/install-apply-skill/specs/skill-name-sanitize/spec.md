## ADDED Requirements

### Requirement: Filesystem-safe skill name sanitization

The `sanitizeName` function SHALL be a pure function that transforms an arbitrary skill name string into a deterministic, filesystem-safe directory name.

#### Scenario: Lowercase conversion

- **WHEN** sanitizing a name containing uppercase characters (e.g., `"MySkill"`)
- **THEN** the result SHALL be all lowercase (e.g., `"myskill"`)

#### Scenario: Non-alphanumeric replacement

- **WHEN** sanitizing a name containing characters not in `[a-z0-9._]`
- **THEN** each such character SHALL be replaced with a single hyphen

#### Scenario: Consecutive hyphens collapsed

- **WHEN** the replacement step produces consecutive hyphens (e.g., `"a--b"` or `"a @b"`)
- **THEN** consecutive hyphens SHALL be collapsed to a single hyphen

#### Scenario: Leading and trailing dots and hyphens stripped

- **WHEN** the result has leading or trailing dots or hyphens (e.g., `".skill-"`)
- **THEN** those characters SHALL be stripped

#### Scenario: Truncation to 255 characters

- **WHEN** the result exceeds 255 characters
- **THEN** the result SHALL be truncated to 255 characters

#### Scenario: Empty result falls back to unnamed-skill

- **WHEN** the input produces an empty string after all transformations (e.g., `"---"` or `""`)
- **THEN** the result SHALL be `"unnamed-skill"`

#### Scenario: Already-safe names are unchanged

- **WHEN** sanitizing a name that is already lowercase alphanumeric with dots or underscores (e.g., `"my.skill_v2"`)
- **THEN** the result SHALL be identical to the input

#### Scenario: Deterministic output

- **WHEN** sanitizing the same input twice
- **THEN** both calls SHALL return the same output
