## ADDED Requirements

### Requirement: Structured per-agent installation result

The `InstallResult` type SHALL capture the outcome of installing a skill for a single agent, including success/failure state and symlink fallback information.

#### Scenario: Successful symlink installation

- **WHEN** a skill is installed via symlink for an agent
- **THEN** the result SHALL have `success: true`, `mode: "symlink"`, `symlinkFailed: false`, and `error: Option.none()`

#### Scenario: Successful copy fallback

- **WHEN** symlink creation fails and copy fallback succeeds
- **THEN** the result SHALL have `success: true`, `mode: "copy"`, `symlinkFailed: true`, and `error: Option.none()`

#### Scenario: Failed installation

- **WHEN** installation fails for an agent (e.g., path safety violation, copy failure)
- **THEN** the result SHALL have `success: false` and `error: Option.some(message)`

#### Scenario: Path fields present

- **WHEN** constructing an `InstallResult`
- **THEN** it SHALL include `path` (agent-specific path) and `canonicalPath` (canonical location)
