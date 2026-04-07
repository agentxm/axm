## ADDED Requirements

### Requirement: Subagent manifest schema

The subagent manifest (`subagent.json`) SHALL extend `CommonManifestFields` with subagent-specific fields:

- `model`: optional string enum (`"fast"` | `"default"` | `"powerful"` | `"inherit"`) or concrete model ID string, default `"default"`. Agents map abstract tiers to native model values; concrete IDs pass through verbatim.
- `toolAccess`: optional string enum (`"full"` | `"readonly"` | `"none"`), default `"full"`. Controls the portable tool access level rendered into each agent's native format.
- `background`: optional boolean, default `false`. Whether the subagent runs in background/async mode (only rendered for agents that support it).
- `agents`: optional array of agent ID strings. When present, restricts rendering to only the listed agents. When absent, the subagent is rendered for all configured agents.

#### Scenario: Valid manifest with all subagent-specific fields

- **WHEN** `subagent.json` contains `model: "powerful"`, `toolAccess: "readonly"`, `background: true`, `agents: ["claude-code", "cursor"]`
- **THEN** manifest validation SHALL succeed

#### Scenario: Valid manifest with minimal fields

- **WHEN** `subagent.json` contains only `CommonManifestFields` with `type: "subagent"` and no subagent-specific fields
- **THEN** manifest validation SHALL succeed with defaults applied (`model: "default"`, `toolAccess: "full"`, `background: false`)

#### Scenario: Concrete model ID accepted

- **WHEN** `subagent.json` contains `model: "claude-opus-4-6"`
- **THEN** manifest validation SHALL succeed
- **AND** the model value SHALL pass through verbatim to agent adapters

#### Scenario: Invalid toolAccess rejected

- **WHEN** `subagent.json` contains `toolAccess: "limited"`
- **THEN** manifest validation SHALL fail with an error indicating the valid values

### Requirement: Subagent content file (SUBAGENT.md)

The subagent content file SHALL be named `SUBAGENT.md` and reside in `src/` within the extension directory. It SHALL use YAML frontmatter for portable metadata and a Markdown body for the system prompt / instructions.

SUBAGENT.md frontmatter SHALL support these fields:

- `name`: required string
- `description`: required string (used for auto-delegation hints)
- `model`: optional, same values as manifest `model`
- `toolAccess`: optional, same values as manifest `toolAccess`
- `background`: optional boolean
- `overrides`: optional record keyed by agent ID, where each value is a record of agent-native field overrides

#### Scenario: SUBAGENT.md with frontmatter and body

- **WHEN** a subagent package contains `subagent.json` and `src/SUBAGENT.md`
- **AND** `SUBAGENT.md` has YAML frontmatter with `name`, `description`, and a Markdown body
- **THEN** the frontmatter SHALL be parsed for portable metadata
- **AND** the Markdown body SHALL be used as the subagent's instructions/system prompt

#### Scenario: Missing SUBAGENT.md

- **WHEN** a subagent package contains `subagent.json` but no `src/SUBAGENT.md`
- **THEN** materialization SHALL fail with an error indicating the content file is missing

#### Scenario: SUBAGENT.md with agent-specific overrides

- **WHEN** `SUBAGENT.md` frontmatter contains `overrides: { "claude-code": { "permissionMode": "acceptEdits" }, "codex": { "sandbox_mode": "workspace-write" } }`
- **THEN** frontmatter parsing SHALL succeed
- **AND** overrides SHALL be preserved for use during agent-specific rendering

### Requirement: Frontmatter-to-manifest sync

SUBAGENT.md frontmatter SHALL be the source of truth for `description`, `model`, `toolAccess`, and `background`. The manifest SHALL contain synced copies of these fields for registry search and filtering.

Sync SHALL occur at these points:

- `axm subagents new` scaffolds both files in sync
- `axm sync` overwrites manifest values with frontmatter values
- `axm subagents publish` syncs before upload

Between sync points, local edits to SUBAGENT.md frontmatter may drift from the manifest. This is expected during development.

#### Scenario: Sync overwrites manifest from frontmatter

- **WHEN** `SUBAGENT.md` frontmatter has `description: "Updated description"`
- **AND** `subagent.json` has `description: "Old description"`
- **AND** `axm sync` is run
- **THEN** `subagent.json` SHALL be updated to `description: "Updated description"`

