## MODIFIED Requirements

### Requirement: Subagent manifest schema

The subagent manifest (`subagent.json`) SHALL extend `CommonManifestFields` and SHALL NOT carry portable behavior fields (`model`, `toolAccess`, `background`) or targeting fields (`agents`). Behavior is expressed in the content file's frontmatter and passes through to agent-native files verbatim. Render targeting is owned by `settings.json` (`settings.agents`); the manifest does not declare which agents the subagent is rendered to.

The manifest's `description` (inherited from `CommonManifestFields`) is registry-facing only and has no relationship to anything in the frontmatter.

#### Scenario: Valid manifest with minimal fields

- **WHEN** `subagent.json` contains only `CommonManifestFields` with `type: "subagent"`
- **THEN** manifest validation SHALL succeed

#### Scenario: Manifest description independent of frontmatter description

- **WHEN** `subagent.json` `description` is `"Registry summary"`
- **AND** `<name>.md` frontmatter `description` is `"In-content description"`
- **THEN** both SHALL be accepted and SHALL NOT be reconciled by AXM
- **AND** the manifest description SHALL be the value used by the registry; the frontmatter description SHALL flow through to rendered agent-native files

#### Scenario: Manifest with agents field rejected at publish

- **WHEN** `subagent.json` contains an `agents` field
- **AND** `axm subagents publish` is run
- **THEN** publish SHALL fail with a validation error indicating that `agents` is no longer a manifest field
- **AND** the error message SHALL direct authors to express targeting in `settings.agents`
