# registry-publish Specification

## Purpose

Publishes managed extensions to registries with validation, archiving, checksum computation, and idempotency.

## Requirements

### Requirement: Publish managed extension to registry

`skills publish` SHALL write a managed extension from `.axm/extensions/` to a target registry.

#### Scenario: Publish with explicit registry

- **WHEN** `skills publish @acme/code-review --registry local` is called
- **THEN** the extension is published to the registry source named `local`

#### Scenario: Publish with default registry

- **WHEN** `skills publish @acme/code-review` is called without `--registry`
- **THEN** the extension is published to the `default` named registry or the first configured registry source

#### Scenario: Bare name resolved with scope

- **WHEN** `skills publish code-review` is called and project scope is `@acme`
- **THEN** the extension `@acme/code-review` is published

### Requirement: Extension validation before publish

The system SHALL validate the managed extension before publishing.

#### Scenario: Valid manifest

- **WHEN** `.axm/extensions/@acme/skills/code-review/axm-skill.json` exists with required fields (`name`, `version`)
- **THEN** validation succeeds

#### Scenario: Missing manifest

- **WHEN** the extension directory does not contain `axm-skill.json`
- **THEN** publish fails with an error indicating the manifest is missing

#### Scenario: Only managed extensions publishable

- **WHEN** attempting to publish a skill from `.agents/skills/` (non-managed)
- **THEN** publish fails with an error explaining the skill must be forked first

### Requirement: Archive creation

The system SHALL create a zip archive of the extension's `src/` subdirectory with files at the root level. The archive SHALL NOT include `axm-skill.json`.

#### Scenario: Archive structure

- **WHEN** an extension with `axm-skill.json` at the root and `src/SKILL.md`, `src/helpers/` is archived
- **THEN** the zip contains `SKILL.md` and `helpers/` at the root (no enclosing directory, no `axm-skill.json`)

### Requirement: Checksum computation

The system SHALL compute a SHA-256 checksum of the archive bytes.

#### Scenario: Checksum format

- **WHEN** a checksum is computed for an archive
- **THEN** it is formatted as `sha256:<lowercase-hex-digits>`

### Requirement: Registry write

The system SHALL write the archive and update the index in the target registry.

#### Scenario: Write archive file

- **WHEN** publishing version `1.0.0` of `@acme/code-review`
- **THEN** `1.0.0.zip` is written to `<registry>/extensions/@acme/skills/code-review/`

#### Scenario: Create new index

- **WHEN** publishing to a registry where no `index.json` exists for the extension
- **THEN** a new `index.json` is created with the extension metadata and the version entry

#### Scenario: Update existing index

- **WHEN** publishing to a registry where `index.json` already exists
- **THEN** the new version entry is prepended to the `versions` array

### Requirement: Publish idempotency

The system SHALL handle republishing the same version gracefully.

#### Scenario: Same version and checksum

- **WHEN** publishing version `1.0.0` and `1.0.0.zip` already exists with the same checksum
- **THEN** the operation is a no-op (no error)

#### Scenario: Same version, different checksum

- **WHEN** publishing version `1.0.0` and `1.0.0.zip` already exists with a different checksum
- **THEN** the operation fails with an error (no overwrites without `--force`)

### Requirement: Registry guard precondition

`skills publish` SHALL call the registry guard before publishing.

#### Scenario: No registry configured

- **WHEN** `skills publish` is called and no registry sources exist
- **THEN** the registry guard is invoked (prompt in interactive mode, error in non-interactive)