#### Scenario: Publish syncs before upload

- **WHEN** `SUBAGENT.md` frontmatter has `model: "fast"`
- **AND** `subagent.json` has `model: "default"`
- **AND** `axm subagents publish` is run
- **THEN** the manifest SHALL be synced to `model: "fast"` before the upload occurs

### Requirement: Per-format-family rendering

AXM SHALL render subagents into agent-native formats using format-family renderers. Each renderer SHALL be a pure function that accepts the manifest, SUBAGENT.md content (frontmatter + body), and agent-specific configuration, and returns a rendered subagent file.

The format families SHALL be:

| Family                | Renderer                        | Agents                                                                                  |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| MD + YAML frontmatter | `renderMarkdownWithFrontmatter` | Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE |
| TOML                  | `renderToml`                    | Codex                                                                                   |
| JSON                  | `renderJson`                    | Kiro CLI                                                                                |
| YAML/JSON modes       | `renderRooMode`                 | Roo Code                                                                                |

#### Scenario: Markdown with frontmatter rendering for Claude Code

- **WHEN** rendering a subagent for Claude Code
- **THEN** the renderer SHALL produce a `.md` file with YAML frontmatter containing `name`, `description`, and supported fields (`tools`/`disallowedTools`, `model`, `background`)
- **AND** the Markdown body from SUBAGENT.md SHALL follow the frontmatter

#### Scenario: TOML rendering for Codex

- **WHEN** rendering a subagent for Codex
- **THEN** the renderer SHALL produce a `.toml` file
- **AND** the Markdown body SHALL map to the `developer_instructions` TOML string field
- **AND** `model`, `description`, and `sandbox_mode` SHALL be set from portable fields

#### Scenario: JSON rendering for Kiro CLI

- **WHEN** rendering a subagent for Kiro CLI
- **THEN** the renderer SHALL produce a `.json` file with `name`, `description`, `prompt` (from body), and `model`

#### Scenario: Roo Code mode rendering

- **WHEN** rendering a subagent for Roo Code
- **THEN** the renderer SHALL merge a mode entry into `.roomodes`
- **AND** the body's first paragraph SHALL become `roleDefinition`
- **AND** the remainder SHALL become `customInstructions`
- **AND** the mode entry SHALL include `"_axm_managed": "axm subagents --help"`

#### Scenario: Roo Code body split with single paragraph

- **WHEN** rendering a subagent for Roo Code
- **AND** the SUBAGENT.md body contains only a single paragraph (no blank line)
- **THEN** the entire body SHALL become `roleDefinition`
- **AND** `customInstructions` SHALL be empty or omitted

#### Scenario: Codex TOML multiline instructions

- **WHEN** rendering a subagent for Codex
- **AND** the SUBAGENT.md body contains multiple lines and Markdown formatting
- **THEN** the `developer_instructions` TOML field SHALL use a multiline literal string (triple-quoted `"""..."""`)
- **AND** the Markdown content SHALL be preserved verbatim (no escaping of `#`, `*`, etc.)

#### Scenario: Managed marker survives formatter reformatting

- **WHEN** a rendered Markdown file is reformatted by Prettier or an editor
- **THEN** the HTML comment `<!-- Managed by axm — see "axm subagents --help" -->` SHALL remain on the first line
- **AND** sync SHALL still recognize the file as AXM-managed

#### Scenario: Override and portable field set same native field

- **WHEN** a subagent has `toolAccess: "readonly"` (portable)
- **AND** `overrides: { "claude-code": { "disallowedTools": "Write" } }` (agent-native)
- **AND** rendering for Claude Code
- **THEN** the override value SHALL take precedence — rendered frontmatter SHALL contain `disallowedTools: Write` (not the portable mapping of `Edit,Write,Bash`)

#### Scenario: Partial render failure keeps successful renders

- **WHEN** rendering a subagent for agents `["claude-code", "codex", "cursor"]`
- **AND** Codex rendering fails (e.g., TOML serialization error)
- **THEN** Claude Code and Cursor rendered files SHALL be written successfully
- **AND** the error for Codex SHALL be reported
- **AND** the lockfile `renderedFiles` SHALL include entries for Claude Code and Cursor but NOT Codex

