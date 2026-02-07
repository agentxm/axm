## ADDED Requirements

### Requirement: Resolve parent directory through symlinks

The `resolveParentSymlinks` function SHALL resolve the parent directory of a path through symlinks while preserving the final path component. This is needed for computing correct relative symlink paths when parent directories may themselves be symlinks.

#### Scenario: Parent is a symlink

- **WHEN** calling `resolveParentSymlinks("/a/symlink-dir/file")` where `/a/symlink-dir` is a symlink to `/b/real-dir`
- **THEN** the result SHALL be `/b/real-dir/file`

#### Scenario: Parent is not a symlink

- **WHEN** calling `resolveParentSymlinks("/a/real-dir/file")` where `/a/real-dir` is a real directory
- **THEN** the result SHALL be the same path with the parent resolved (e.g., `/a/real-dir/file`)

#### Scenario: Final component preserved

- **WHEN** calling `resolveParentSymlinks` on any path
- **THEN** only the parent directory SHALL be resolved through symlinks
- **AND** the final path component (basename) SHALL be preserved as-is, even if it is itself a symlink

#### Scenario: Deeply nested symlinks

- **WHEN** the parent directory chain contains multiple symlinks
- **THEN** all symlinks in the parent chain SHALL be fully resolved
