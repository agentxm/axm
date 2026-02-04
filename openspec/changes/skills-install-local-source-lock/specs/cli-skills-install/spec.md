## ADDED Requirements

### Requirement: Local Source Recording

The CLI SHALL record the actual local path when installing skills from a local source.

#### Scenario: Local source in settings

- **WHEN** installing a skill from a local path using `--skill`
- **THEN** the settings file records the source as the absolute path (e.g., `/path/to/skills`) instead of `"*"`

#### Scenario: Local source in lockfile

- **WHEN** installing a skill from a local path using `--skill`
- **THEN** the lockfile records `source: "local"` with a `path` field containing the absolute path

#### Scenario: Consistent with remote sources

- **WHEN** installing a skill from a local path
- **THEN** the source is recorded using the same applyDiff() pattern used for remote sources
