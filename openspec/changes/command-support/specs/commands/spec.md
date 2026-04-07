## ADDED Requirements

### Requirement: Command manifest schema

The command manifest (`axm-command.json`) SHALL extend `CommonManifestFields` with command-specific fields:

- `arguments`: optional array of argument definitions, each with `name` (required), `description` (optional), `required` (optional, default false), and `default` (optional)
- `argumentHint`: optional string describing argument usage shown to users
- `autoInvocable`: optional boolean (default true) controlling whether agents may invoke the command without user initiation
- `userInvocable`: optional boolean (default true) controlling whether users can invoke the command via slash syntax
- `model`: optional nullable string specifying a model override for command execution
- `allowedTools`: optional nullable array of strings restricting which tools the command may use
- `isolatedContext`: optional boolean (default false) controlling whether the command runs in a forked/subtask context
- `agentOverrides`: optional record keyed by agent ID, where each value is a record of agent-specific field overrides

#### Scenario: Valid manifest with all command-specific fields

- **WHEN** `axm-command.json` contains `arguments: [{ "name": "file", "required": true }]`, `argumentHint: "<file>..."`, `model: "claude-sonnet-4-5-20250514"`, `allowedTools: ["Read", "Write"]`, `isolatedContext: true`
- **THEN** manifest validation SHALL succeed

#### Scenario: Valid manifest with minimal fields

- **WHEN** `axm-command.json` contains only `CommonManifestFields` with `type: "command"` and no command-specific fields
- **THEN** manifest validation SHALL succeed with defaults applied

#### Scenario: Agent overrides validated structurally

- **WHEN** `axm-command.json` contains `agentOverrides: { "claude-code": { "hooks": { "prerun": ["echo hi"] } } }`
- **THEN** manifest validation SHALL succeed (structural validation only)
- **AND** semantic validation SHALL be deferred to each agent's renderer

#### Scenario: Null model clears inherited model

- **WHEN** `axm-command.json` contains `model: null`
- **THEN** the manifest SHALL indicate that no model override applies
- **AND** agents SHALL use their default model selection

### Requirement: Command body in COMMAND.md

The command prompt body SHALL reside in a `COMMAND.md` file, separate from the manifest. `COMMAND.md` SHALL contain only the prompt body as markdown with no frontmatter. AXM SHALL generate agent-native frontmatter from the manifest when rendering.

#### Scenario: COMMAND.md contains prompt body only

- **WHEN** a command package contains `axm-command.json` and `COMMAND.md`
- **THEN** `COMMAND.md` SHALL be treated as pure markdown body
- **AND** no YAML frontmatter parsing SHALL be attempted on `COMMAND.md`

#### Scenario: Missing COMMAND.md

- **WHEN** a command package contains `axm-command.json` but no `COMMAND.md`
- **THEN** materialization SHALL fail with an error indicating the command body is missing

### Requirement: Per-format-family rendering

AXM SHALL render commands into agent-native formats using format-family renderers. Each renderer SHALL be a pure function that accepts the manifest, command body, and agent-specific configuration and returns a rendered command file.

The format families SHALL be:

| Family                          | Renderer                        | Agents                                                            |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| MD + YAML frontmatter           | `renderMarkdownWithFrontmatter` | Claude Code, Codex, OpenCode, Augment, Junie, Kilo Code, Roo Code |
| MD only                         | `renderMarkdownOnly`            | Cursor                                                            |
| `.prompt.md` + YAML frontmatter | `renderPromptMd`                | Copilot                                                           |
| TOML                            | `renderToml`                    | Gemini CLI                                                        |
| Plain text                      | `renderPlainText`               | Kiro                                                              |

#### Scenario: Markdown with frontmatter rendering

- **WHEN** rendering a command for Claude Code
- **THEN** the renderer SHALL produce a `.md` file with YAML frontmatter containing supported fields (`description`, `argument-hint`, `allowed-tools`, `model`, `context`) followed by the command body

#### Scenario: Markdown-only rendering

- **WHEN** rendering a command for Cursor
- **THEN** the renderer SHALL produce a `.md` file with the command body only and no YAML frontmatter

#### Scenario: Prompt.md rendering

- **WHEN** rendering a command for Copilot
- **THEN** the renderer SHALL produce a `.prompt.md` file with YAML frontmatter containing supported fields (`description`, `name`, `argument-hint`, `model`, `tools`) followed by the command body

#### Scenario: TOML rendering

