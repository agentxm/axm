## ADDED Requirements

### Requirement: Subagent manifest schema

The subagent manifest (`subagent.json`) SHALL extend `CommonManifestFields` with a single subagent-specific field:

- `agents`: optional array of agent ID strings. When present, restricts rendering to only the listed agents. When absent, the subagent is rendered for all configured agents.

The manifest SHALL NOT carry portable behavior fields (`model`, `toolAccess`, `background`). Behavior is expressed in the content file's frontmatter and passes through to agent-native files verbatim. The manifest's `description` (inherited from `CommonManifestFields`) is registry-facing only and has no relationship to anything in the frontmatter.

#### Scenario: Valid manifest with agents list

- **WHEN** `subagent.json` contains `type: "subagent"`, identity fields, and `agents: ["claude-code", "cursor"]`
- **THEN** manifest validation SHALL succeed

#### Scenario: Valid manifest with minimal fields

- **WHEN** `subagent.json` contains only `CommonManifestFields` with `type: "subagent"`
- **THEN** manifest validation SHALL succeed

#### Scenario: Manifest description independent of frontmatter description

- **WHEN** `subagent.json` `description` is `"Registry summary"`
- **AND** `<name>.md` frontmatter `description` is `"In-content description"`
- **THEN** both SHALL be accepted and SHALL NOT be reconciled by AXM
- **AND** the manifest description SHALL be the value used by the registry; the frontmatter description SHALL flow through to rendered agent-native files

### Requirement: Subagent content file (<name>.md)

The subagent content file SHALL be named `<name>.md` and reside in `src/` within the extension directory. It SHALL use YAML frontmatter for metadata and a Markdown body for the system prompt / instructions.

The manifest `name`, frontmatter `name`, and content file basename without `.md` SHALL match exactly.

`<name>.md` frontmatter SHALL require only one field:

- `name`: required string, matching the manifest `name` and the filename basename

All other frontmatter keys are user-controlled and unstructured. AXM SHALL preserve them verbatim and pass them through to the rendered agent-native file. The single recognized convention key is `agentOverrides` (see "Agent-specific overrides"), which is consumed by the renderer and SHALL NOT be emitted into the rendered file.

#### Scenario: <name>.md with frontmatter and body

- **WHEN** a subagent package contains `subagent.json` and `src/<name>.md`
- **AND** `<name>.md` has YAML frontmatter with `name` and a Markdown body
- **THEN** the frontmatter SHALL be parsed as opaque (apart from `name` validation)
- **AND** the Markdown body SHALL be used as the subagent's instructions/system prompt

#### Scenario: Missing <name>.md

- **WHEN** a subagent package contains `subagent.json` but no `src/<name>.md`
- **THEN** materialization SHALL fail with an error indicating the content file is missing

#### Scenario: Missing name in frontmatter

- **WHEN** `<name>.md` frontmatter does not include `name`
- **THEN** parsing SHALL fail with an error identifying the required field

#### Scenario: Identity mismatch rejected

- **WHEN** a subagent package contains `subagent.json` with `name: "code-reviewer"`
- **AND** the content file is not `src/code-reviewer.md` or its frontmatter `name` is not `code-reviewer`
- **THEN** parsing or publishing SHALL fail with an error identifying the expected name

#### Scenario: Arbitrary frontmatter keys preserved

- **WHEN** `<name>.md` frontmatter contains `model: claude-opus-4-6`, `disallowedTools: "Edit,Write"`, and `custom_field: "x"`
- **THEN** parsing SHALL succeed
- **AND** all keys SHALL be preserved as opaque values
- **AND** rendering SHALL emit each key verbatim into the agent-native file

### Requirement: Pass-through rendering

AXM SHALL render subagents into agent-native formats by translating the user's frontmatter map into the target format with structural body placement. Renderers SHALL NOT interpret or reshape portable behavior fields.

The format families SHALL be:

