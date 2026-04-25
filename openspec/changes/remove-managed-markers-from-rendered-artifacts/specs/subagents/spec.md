## MODIFIED Requirements

### Requirement: Per-format-family rendering

AXM SHALL render subagents into agent-native formats using format-family renderers. Each renderer SHALL be a pure function that accepts the manifest, `SUBAGENT.md` content (frontmatter + body), and agent-specific configuration, and returns a rendered subagent file or Roo mode entry without AXM-managed marker fields or header comments.

| Family                | Renderer                        | Agents                                                                                  |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| MD + YAML frontmatter | `renderMarkdownWithFrontmatter` | Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE |
| TOML                  | `renderToml`                    | Codex                                                                                   |
| JSON                  | `renderJson`                    | Kiro CLI                                                                                |
| YAML/JSON modes       | `renderRooMode`                 | Roo Code                                                                                |

#### Scenario: Roo Code mode rendering

- **WHEN** rendering a subagent for Roo Code
- **THEN** the renderer SHALL merge a mode entry into `.roomodes`
- **AND** the body's first paragraph SHALL become `roleDefinition`
- **AND** the remainder SHALL become `customInstructions`
- **AND** the mode entry SHALL NOT include `"_axm_managed"`

#### Scenario: Roo Code body split with single paragraph

- **WHEN** rendering a subagent for Roo Code
- **AND** the `SUBAGENT.md` body contains only a single paragraph (no blank line)
- **THEN** the entire body SHALL become `roleDefinition`
- **AND** `customInstructions` SHALL be empty or omitted

#### Scenario: Codex TOML multiline instructions

- **WHEN** rendering a subagent for Codex
- **AND** the `SUBAGENT.md` body contains multiple lines and Markdown formatting
- **THEN** the `developer_instructions` TOML field SHALL use a multiline literal string (triple-quoted `"""..."""`)
- **AND** the Markdown content SHALL be preserved verbatim (no escaping of `#`, `*`, etc.)

#### Scenario: Rendered Markdown file has no managed header

- **WHEN** a subagent is rendered for Claude Code
- **THEN** the rendered Markdown file SHALL begin with YAML frontmatter or Markdown content from the source
- **AND** SHALL NOT begin with `<!-- Managed by axm — see "axm subagents --help" -->`

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

### Requirement: Managed-file header

Rendered subagent files and Roo mode entries SHALL contain only the agent-native content produced from the subagent source. AXM SHALL NOT prepend managed headers to Markdown or TOML outputs, and SHALL NOT add `"_axm_managed"` metadata to JSON or Roo outputs.

#### Scenario: Markdown rendered file has no managed header

- **WHEN** a subagent is rendered for Claude Code
- **THEN** the rendered file SHALL begin with the generated subagent content
- **AND** SHALL NOT begin with `<!-- Managed by axm — see "axm subagents --help" -->`

#### Scenario: TOML rendered file has no managed header

- **WHEN** a subagent is rendered for Codex
- **THEN** the rendered file SHALL begin with TOML content
- **AND** SHALL NOT begin with `# Managed by axm — see "axm subagents --help"`

#### Scenario: JSON rendered file has no managed metadata field

- **WHEN** a subagent is rendered for Kiro CLI
- **THEN** the rendered JSON SHALL NOT contain `"_axm_managed"`

### Requirement: Roo Code read-modify-write

When rendering for Roo Code, the adapter SHALL use read-modify-write on `.roomodes` (project scope) or `settings/custom_modes.yaml` (user scope), preserving manually-defined modes. AXM-managed Roo entries SHALL be identified by slug alone rather than `"_axm_managed"` metadata.

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