- **WHEN** rendering a command for Gemini CLI
- **THEN** the renderer SHALL produce a `.toml` file with `prompt` containing the command body and `description` if present

#### Scenario: Plain text rendering

- **WHEN** rendering a command for Kiro
- **THEN** the renderer SHALL produce a plain text file with the command body

### Requirement: Variable substitution at render time

Renderers SHALL replace portable variable syntax with agent-native syntax at render time (compile-time replacement). The portable variables are `{{arguments}}`, `{{arguments[N]}}`, and `{{arg:name}}`. The escape sequence `\{{` SHALL produce a literal `{{` in rendered output.

| Portable           | Claude Code / Codex / OpenCode / Augment / Kilo / Roo | Cursor                     | Copilot         | Gemini                   | Junie               | Kiro                    |
| ------------------ | ----------------------------------------------------- | -------------------------- | --------------- | ------------------------ | ------------------- | ----------------------- |
| `{{arguments}}`    | `$ARGUMENTS`                                          | `$ARGUMENTS`               | `${input:args}` | `{{args}}`               | (all args appended) | (literal, with warning) |
| `{{arguments[0]}}` | `$1`                                                  | (inline into `$ARGUMENTS`) | `${input:arg1}` | (inline into `{{args}}`) | `$arg1`             | (literal, with warning) |
| `{{arg:name}}`     | (appended as context)                                 | (appended as context)      | `${input:name}` | (appended as context)    | `$name`             | (literal, with warning) |

#### Scenario: Arguments variable substituted for Claude Code

- **WHEN** `COMMAND.md` contains `Review {{arguments}}`
- **AND** rendering for Claude Code
- **THEN** the rendered file SHALL contain `Review $ARGUMENTS`

#### Scenario: Indexed argument substituted for Copilot

- **WHEN** `COMMAND.md` contains `Fix {{arguments[0]}}`
- **AND** rendering for Copilot
- **THEN** the rendered file SHALL contain `Fix ${input:arg1}`

#### Scenario: Named argument substituted for Junie

- **WHEN** `COMMAND.md` contains `Deploy to {{arg:env}}`
- **AND** rendering for Junie
- **THEN** the rendered file SHALL contain `Deploy to $env`

#### Scenario: Variable rendered as literal for Kiro with warning

- **WHEN** `COMMAND.md` contains `Review {{arguments}}`
- **AND** rendering for Kiro
- **THEN** the rendered file SHALL contain the literal text `{{arguments}}`
- **AND** the renderer SHALL return a lossy-rendering warning

#### Scenario: Escaped variable produces literal

- **WHEN** `COMMAND.md` contains `Use \{{arguments}} for raw`
- **THEN** the rendered file SHALL contain `Use {{arguments}} for raw` regardless of agent

### Requirement: Managed-file header

Each rendered command file SHALL start with a managed-by header appropriate to its format, containing an ISO 8601 UTC timestamp of the last sync.

| Format                  | Header                                               |
| ----------------------- | ---------------------------------------------------- |
| Markdown (all variants) | `<!-- Managed by axm -- last synced <timestamp> -->` |
| TOML                    | `# Managed by axm -- last synced <timestamp>`        |
| Plain text              | `# Managed by axm -- last synced <timestamp>`        |

#### Scenario: Markdown rendered file includes managed header

- **WHEN** a command is rendered for Claude Code
- **THEN** the first line of the rendered file SHALL be `<!-- Managed by axm -- last synced <ISO-8601-UTC> -->`

#### Scenario: TOML rendered file includes managed header

- **WHEN** a command is rendered for Gemini CLI
- **THEN** the first line of the rendered file SHALL be `# Managed by axm -- last synced <ISO-8601-UTC>`

#### Scenario: Sync always overwrites

- **WHEN** a managed command file has been manually edited
- **AND** `axm sync` is run
- **THEN** the file SHALL be overwritten with the rendered content from the manifest and command body

### Requirement: Agent adapter command methods

Each `CodingAgent` SHALL support command operations via three methods:

- `resolveEffectiveCommandsDir(args)`: resolves the agent's commands directory for the given scope
- `addCommand(args)`: renders and writes a command file to the agent's commands directory, returning a sync outcome with any lossy-rendering warnings
- `removeCommand(args)`: deletes a rendered command file from the agent's commands directory

#### Scenario: Add command to agent

