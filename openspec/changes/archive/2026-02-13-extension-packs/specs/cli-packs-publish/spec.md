## ADDED Requirements

### Requirement: Publish pack to registry

`axm packs publish <pack>` SHALL publish a pack to a registry following the same flow as skill publishing.

#### Scenario: Publish pack to default registry

- **WHEN** user runs `axm packs publish @acme/frontend-tools`
- **THEN** the pack directory is validated (must contain `axm-pack.json`)
- **AND** all files in the pack directory are zipped into an archive (manifest + any accompanying files)
- **AND** a SHA-256 checksum is computed
- **AND** the archive is written to `<registry>/extensions/@acme/packs/frontend-tools/<version>.zip`
- **AND** `index.json` is created or updated with the version entry

#### Scenario: Publish to named registry

- **WHEN** user runs `axm packs publish frontend-tools --registry local`
- **THEN** the pack is published to the registry source named `local`

#### Scenario: Missing manifest

- **WHEN** user runs `axm packs publish @acme/frontend-tools`
- **AND** `axm-pack.json` does not exist in the pack directory
- **THEN** the command fails with an `AppError`

#### Scenario: Idempotent publish

- **WHEN** the same version with the same checksum is published again
- **THEN** the operation is a no-op

#### Scenario: Version conflict

- **WHEN** the same version with a different checksum is published
- **AND** `--force` is not provided
- **THEN** the command fails with an `AppError` indicating the version already exists with a different checksum

### Requirement: Archive includes all pack files

The publish archive SHALL include all files in the pack directory (not just the manifest). Files SHALL be at the root of the archive (no enclosing directory).

#### Scenario: Archive with README

- **WHEN** the pack directory contains `axm-pack.json` and `README.md`
- **THEN** the archive contains both files at the root level

### Requirement: Publish plan display and confirmation

#### Scenario: Preview mode

- **WHEN** user runs `axm packs publish @acme/frontend-tools --preview`
- **THEN** the plan is displayed but NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs publish @acme/frontend-tools --yes`
- **THEN** the plan is applied without prompting