### Requirement: Model tier mapping

Each agent adapter SHALL map portable model tiers to agent-native values:

| Portable     | Claude Code | Copilot    | Codex      | Cursor        | Gemini CLI  | OpenCode/Kilo | Augment    | Junie    | Kiro       | Roo |
| ------------ | ----------- | ---------- | ---------- | ------------- | ----------- | ------------- | ---------- | -------- | ---------- | --- |
| `"fast"`     | `haiku`     | (fast)     | (fast)     | `"fast"`      | (flash)     | (fast)        | (fast)     | (fast)   | (fast)     | --  |
| `"default"`  | `inherit`   | (omit)     | (omit)     | `"inherit"`   | `"inherit"` | (omit)        | (omit)     | (omit)   | (omit)     | --  |
| `"powerful"` | `opus`      | (powerful) | (powerful) | (specific ID) | (pro)       | (powerful)    | (powerful) | `"opus"` | (powerful) | --  |
| `"inherit"`  | `inherit`   | (omit)     | (omit)     | `"inherit"`   | `"inherit"` | (omit)        | (omit)     | (omit)   | (omit)     | --  |

Parenthesized values indicate the adapter selects an appropriate model. Concrete model IDs pass through verbatim. Roo modes have no model field.

#### Scenario: Abstract tier mapped for Claude Code

- **WHEN** a subagent has `model: "powerful"`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL contain `model: opus`

#### Scenario: Concrete model ID passes through

- **WHEN** a subagent has `model: "claude-opus-4-6"`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL contain `model: claude-opus-4-6`

#### Scenario: Roo Code omits model

- **WHEN** a subagent has any `model` value
- **AND** rendering for Roo Code
- **THEN** the rendered mode entry SHALL NOT contain a model field

### Requirement: Tool access mapping

Each agent adapter SHALL map portable `toolAccess` values to agent-native tool control fields:

| Portable     | Claude Code                        | Copilot             | Codex                       | Cursor           | Gemini CLI       | OpenCode/Kilo                           | Augment                 | Junie                                | Kiro IDE     | Kiro CLI                     | Roo Code                  |
| ------------ | ---------------------------------- | ------------------- | --------------------------- | ---------------- | ---------------- | --------------------------------------- | ----------------------- | ------------------------------------ | ------------ | ---------------------------- | ------------------------- |
| `"full"`     | (omit)                             | `["*"]`             | (omit)                      | (omit)           | (omit)           | (omit)                                  | (omit)                  | (omit)                               | (omit)       | (omit)                       | `[read,edit,command,mcp]` |
| `"readonly"` | `disallowedTools: Edit,Write,Bash` | `["read","search"]` | `sandbox_mode: "read-only"` | `readonly: true` | (read tool list) | `{edit:"deny",bash:"deny"}`             | `disabled_tools: [...]` | `disallowedTools: [Write,Edit,Bash]` | `[read,web]` | `["read","web","knowledge"]` | `[read,mcp]`              |
| `"none"`     | `tools: ""`                        | `[]`                | `sandbox_mode: "read-only"` | `readonly: true` | `[]`             | `{edit:"deny",bash:"deny",task:"deny"}` | `tools: []`             | `tools: []`                          | `[]`         | `[]`                         | `[read]`                  |

#### Scenario: Full tool access for Claude Code

- **WHEN** a subagent has `toolAccess: "full"`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL NOT include `tools` or `disallowedTools` fields

#### Scenario: Readonly tool access for Codex

- **WHEN** a subagent has `toolAccess: "readonly"`
- **AND** rendering for Codex
- **THEN** the rendered TOML SHALL contain `sandbox_mode = "read-only"`

#### Scenario: Lossy mapping documented

- **WHEN** a subagent has `toolAccess: "none"`
- **AND** rendering for Codex
- **THEN** the rendered TOML SHALL contain `sandbox_mode = "read-only"` (same as readonly, since Codex has no "no tools" level)

### Requirement: Agent-specific overrides

When SUBAGENT.md frontmatter contains an `overrides` map, the agent adapter SHALL merge override values on top of portable fields during rendering. Overrides use agent-native field names and require no translation.

#### Scenario: Claude Code override merged

