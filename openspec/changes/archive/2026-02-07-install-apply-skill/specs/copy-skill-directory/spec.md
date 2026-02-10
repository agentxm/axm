## ADDED Requirements

### Requirement: Recursive skill directory copy with exclusions

The `copySkillDirectory` function SHALL recursively copy a skill's source directory to a destination, applying skill-specific exclusion rules.

#### Scenario: Excluded files are not copied

- **WHEN** copying a skill directory
- **THEN** the following entries SHALL be excluded: `README.md`, `metadata.json`, entries starting with `_`, and `.git` directories

#### Scenario: Symlinks are dereferenced

- **WHEN** copying a skill directory containing symlinks
- **THEN** the copy SHALL dereference symlinks (copy file content, not the symlink itself)

#### Scenario: Nested directories are copied recursively

- **WHEN** the source directory contains nested subdirectories
- **THEN** all non-excluded subdirectories and their contents SHALL be copied recursively

#### Scenario: Directory entries are copied concurrently

- **WHEN** copying entries within a directory
- **THEN** entries SHALL be copied concurrently using Effect concurrency

#### Scenario: Destination directory is created

- **WHEN** the destination directory does not exist
- **THEN** the function SHALL create it (including parent directories)

#### Scenario: Non-excluded files are copied

- **WHEN** the source contains regular files not matching exclusion rules (e.g., `SKILL.md`, `prompt.md`, `lib/helper.ts`)
- **THEN** those files SHALL be copied to the destination