| Family                | Renderer             | Agents                                                                                  |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| MD + YAML frontmatter | `renderMarkdownYaml` | Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE |
| TOML                  | `renderToml`         | Codex                                                                                   |
| JSON                  | `renderJson`         | Kiro CLI                                                                                |
| Roo modes             | `buildRooModeEntry`  | Roo Code                                                                                |

For each format, the renderer SHALL:

1. Start with the user's frontmatter map (with `agentOverrides` removed, since it is meta).
2. Place the body in the format's structural body slot:
   - Markdown+YAML: body follows the frontmatter block.
   - TOML: body becomes `developer_instructions`.
   - JSON: body becomes `prompt`.
   - Roo: body splits at the first blank line into `roleDefinition` and `customInstructions`; structural fields `slug` and `name` are set to the subagent name; `groups` defaults to `["read", "edit", "command", "mcp"]` when not specified in frontmatter.
3. Apply `agentOverrides[<agent-id>]` as an RFC 7396 JSON Merge Patch on top.

#### Scenario: Frontmatter passes through to Markdown+YAML

- **WHEN** `<name>.md` frontmatter contains `name`, `description`, and `model: opus`
- **AND** rendering for Claude Code
- **THEN** the rendered `.md` file SHALL contain those keys verbatim in its YAML frontmatter

#### Scenario: Frontmatter passes through to TOML

- **WHEN** `<name>.md` frontmatter contains `model: gpt-5-codex` and `sandbox_mode: "read-only"`
- **AND** rendering for Codex
- **THEN** the rendered `.toml` file SHALL contain `model = "gpt-5-codex"` and `sandbox_mode = "read-only"`
- **AND** the body SHALL be emitted as `developer_instructions`

#### Scenario: Codex TOML multiline instructions

- **WHEN** rendering a subagent for Codex
- **AND** the `<name>.md` body contains multiple lines and Markdown formatting
- **THEN** the `developer_instructions` TOML field SHALL use a multiline literal string (triple-quoted `"""..."""`)
- **AND** the Markdown content SHALL be preserved verbatim (no escaping of `#`, `*`, etc.)

#### Scenario: Roo Code body split with single paragraph

- **WHEN** rendering a subagent for Roo Code
- **AND** the `<name>.md` body contains only a single paragraph (no blank line)
- **THEN** the entire body SHALL become `roleDefinition`
- **AND** `customInstructions` SHALL be omitted

#### Scenario: Rendered file has no managed header

- **WHEN** a subagent is rendered for any agent
- **THEN** the rendered file SHALL NOT contain a `<!-- Managed by axm ... -->` comment, `# Managed by axm ...` line, or `_axm_managed` field

#### Scenario: Partial render failure keeps successful renders

- **WHEN** rendering a subagent for agents `["claude-code", "codex", "cursor"]`
- **AND** Codex rendering fails (e.g., TOML serialization error)
- **THEN** Claude Code and Cursor rendered files SHALL be written successfully
- **AND** the error for Codex SHALL be reported
- **AND** the lockfile `renderedFiles` SHALL include entries for Claude Code and Cursor but NOT Codex

### Requirement: Agent-specific overrides

When `<name>.md` frontmatter contains an `agentOverrides` map keyed by agent id, the renderer SHALL apply the matching entry as an RFC 7396 JSON Merge Patch on top of the rendered fields for that agent. `agentOverrides` itself SHALL NOT appear in the rendered file. Overrides for agents not in the configured `agents` set SHALL be ignored, and AXM SHALL log a warning naming the orphan agent ids.

#### Scenario: Claude Code override merged

- **WHEN** `<name>.md` frontmatter contains `agentOverrides: { "claude-code": { "permissionMode": "acceptEdits", "effort": "high" } }`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL include `permissionMode: acceptEdits` and `effort: high`

#### Scenario: Override replaces a frontmatter field

- **WHEN** `<name>.md` frontmatter contains `model: haiku` and `agentOverrides: { "claude-code": { "model": "opus" } }`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL contain `model: opus` and SHALL NOT contain `model: haiku`

#### Scenario: Null override removes a field