- **WHEN** SUBAGENT.md frontmatter contains `overrides: { "claude-code": { "permissionMode": "acceptEdits", "effort": "high" } }`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL include `permissionMode: acceptEdits` and `effort: high` in addition to portable fields

#### Scenario: Override for non-configured agent ignored

- **WHEN** SUBAGENT.md frontmatter contains `overrides: { "codex": { "sandbox_mode": "workspace-write" } }`
- **AND** Codex is NOT a configured agent
- **THEN** the Codex override SHALL be ignored during rendering

#### Scenario: Override takes precedence over portable mapping

- **WHEN** a subagent has `toolAccess: "readonly"` (portable)
- **AND** SUBAGENT.md frontmatter contains `overrides: { "codex": { "sandbox_mode": "workspace-write" } }`
- **AND** rendering for Codex
- **THEN** the rendered TOML SHALL contain `sandbox_mode = "workspace-write"` (override wins)

### Requirement: Managed-file header

Each rendered subagent file SHALL start with a static managed-by header appropriate to its format. The header identifies AXM ownership and points to the relevant CLI help for discoverability.

| Format                  | Header                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| Markdown (all variants) | `<!-- Managed by axm — see "axm subagents --help" -->`              |
| TOML                    | `# Managed by axm — see "axm subagents --help"`                     |
| JSON (Kiro CLI)         | `"_axm_managed": "axm subagents --help"` metadata field             |
| Roo `.roomodes`         | `"_axm_managed": "axm subagents --help"` on each managed mode entry |

#### Scenario: Markdown rendered file includes managed header

- **WHEN** a subagent is rendered for Claude Code
- **THEN** the first line of the rendered file SHALL be `<!-- Managed by axm — see "axm subagents --help" -->`

#### Scenario: TOML rendered file includes managed header

- **WHEN** a subagent is rendered for Codex
- **THEN** the first line of the rendered file SHALL be `# Managed by axm — see "axm subagents --help"`

#### Scenario: JSON managed marker

- **WHEN** a subagent is rendered for Kiro CLI
- **THEN** the rendered JSON SHALL contain `"_axm_managed": "axm subagents --help"`

### Requirement: Kiro dual-format rendering

Kiro SHALL produce two rendered files per subagent: a `.md` file for the IDE and a `.json` file for the CLI. Both SHALL be tracked in the lockfile `renderedFiles` map under the `kiro` key.

#### Scenario: Both Kiro formats rendered

- **WHEN** a subagent is rendered for Kiro
- **THEN** the adapter SHALL produce `.kiro/agents/<name>.md` (IDE format)
- **AND** `.kiro/agents/<name>.json` (CLI format)

#### Scenario: Both Kiro files tracked in lockfile

- **WHEN** a subagent is installed with Kiro configured
- **THEN** the lockfile `renderedFiles` for `kiro` SHALL contain entries for both the `.md` and `.json` files

### Requirement: Roo Code read-modify-write

When rendering for Roo Code, the adapter SHALL use read-modify-write on `.roomodes` (project scope) or `settings/custom_modes.yaml` (user scope), preserving manually-defined modes. Each AXM-managed mode entry SHALL include `"_axm_managed": "axm subagents --help"` to distinguish it from manual entries.

#### Scenario: Existing manual modes preserved

- **WHEN** `.roomodes` contains a manually-defined mode `"architect"`
- **AND** a subagent `code-reviewer` is rendered for Roo Code
- **THEN** `.roomodes` SHALL contain both the `architect` mode (unchanged) and the `code-reviewer` mode (with `"_axm_managed": "axm subagents --help"`)

#### Scenario: Managed mode updated on re-render

- **WHEN** `.roomodes` contains an AXM-managed mode `code-reviewer` with `"_axm_managed": "axm subagents --help"`
- **AND** the subagent's instructions have changed
- **THEN** re-rendering SHALL update only the `code-reviewer` entry
- **AND** manual modes SHALL remain unchanged

#### Scenario: Managed mode removed on uninstall

- **WHEN** a subagent `code-reviewer` is uninstalled
- **AND** `.roomodes` contains the managed mode entry
- **THEN** the `code-reviewer` entry SHALL be removed from `.roomodes`
- **AND** manual modes SHALL remain unchanged

