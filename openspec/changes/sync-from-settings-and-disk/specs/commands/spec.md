## MODIFIED Requirements

### Requirement: Command manifest schema

The command manifest (`command.json`) SHALL carry registry-facing identity, version, and metadata only.

The manifest SHALL NOT carry an `agents` field. Render targeting is owned by `settings.json` (`settings.agents`).
The manifest SHALL NOT carry `agentOverrides`; per-agent frontmatter overrides live in the command content file.

The manifest MAY contain derived copies of `${name}.md` frontmatter fields (`description`, `model`, etc.) for registry search and filtering, but these SHALL be synced FROM the content file during `publish` — never edited directly in the manifest.

#### Scenario: Manifest agentOverrides field rejected at publish

- **WHEN** `command.json` contains an `agentOverrides` field
- **AND** `axm commands publish` is run
- **THEN** publish SHALL fail with a validation error indicating that `agentOverrides` is no longer a manifest field
- **AND** the error message SHALL direct authors to move `agentOverrides` to the command content file frontmatter

#### Scenario: Valid manifest with minimal fields

- **WHEN** `command.json` contains only `CommonManifestFields` with `type: "command"` and no command-specific fields
- **THEN** manifest validation SHALL succeed with defaults applied

#### Scenario: Manifest agents field rejected at publish

- **WHEN** `command.json` contains an `agents` field
- **AND** `axm commands publish` is run
- **THEN** publish SHALL fail with a validation error indicating that `agents` is no longer a manifest field
- **AND** the error message SHALL direct authors to express targeting in `settings.agents`

#### Scenario: Rendering targets all agents in settings

- **WHEN** `command.json` is published without an `agents` field
- **AND** the workspace has `settings.agents: ["claude-code", "cursor", "gemini-cli"]` configured
- **THEN** the command SHALL be rendered to Claude Code, Cursor, and Gemini CLI
