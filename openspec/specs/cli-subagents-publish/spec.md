## ADDED Requirements

### Requirement: Publish subagent to registry

`axm subagents publish` SHALL validate both `subagent.json` and `src/<name>.md`, sync the manifest from frontmatter, and upload both files to the target registry.

Publish SHALL require `subagent.json` `name`, `<name>.md` frontmatter `name`, and the content file basename to match exactly. Publish SHALL NOT auto-sync `name`.

#### Scenario: Successful publish

- **WHEN** user runs `axm subagents publish @acme/subagents/code-reviewer`
- **AND** both manifest and <name>.md are valid
- **THEN** the CLI SHALL sync `description`, `model`, `toolAccess`, and `background` from frontmatter to manifest
- **AND** SHALL upload both files to the registry

#### Scenario: Missing <name>.md fails

- **WHEN** user runs `axm subagents publish @acme/subagents/code-reviewer`
- **AND** `src/<name>.md` does not exist
- **THEN** the CLI SHALL fail with an error indicating the content file is missing

#### Scenario: Identity mismatch fails

- **WHEN** user runs `axm subagents publish @acme/subagents/code-reviewer`
- **AND** `subagent.json` has `name: "code-reviewer"`
- **AND** the content file is not `src/code-reviewer.md` or its frontmatter `name` is different
- **THEN** the CLI SHALL fail with an actionable identity mismatch error

### Requirement: Manifest validation

Publish SHALL validate manifest completeness including required fields and version bump from the last published version.

#### Scenario: Version not bumped

- **WHEN** user runs `axm subagents publish @acme/subagents/code-reviewer`
- **AND** the registry already has version `1.0.0` published
- **AND** the local manifest has `version: "1.0.0"`
- **THEN** the CLI SHALL fail with an error indicating a version bump is required

#### Scenario: Missing required fields

- **WHEN** the manifest is missing `name` or `owner`
- **THEN** the CLI SHALL fail with validation errors listing the missing fields

### Requirement: Frontmatter sync before upload

Publish SHALL sync `description`, `model`, `toolAccess`, and `background` from <name>.md frontmatter to the manifest before uploading.

#### Scenario: Drifted description synced

- **WHEN** <name>.md frontmatter has `description: "Updated"` and manifest has `description: "Old"`
- **AND** user runs `axm subagents publish`
- **THEN** the manifest SHALL be updated to `description: "Updated"` before upload

### Requirement: Glob pattern support

`axm subagents publish` SHALL accept glob patterns to batch-publish multiple subagents.

#### Scenario: Glob publishes multiple

- **WHEN** user runs `axm subagents publish "code-*"`
- **AND** `code-reviewer` and `code-formatter` match the pattern
- **THEN** both subagents SHALL be published

### Requirement: Registry targeting

`--registry` SHALL specify the target registry. Default SHALL be the configured default registry.

#### Scenario: Local registry

- **WHEN** user runs `axm subagents publish code-reviewer --registry local`
- **THEN** the subagent SHALL be published to the local registry

### Requirement: Preview flag

`--preview` SHALL show what would be published without uploading.

#### Scenario: Preview shows publish plan

- **WHEN** user runs `axm subagents publish code-reviewer --preview`
- **THEN** the CLI SHALL display the files and metadata that would be published
- **AND** nothing SHALL be uploaded

### Requirement: Force flag

`--force` SHALL publish even when validation warnings are present.

#### Scenario: Force ignores warnings

- **WHEN** user runs `axm subagents publish code-reviewer --force`
- **AND** validation produces non-fatal warnings
- **THEN** the publish SHALL proceed

### Requirement: Confirmation and --yes flag

In interactive mode, publish SHALL prompt for confirmation after showing the plan. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents publish code-reviewer --yes`
- **THEN** the CLI SHALL publish without confirmation