### Requirement: Agent adapter subagent methods

Each `CodingAgent` SHALL support subagent operations via three methods:

- `resolveEffectiveSubagentsDir(args)`: resolves the agent's subagents directory for the given scope
- `addSubagent(args)`: renders and writes a subagent file to the agent's subagents directory, returning a sync outcome with any lossy-rendering warnings
- `removeSubagent(args)`: deletes a rendered subagent file from the agent's subagents directory

#### Scenario: Add subagent to agent

- **WHEN** `addSubagent` is called with a manifest and SUBAGENT.md content
- **THEN** the agent adapter SHALL resolve the subagents directory, call the appropriate renderer, and write the rendered file
- **AND** SHALL return a sync outcome including any warnings

#### Scenario: Remove subagent from agent

- **WHEN** `removeSubagent` is called with a subagent name
- **THEN** the agent adapter SHALL delete the rendered file from the subagents directory

#### Scenario: Resolve subagents directory respects scope

- **WHEN** `resolveEffectiveSubagentsDir` is called with project scope for Claude Code
- **THEN** it SHALL return `.claude/agents/`
- **WHEN** called with user scope for Claude Code
- **THEN** it SHALL return `~/.claude/agents/`

### Requirement: Scope-aware rendering

Subagent rendering SHALL respect workspace scope. Project scope renders to project-relative agent directories. User scope renders to user-level agent directories.

| Agent       | Project Path        | User Path                    |
| ----------- | ------------------- | ---------------------------- |
| Claude Code | `.claude/agents/`   | `~/.claude/agents/`          |
| Copilot     | `.github/agents/`   | VS Code profile dir          |
| Codex       | `.codex/agents/`    | `~/.codex/agents/`           |
| Cursor      | `.cursor/agents/`   | `~/.cursor/agents/`          |
| Gemini CLI  | `.gemini/agents/`   | `~/.gemini/agents/`          |
| OpenCode    | `.opencode/agents/` | `~/.config/opencode/agents/` |
| Augment     | `.augment/agents/`  | `~/.augment/agents/`         |
| Junie       | `.junie/agents/`    | `~/.junie/agents/`           |
| Kilo Code   | `.kilo/agents/`     | `~/.config/kilo/agents/`     |
| Kiro        | `.kiro/agents/`     | `~/.kiro/agents/`            |
| Roo Code    | `.roomodes`         | `settings/custom_modes.yaml` |

#### Scenario: Project scope renders to project directory

- **WHEN** a subagent is rendered with project scope for Gemini CLI
- **THEN** the rendered file SHALL be placed in `.gemini/agents/`

#### Scenario: User scope renders to user directory

- **WHEN** a subagent is rendered with user scope for OpenCode
- **THEN** the rendered file SHALL be placed in `~/.config/opencode/agents/`

#### Scenario: Roo Code user scope targets global settings

- **WHEN** a subagent is rendered with user scope for Roo Code
- **THEN** the mode entry SHALL be merged into `settings/custom_modes.yaml` rather than `.roomodes`

### Requirement: Lockfile subagent entries

`SubagentLockEntry` SHALL include:

- An entry-level `sourceHash` — hash of SUBAGENT.md portable inputs (frontmatter + body). Used to decide whether re-rendering is needed. Entry-level because all agents share the same canonical source
- A `renderedFiles` map keyed by agent ID, where each value is an array of `{ path }` objects tracking rendered file locations

This is the same shared rendered-file tracking model used by `CommandLockEntry` and `SkillLockEntry` (copy mode), defined in the shared `RenderedFilesMapSchema`. No per-agent `contentHash` — drift detection uses the managed marker and source hash, not output hashing.

#### Scenario: Lock entry records source hash and rendered files

- **WHEN** a subagent is installed to a workspace with agents `["claude-code", "cursor"]`
- **THEN** the lockfile entry SHALL include `sourceHash: "sha256:..."` at the entry level
- **AND** SHALL include `renderedFiles: { "claude-code": [{ "path": ".claude/agents/<name>.md" }], "cursor": [{ "path": ".cursor/agents/<name>.md" }] }`

#### Scenario: Kiro lock entry has multiple rendered files

