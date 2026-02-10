## ADDED Requirements

### Requirement: Path traversal prevention

The `isPathSafe` function SHALL validate that a resolved target path stays within a base directory, preventing path traversal attacks.

#### Scenario: Target within base

- **WHEN** calling `isPathSafe(base, target)` where `target` resolves to a path under `base`
- **THEN** the result SHALL be `true`

#### Scenario: Target equals base

- **WHEN** calling `isPathSafe(base, target)` where `target` resolves to the same path as `base`
- **THEN** the result SHALL be `true`

#### Scenario: Target escapes base via parent traversal

- **WHEN** calling `isPathSafe("/a/b", "/a/b/../../etc/passwd")`
- **THEN** the result SHALL be `false`

#### Scenario: Target is sibling of base

- **WHEN** calling `isPathSafe("/a/b", "/a/c")`
- **THEN** the result SHALL be `false`

#### Scenario: Paths are normalized before comparison

- **WHEN** calling `isPathSafe` with paths containing `.` or `..` segments
- **THEN** both paths SHALL be resolved to absolute normalized form before comparison

#### Scenario: Prefix false positive prevented

- **WHEN** calling `isPathSafe("/a/base", "/a/base-extended/file")`
- **THEN** the result SHALL be `false`
- **AND** the check SHALL use a path separator boundary, not simple string prefix matching
