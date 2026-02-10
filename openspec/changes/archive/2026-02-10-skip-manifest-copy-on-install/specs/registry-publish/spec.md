## MODIFIED Requirements

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