- **WHEN** `addCommand` is called with a manifest and command body
- **THEN** the agent adapter SHALL resolve the commands directory, call the appropriate renderer, and write the rendered file
- **AND** SHALL return a sync outcome including any warnings

#### Scenario: Remove command from agent

- **WHEN** `removeCommand` is called with a command name
- **THEN** the agent adapter SHALL delete the rendered file from the commands directory

#### Scenario: Resolve commands directory respects scope

- **WHEN** `resolveEffectiveCommandsDir` is called with project scope for Claude Code
- **THEN** it SHALL return `.claude/commands/`
- **WHEN** called with user scope for Claude Code
- **THEN** it SHALL return `~/.claude/commands/`

### Requirement: Scope-aware rendering

Command rendering SHALL respect workspace scope. Project scope renders to project-relative agent directories. User scope renders to user-level agent directories. Agent-specific scope constraints SHALL be enforced.

#### Scenario: Codex forces user scope

- **WHEN** a command is rendered for Codex with project scope requested
- **THEN** the adapter SHALL render to `~/.codex/prompts/` (user scope)
- **AND** SHALL log an informational note that Codex only supports user-scope commands

#### Scenario: Copilot warns on user scope

- **WHEN** a command is rendered for Copilot with user scope requested
- **AND** Copilot is the only configured agent
- **THEN** the adapter SHALL warn that Copilot does not support filesystem-based user-scope commands

#### Scenario: Kilo Code resolves correct directory

- **WHEN** a command is rendered for Kilo Code
- **AND** `.kilo/commands/` exists
- **THEN** the adapter SHALL render to `.kilo/commands/`
- **WHEN** `.kilo/commands/` does not exist and `.opencode/commands/` exists
- **THEN** the adapter SHALL render to `.opencode/commands/`

### Requirement: Lossy rendering warnings

When a command uses manifest fields that an agent does not support, the renderer SHALL return structured lossy-rendering warnings. Warnings SHALL be per-feature-per-agent and SHALL NOT prevent installation.

#### Scenario: Model override unsupported by Cursor

- **WHEN** a command specifies `model: "claude-sonnet-4-5-20250514"`
- **AND** rendering for Cursor
- **THEN** the renderer SHALL omit the model field and return a warning that Cursor does not support model overrides

#### Scenario: Tool restrictions unsupported by Augment

- **WHEN** a command specifies `allowedTools: ["Read"]`
- **AND** rendering for Augment
- **THEN** the renderer SHALL omit the allowed-tools field and return a warning

#### Scenario: Multiple warnings accumulated

- **WHEN** a command specifies `model`, `allowedTools`, and `isolatedContext`
- **AND** rendering for an agent that supports none of these
- **THEN** the renderer SHALL return one warning per unsupported feature

### Requirement: Lockfile command entries with agents

`CommandLockEntry` SHALL include an `agents` array tracking which agents a command is rendered to. The agents array SHALL be updated on install, uninstall, enable, disable, and sync.

#### Scenario: Lock entry records rendered agents

- **WHEN** a command is installed to a workspace with agents `["claude-code", "cursor"]`
- **THEN** the lockfile entry SHALL include `agents: ["claude-code", "cursor"]`

#### Scenario: Agents array updated on agent config change

- **WHEN** the workspace agent list changes
- **AND** `axm sync` is run
- **THEN** the lockfile `agents` array SHALL reflect the current set of agents the command is rendered to

### Requirement: Augment cross-tool dedup

When rendering a command for Augment, the adapter SHALL check whether Claude Code is also a configured agent. If the same command is already rendered to `.claude/commands/`, the Augment adapter SHALL skip writing to `.augment/commands/` because Augment natively reads `.claude/commands/`.

#### Scenario: Augment skips when Claude Code present

- **WHEN** rendering a command for Augment
- **AND** Claude Code is a configured agent in the workspace
- **AND** the command is already rendered to `.claude/commands/`
- **THEN** the Augment adapter SHALL skip writing to `.augment/commands/`
- **AND** SHALL log the skip at info level

#### Scenario: Augment renders normally without Claude Code

- **WHEN** rendering a command for Augment
- **AND** Claude Code is NOT a configured agent in the workspace
- **THEN** the Augment adapter SHALL render to `.augment/commands/` normally

#### Scenario: Re-sync adapts to config changes

- **WHEN** Claude Code is removed from the workspace agent list after initial install
- **AND** `axm sync` is run
- **THEN** the Augment adapter SHALL now render to `.augment/commands/` (no longer skipping)