- **WHEN** `<name>.md` frontmatter contains `disallowedTools: "Edit,Write"` and `agentOverrides: { "claude-code": { "disallowedTools": null } }`
- **AND** rendering for Claude Code
- **THEN** the rendered frontmatter SHALL NOT contain `disallowedTools`

#### Scenario: Override for non-configured agent ignored with warning

- **WHEN** `<name>.md` frontmatter contains `agentOverrides: { "codex": { "sandbox_mode": "workspace-write" } }`
- **AND** Codex is NOT a configured agent
- **THEN** the Codex override SHALL be ignored during rendering
- **AND** AXM SHALL log a warning identifying `codex` as an orphan override

### Requirement: Roo Code read-modify-write

When rendering for Roo Code, the adapter SHALL use read-modify-write on `.roomodes` (project scope) or `settings/custom_modes.yaml` (user scope), preserving manually-defined modes with different slugs. AXM-managed Roo entries SHALL be identified by slug alone rather than `_axm_managed` metadata.

#### Scenario: Existing manual modes preserved

- **WHEN** `.roomodes` contains a manually-defined mode `"architect"`
- **AND** a subagent `code-reviewer` is rendered for Roo Code
- **THEN** `.roomodes` SHALL contain both the `architect` mode (unchanged) and the `code-reviewer` mode

#### Scenario: Managed mode updated on re-render by slug

- **WHEN** `.roomodes` contains a mode `code-reviewer`
- **AND** that mode was previously rendered by AXM for the same slug
- **AND** the subagent's instructions have changed
- **THEN** re-rendering SHALL update only the `code-reviewer` entry
- **AND** manual modes with different slugs SHALL remain unchanged

#### Scenario: Managed mode removed on uninstall by slug

- **WHEN** a subagent `code-reviewer` is uninstalled
- **AND** `.roomodes` contains the `code-reviewer` mode entry
- **THEN** the `code-reviewer` entry SHALL be removed from `.roomodes`
- **AND** manual modes with different slugs SHALL remain unchanged

### Requirement: Agent adapter subagent methods

Each `CodingAgent` SHALL support subagent operations via three methods:

- `resolveEffectiveSubagentsDir(args)`: resolves the agent's subagents directory for the given scope
- `addSubagent(args)`: renders and writes a subagent file to the agent's subagents directory, returning a sync outcome
- `removeSubagent(args)`: deletes a rendered subagent file from the agent's subagents directory

#### Scenario: Add subagent to agent

- **WHEN** `addSubagent` is called with frontmatter and body
- **THEN** the agent adapter SHALL resolve the subagents directory, call the appropriate renderer, and write the rendered file
- **AND** SHALL return a sync outcome

#### Scenario: Remove subagent from agent

- **WHEN** `removeSubagent` is called with a subagent name
- **THEN** the agent adapter SHALL delete the rendered file from the subagents directory

#### Scenario: Resolve subagents directory respects scope

- **WHEN** `resolveEffectiveSubagentsDir` is called with project scope for Claude Code
- **THEN** it SHALL return `.claude/agents/`
- **WHEN** called with user scope for Claude Code
- **THEN** it SHALL return `~/.claude/agents/`

### Requirement: Kiro dual-format rendering

Kiro SHALL produce two rendered files per subagent: a `.md` file for the IDE and a `.json` file for the CLI. Both SHALL be tracked in the lockfile `renderedFiles` map under the `kiro` key.

#### Scenario: Both Kiro formats rendered

- **WHEN** a subagent is rendered for Kiro
- **THEN** the adapter SHALL produce `.kiro/agents/<name>.md` (IDE format)
- **AND** `.kiro/agents/<name>.json` (CLI format)

#### Scenario: Both Kiro files tracked in lockfile

- **WHEN** a subagent is installed with Kiro configured
- **THEN** the lockfile `renderedFiles` for `kiro` SHALL contain entries for both the `.md` and `.json` files

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

- An entry-level `sourceHash` — hash of `<name>.md` (frontmatter + body). Used to decide whether re-rendering is needed. Entry-level because all agents share the same canonical source
- A `renderedFiles` map keyed by agent ID, where each value is an array of `{ path }` objects tracking rendered file locations

