## MODIFIED Requirements

### Requirement: Command manifest schema

The command manifest (`command.json`) SHALL extend `CommonManifestFields` with command-specific packaging and distribution fields:

- `agentOverrides`: optional record keyed by agent ID, where each value is a record of agent-specific field overrides

The manifest SHALL NOT carry an `agents` field. Render targeting is owned by `settings.json` (`settings.agents`).

The manifest MAY contain derived copies of COMMAND.md frontmatter fields (`description`, `model`, etc.) for registry search and filtering, but these SHALL be synced FROM the content file during `publish` — never edited directly in the manifest.

#### Scenario: Valid manifest with agent overrides

- **WHEN** `command.json` contains `agentOverrides: { "claude-code": { "hooks": { "prerun": ["echo hi"] } } }`
- **THEN** manifest validation SHALL succeed (structural validation only)
- **AND** semantic validation of `agentOverrides` SHALL be deferred to each agent's renderer

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