- **WHEN** a subagent is installed with Kiro configured
- **THEN** the lockfile `renderedFiles` for `kiro` SHALL be an array containing entries for both the `.md` and `.json` files: `[{ "path": ".kiro/agents/<name>.md" }, { "path": ".kiro/agents/<name>.json" }]`

#### Scenario: Source hash enables re-render skip

- **WHEN** `axm sync` computes the current SUBAGENT.md source hash
- **AND** the hash matches the lockfile's `sourceHash`
- **THEN** sync SHALL skip re-rendering for that subagent (optimization)

#### Scenario: Source hash mismatch triggers re-render

- **WHEN** `axm sync` computes the current SUBAGENT.md source hash
- **AND** the hash differs from the lockfile's `sourceHash`
- **THEN** sync SHALL re-render the subagent to all configured agents
- **AND** SHALL overwrite rendered files that have the managed marker (including manually edited ones)

### Requirement: Lossy rendering warnings

When a subagent uses portable fields that an agent renders with reduced fidelity (lossy mapping), the renderer SHALL return structured lossy-rendering warnings. Warnings SHALL be per-feature-per-agent and SHALL NOT prevent installation.

#### Scenario: toolAccess none identical to readonly for Codex

- **WHEN** a subagent specifies `toolAccess: "none"`
- **AND** rendering for Codex
- **THEN** the renderer SHALL produce `sandbox_mode = "read-only"` and return a warning that Codex does not distinguish `"none"` from `"readonly"`

#### Scenario: Background unsupported by most agents

- **WHEN** a subagent specifies `background: true`
- **AND** rendering for Gemini CLI (which does not support background mode)
- **THEN** the renderer SHALL omit the background field and return a warning

#### Scenario: Multiple warnings accumulated

- **WHEN** a subagent specifies `background: true` and `model: "powerful"`
- **AND** rendering for Roo Code (which supports neither)
- **THEN** the renderer SHALL return one warning per unsupported feature

### Requirement: Conflict detection at render paths

AXM-managed rendered files SHALL NOT silently overwrite manually-created agent files. Install and sync SHALL fail with an actionable error when a name collision is detected with an unmanaged file.

#### Scenario: Manual file blocks rendering

- **WHEN** `.claude/agents/code-reviewer.md` exists without the AXM managed header
- **AND** `axm subagents install` attempts to render `code-reviewer` for Claude Code
- **THEN** the install SHALL fail with: `Conflict: .claude/agents/code-reviewer.md already exists and is not managed by axm. Use --force to overwrite.`

#### Scenario: Force overrides conflict

- **WHEN** the same conflict exists
- **AND** `--force` is specified
- **THEN** the install SHALL overwrite the file with the rendered content including the managed header

#### Scenario: Managed file does not conflict

- **WHEN** `.claude/agents/code-reviewer.md` exists WITH the AXM managed header
- **AND** `axm subagents install` attempts to render `code-reviewer`
- **THEN** the install SHALL proceed (re-rendering the managed file)

### Requirement: Directory layout

A subagent extension SHALL follow this directory layout within `.axm/extensions/`:

```
.axm/extensions/<owner>/subagents/<name>/
  subagent.json          # Manifest
  src/
    SUBAGENT.md              # Instructions
```

#### Scenario: Standard layout resolved

- **WHEN** AXM resolves a subagent extension at `@acme/subagents/code-reviewer`
- **THEN** the manifest SHALL be at `.axm/extensions/@acme/subagents/code-reviewer/subagent.json`
- **AND** the content file SHALL be at `.axm/extensions/@acme/subagents/code-reviewer/src/SUBAGENT.md`

### Requirement: FQN segment

The subagent extension type SHALL use `"subagents"` as its `ExtensionTypePlural` segment in fully qualified names. `ExtensionTypeSchema` SHALL include `"subagent"` as a valid type.

#### Scenario: Subagent FQN format

- **WHEN** a subagent is published by `@acme` with name `code-reviewer`
- **THEN** its fully qualified name SHALL be `@acme/subagents/code-reviewer`

#### Scenario: FQN parsing recognizes subagents

- **WHEN** the FQN parser receives `@acme/subagents/code-reviewer`
- **THEN** it SHALL parse `owner: "@acme"`, `type: "subagent"`, `typePlural: "subagents"`, `name: "code-reviewer"`
