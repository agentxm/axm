## MODIFIED Requirements

### Requirement: Command manifest schema

The command manifest (`command.json`) SHALL carry registry-facing identity, version, and metadata only.

The manifest SHALL NOT carry `agents` or `agentOverrides`. Render targeting is owned by `settings.json` (`settings.agents`). Per-agent frontmatter overrides are owned by the command content file (`${name}.md`) frontmatter.

The manifest MAY contain derived copies of `${name}.md` frontmatter fields (`description`, `model`, etc.) for registry search and filtering, but these SHALL be synced FROM the content file during `publish` — never edited directly in the manifest.

#### Scenario: Manifest agentOverrides field rejected at publish

- **WHEN** `command.json` contains an `agentOverrides` field
- **AND** `axm commands publish` is run
- **THEN** publish SHALL fail with a validation error indicating that `agentOverrides` is no longer a manifest field
- **AND** the error message SHALL direct authors to move `agentOverrides` to the command content file frontmatter

### Requirement: Command content file

The command prompt body and behavioral configuration SHALL reside in a `${name}.md` file. The content file SHALL use YAML frontmatter for all authoring/behavioral fields, with the prompt body as the markdown content below the frontmatter.

The single recognized convention key is `agentOverrides`, which is consumed by the renderer and SHALL NOT be emitted into the rendered file. This convention matches subagent content frontmatter.

#### Scenario: Content file with agent-specific overrides

- **WHEN** `${name}.md` frontmatter contains `agentOverrides: { "codex": { "model": "o3" } }`
- **THEN** AXM SHALL apply the matching entry as an RFC 7396 JSON Merge Patch on top of the rendered fields for Codex
- **AND** `agentOverrides` itself SHALL NOT appear in the rendered file

#### Scenario: AgentOverrides-only frontmatter for plain-text renderer

- **WHEN** `${name}.md` frontmatter contains only `agentOverrides`
- **AND** the command is rendered for an agent that does not render frontmatter
- **THEN** AXM SHALL NOT emit a lossy-rendering warning for omitted frontmatter
