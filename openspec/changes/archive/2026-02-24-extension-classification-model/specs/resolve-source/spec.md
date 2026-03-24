## MODIFIED Requirements

### Requirement: Name resolution through lockfile and configured skills

Bare name resolution (`my-skill`) SHALL follow a two-tier approach:

1. **Lockfile lookup**: Find the skill by name in lockfile installed rows and resolve to `LocalSource` for the installed directory.
2. **Configured lookup**: If not found in lockfile installed rows, read configured skill entries from settings and recursively resolve the configured source string.

Configured entries used in this step SHALL expose concrete `source: string` semantics.

#### Scenario: Bare name found in lockfile installed rows

- **WHEN** `resolveSource("my-skill")` is called
- **AND** lockfile contains installed entry `my-skill`
- **THEN** the result SHALL be a `LocalSource` pointing to the installed directory

#### Scenario: Bare name found in configured entries

- **WHEN** `resolveSource("my-skill")` is called
- **AND** lockfile has no entry for `my-skill`
- **AND** settings has configured entry `my-skill` with concrete source string
- **THEN** `resolveSource` SHALL recursively resolve that source string

#### Scenario: Name missing from lockfile and configured entries

- **WHEN** `resolveSource("my-skill")` is called
- **AND** lockfile has no entry
- **AND** settings has no configured entry
- **THEN** `resolveSource` SHALL fail with an `AppError` indicating source resolution failed