This is the same shared rendered-file tracking model used by `CommandLockEntry` and `SkillLockEntry` (copy mode), defined in the shared `RenderedFilesMapSchema`. No per-agent `contentHash` — drift detection uses the source hash.

#### Scenario: Lock entry records source hash and rendered files

- **WHEN** a subagent is installed to a workspace with agents `["claude-code", "cursor"]`
- **THEN** the lockfile entry SHALL include `sourceHash: "sha256:..."` at the entry level
- **AND** SHALL include `renderedFiles: { "claude-code": [{ "path": ".claude/agents/<name>.md" }], "cursor": [{ "path": ".cursor/agents/<name>.md" }] }`

#### Scenario: Kiro lock entry has multiple rendered files

- **WHEN** a subagent is installed with Kiro configured
- **THEN** the lockfile `renderedFiles` for `kiro` SHALL be an array containing entries for both the `.md` and `.json` files: `[{ "path": ".kiro/agents/<name>.md" }, { "path": ".kiro/agents/<name>.json" }]`

#### Scenario: Source hash enables re-render skip

- **WHEN** `axm sync` computes the current `<name>.md` source hash
- **AND** the hash matches the lockfile's `sourceHash`
- **THEN** sync SHALL skip re-rendering for that subagent (optimization)

#### Scenario: Source hash mismatch triggers re-render

- **WHEN** `axm sync` computes the current `<name>.md` source hash
- **AND** the hash differs from the lockfile's `sourceHash`
- **THEN** sync SHALL re-render the subagent to all configured agents

### Requirement: Conflict detection at render paths

AXM-managed rendered files SHALL NOT silently overwrite manually-created agent files. Install and sync SHALL fail with an actionable error when a name collision is detected with an unmanaged file.

#### Scenario: Manual file blocks rendering

- **WHEN** `.claude/agents/code-reviewer.md` exists without an AXM lockfile entry
- **AND** `axm subagents install` attempts to render `code-reviewer` for Claude Code
- **THEN** the install SHALL fail with: `Conflict: .claude/agents/code-reviewer.md already exists and is not managed by axm. Use --force to overwrite.`

#### Scenario: Force overrides conflict

- **WHEN** the same conflict exists
- **AND** `--force` is specified
- **THEN** the install SHALL overwrite the file with the rendered content

#### Scenario: Managed file does not conflict

- **WHEN** `.claude/agents/code-reviewer.md` exists and is tracked in the lockfile
- **AND** `axm subagents install` attempts to render `code-reviewer`
- **THEN** the install SHALL proceed (re-rendering the managed file)

### Requirement: Directory layout

A subagent extension SHALL follow this directory layout within `.axm/extensions/`:

```
.axm/extensions/<owner>/subagents/<name>/
  subagent.json          # Manifest
  src/
    <name>.md            # Instructions
```

#### Scenario: Standard layout resolved

- **WHEN** AXM resolves a subagent extension at `@acme/subagents/code-reviewer`
- **THEN** the manifest SHALL be at `.axm/extensions/@acme/subagents/code-reviewer/subagent.json`
- **AND** the content file SHALL be at `.axm/extensions/@acme/subagents/code-reviewer/src/code-reviewer.md`

### Requirement: FQN segment

The subagent extension type SHALL use `"subagents"` as its `ExtensionTypePlural` segment in fully qualified names. `ExtensionTypeSchema` SHALL include `"subagent"` as a valid type.

#### Scenario: Subagent FQN format

- **WHEN** a subagent is published by `@acme` with name `code-reviewer`
- **THEN** its fully qualified name SHALL be `@acme/subagents/code-reviewer`

#### Scenario: FQN parsing recognizes subagents

- **WHEN** the FQN parser receives `@acme/subagents/code-reviewer`
- **THEN** it SHALL parse `owner: "@acme"`, `type: "subagent"`, `typePlural: "subagents"`, `name: "code-reviewer"`
