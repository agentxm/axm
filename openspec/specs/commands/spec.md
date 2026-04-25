# commands Specification

## Purpose

The commands capability provides workspace-level command management with agent-specific rendering.

## Requirements

### Requirement: Command manifest schema

The command manifest (`command.json`) SHALL extend `CommonManifestFields` with command-specific packaging and distribution fields:

- `agents`: optional array of agent ID strings filtering which configured agents receive rendered command files
- `agentOverrides`: optional record keyed by agent ID, where each value is a record of agent-specific field overrides

The manifest MAY contain derived copies of COMMAND.md frontmatter fields (`description`, `model`, etc.) for registry search and filtering, but these SHALL be synced FROM the content file during `publish` — never edited directly in the manifest.

#### Scenario: Valid manifest with agent filter

- **WHEN** `command.json` contains `agents: ["claude-code", "cursor"]` and `agentOverrides: { "claude-code": { "hooks": { "prerun": ["echo hi"] } } }`
- **THEN** manifest validation SHALL succeed (structural validation only)
- **AND** semantic validation of `agentOverrides` SHALL be deferred to each agent's renderer

#### Scenario: Valid manifest with minimal fields

- **WHEN** `command.json` contains only `CommonManifestFields` with `type: "command"` and no command-specific fields
- **THEN** manifest validation SHALL succeed with defaults applied

#### Scenario: No agents filter renders to all configured agents

- **WHEN** `command.json` omits the `agents` field
- **THEN** the command SHALL be rendered to all agents configured in the workspace

#### Scenario: Agents filter restricts rendering

- **WHEN** `command.json` contains `agents: ["claude-code", "cursor"]`
- **AND** the workspace has agents `["claude-code", "cursor", "gemini-cli"]` configured
- **THEN** the command SHALL only be rendered to Claude Code and Cursor

### Requirement: COMMAND.md content file

The command prompt body and behavioral configuration SHALL reside in a `COMMAND.md` file. `COMMAND.md` SHALL use YAML frontmatter for all authoring/behavioral fields, with the prompt body as the markdown content below the frontmatter.

**COMMAND.md frontmatter fields (source of truth for authoring):**

- `description`: optional string describing the command
- `model`: optional nullable string specifying a model override for command execution
- `allowedTools`: optional nullable array of strings restricting which tools the command may use
- `isolatedContext`: optional boolean (default false) controlling whether the command runs in a forked/subtask context
- `arguments`: optional array of argument definitions, each with `name` (required), `description` (optional), `required` (optional, default false), and `default` (optional)
- `argumentHint`: optional string describing argument usage shown to users
- `autoInvocable`: optional boolean (default true) controlling whether agents may invoke the command without user initiation
- `userInvocable`: optional boolean (default true) controlling whether users can invoke the command via slash syntax

The manifest (`command.json`) is the source of truth for packaging/distribution concerns. COMMAND.md frontmatter is the source of truth for behavioral/authoring concerns. This model applies uniformly to commands and subagents.

#### Scenario: COMMAND.md with frontmatter and body

- **WHEN** a `COMMAND.md` contains YAML frontmatter with `description`, `model`, and `allowedTools` followed by a prompt body
- **THEN** AXM SHALL parse the frontmatter for behavioral fields
- **AND** SHALL use the body as the command prompt

#### Scenario: COMMAND.md with no frontmatter

- **WHEN** a `COMMAND.md` contains only a prompt body with no YAML frontmatter
- **THEN** AXM SHALL use defaults for all behavioral fields
- **AND** SHALL use the entire file content as the command prompt

#### Scenario: Missing COMMAND.md

- **WHEN** a command package contains `command.json` but no `COMMAND.md`
- **THEN** materialization SHALL fail with an error indicating the command body is missing

#### Scenario: Null model clears inherited model

- **WHEN** `COMMAND.md` frontmatter contains `model: null`
- **THEN** no model override SHALL apply
- **AND** agents SHALL use their default model selection

### Requirement: Command settings entry schema

The settings schema for commands SHALL use a per-type entry schema supporting `string | { source, enabled? }`, consistent with the baseline shared across all extension types.

#### Scenario: String shorthand in settings

- **WHEN** `settings.json` contains `"commands": { "review-pr": "^1.0.0" }`
- **THEN** the command SHALL be treated as enabled with the given version constraint

#### Scenario: Object entry with enabled flag

- **WHEN** `settings.json` contains `"commands": { "review-pr": { "source": "^1.0.0", "enabled": false } }`
- **THEN** the command SHALL be treated as disabled

#### Scenario: Object entry defaults enabled to true

- **WHEN** `settings.json` contains `"commands": { "review-pr": { "source": "^1.0.0" } }` with no `enabled` field
- **THEN** the command SHALL be treated as enabled

### Requirement: Per-format-family rendering

AXM SHALL render commands into agent-native formats using format-family renderers. Each renderer SHALL be a pure function that accepts the COMMAND.md frontmatter, command body, agent overrides from the manifest, and agent-specific configuration, and returns a rendered command file.

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

Rendered command files SHALL contain only the agent-native content produced from `COMMAND.md` frontmatter and body. AXM SHALL NOT prepend managed headers or ownership markers to Markdown, TOML, or plain-text command outputs.

#### Scenario: Markdown rendered file has no managed header

- **WHEN** a command is rendered for Claude Code
- **THEN** the rendered file SHALL begin with the Markdown content generated from the command source
- **AND** SHALL NOT begin with `<!-- Managed by axm — see "axm commands --help" -->`

#### Scenario: TOML rendered file has no managed header

- **WHEN** a command is rendered for Gemini CLI
- **THEN** the rendered file SHALL begin with TOML content
- **AND** SHALL NOT begin with `# Managed by axm — see "axm commands --help"`

#### Scenario: Sync overwrites classifier-managed files without a header check

- **WHEN** a command is installed or synced for an extension that the workspace classifier manages
- **THEN** AXM SHALL overwrite the render target with the latest rendered content
- **AND** SHALL NOT require a managed header in the existing file first

### Requirement: Install conflict detection

When rendering a command file, AXM SHALL NOT inspect target file contents for an AXM-managed header before writing. Command sync behavior is determined by classifier-managed extension state rather than content markers.

#### Scenario: No existing file

- **WHEN** the render target path has no existing file
- **THEN** the adapter SHALL render and write the command file normally

#### Scenario: Existing file is overwritten without header parsing

- **WHEN** the render target path already exists for a classifier-managed command
- **THEN** the adapter SHALL render and overwrite the file
- **AND** SHALL NOT parse the existing contents for a managed header

#### Scenario: Force is not required to replace a headerless managed target

- **WHEN** the render target path has an existing file without an AXM-managed header
- **AND** the command is being synced as a classifier-managed extension
- **THEN** the adapter SHALL overwrite the file without requiring `--force`

### Requirement: Agent adapter command methods

Each `CodingAgent` SHALL support command operations via three methods:

- `resolveEffectiveCommandsDir(args)`: resolves the agent's commands directory for the given scope
- `addCommand(args)`: renders and writes a command file to the agent's commands directory, returning a sync outcome with any lossy-rendering warnings
- `removeCommand(args)`: deletes a rendered command file from the agent's commands directory

#### Scenario: Add command to agent

- **WHEN** `addCommand` is called with a COMMAND.md (frontmatter + body) and manifest
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

When a command uses frontmatter fields that an agent does not support, the renderer SHALL return structured lossy-rendering warnings. Warnings SHALL be per-feature-per-agent and SHALL NOT prevent installation.

#### Scenario: Model override unsupported by Cursor

- **WHEN** a command specifies `model: "claude-sonnet-4-5-20250514"` in COMMAND.md frontmatter
- **AND** rendering for Cursor
- **THEN** the renderer SHALL omit the model field and return a warning that Cursor does not support model overrides

#### Scenario: Tool restrictions unsupported by Augment

- **WHEN** a command specifies `allowedTools: ["Read"]` in COMMAND.md frontmatter
- **AND** rendering for Augment
- **THEN** the renderer SHALL omit the allowed-tools field and return a warning

#### Scenario: Multiple warnings accumulated

- **WHEN** a command specifies `model`, `allowedTools`, and `isolatedContext` in COMMAND.md frontmatter
- **AND** rendering for an agent that supports none of these
- **THEN** the renderer SHALL return one warning per unsupported feature

### Requirement: Lockfile command entries

`CommandLockEntry` SHALL include:

- An `agents` array tracking which agents a command is rendered to
- An entry-level `sourceHash` — hash of the portable inputs (COMMAND.md frontmatter + body + relevant manifest fields). Used to decide whether re-rendering is needed. Entry-level because all agents share the same canonical source
- A `renderedFiles` map keyed by agent ID, where each value is an array of `{ path }` objects tracking rendered file locations

The `agents` array, `sourceHash`, and `renderedFiles` map SHALL be updated on install, uninstall, enable, disable, and sync. The `sourceHash` hashes the portable inputs — not the rendered output — so reformatting by Prettier or editor tooling does not trigger false drift.

The `renderedFiles` array-per-agent shape is shared with subagent lock entries (where agents like Kiro produce multiple files). For commands, each agent typically has one entry.

#### Scenario: Lock entry records rendered agents and files

- **WHEN** a command is installed to a workspace with agents `["claude-code", "cursor"]`
- **THEN** the lockfile entry SHALL include `agents: ["claude-code", "cursor"]`
- **AND** SHALL include `sourceHash` at the entry level
- **AND** SHALL include `renderedFiles` with an array per agent containing `{ path }` objects

#### Scenario: Agents array updated on agent config change

- **WHEN** the workspace agent list changes
- **AND** `axm sync` is run
- **THEN** the lockfile `agents` array SHALL reflect the current set of agents the command is rendered to
- **AND** `renderedFiles` SHALL be updated to match

#### Scenario: Source hash determines re-render need

- **WHEN** `axm sync` is run
- **AND** a command's portable inputs have not changed since last render
- **THEN** the source hash SHALL match and the command SHALL NOT be re-rendered

#### Scenario: Source hash mismatch triggers re-render

- **WHEN** `axm sync` is run
- **AND** a command's COMMAND.md content has changed since last render
- **THEN** the source hash SHALL differ and the command SHALL be re-rendered to all agents

#### Scenario: Missing rendered file is recreated

- **WHEN** a rendered file tracked in `renderedFiles` is missing from disk
- **AND** `axm sync` is run
- **THEN** the file SHALL be re-rendered (recreated)

### Requirement: Multi-source support

The command manager SHALL support all four ref types for command materialization, following the skill manager pattern:

- **Registry**: extract zip to canonical path
- **Git-hosted**: clone/checkout to canonical path
- **Local**: symlink or copy from local path
- **Builtin**: copy from bundled source

After materialization, the manager SHALL trigger agent rendering for each configured agent.

#### Scenario: Registry source installs

- **WHEN** a command is installed from a registry source
- **THEN** the manager SHALL extract the package to the canonical `.axm/extensions/` path
- **AND** SHALL render to configured agents

#### Scenario: Local source installs

- **WHEN** a command is installed from a local path
- **THEN** the manager SHALL symlink or copy from the local path
- **AND** SHALL render to configured agents

### Requirement: CLI command lifecycle

AXM SHALL provide a `commands` command group with the following subcommands:

| Command     | Behavior                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| `install`   | Resolve source, materialize, read COMMAND.md, render to agents, update settings and lockfile |
| `uninstall` | Remove rendered files from agents, remove settings entry, remove lockfile entry              |
| `list`      | Display installed commands with name, source, enabled status, and agents                     |
| `update`    | Re-resolve source, update materialized files, re-render to agents                            |
| `enable`    | Set `enabled: true` in settings, re-render to agents                                         |
| `disable`   | Set `enabled: false` in settings, remove rendered files from agents                          |
| `new`       | Scaffold `command.json` + `COMMAND.md` in current directory                                  |
| `publish`   | Sync frontmatter fields to manifest, validate, pack, upload to registry                      |

All commands SHALL accept the `--scope` flag (default: project).

#### Scenario: Install from registry

- **WHEN** `axm commands install @owner/commands/review-pr` is run
- **THEN** the CLI SHALL resolve the source, materialize the package, read COMMAND.md frontmatter and body, render to each configured agent, update settings, and update lockfile
- **AND** SHALL display the install result with any lossy-rendering warnings

#### Scenario: Uninstall removes rendered files

- **WHEN** `axm commands uninstall review-pr` is run
- **THEN** the CLI SHALL remove rendered files from each agent listed in lockfile `renderedFiles`, remove the settings entry, and remove the lockfile entry

#### Scenario: List shows command status

- **WHEN** `axm commands list` is run
- **THEN** the CLI SHALL display each command's name, source, enabled status, and which agents it is rendered to

#### Scenario: Update re-renders

- **WHEN** `axm commands update review-pr` is run
- **THEN** the CLI SHALL re-resolve the source, update materialized files, and re-render to all configured agents
- **AND** SHALL update the lockfile source hash

#### Scenario: Enable re-renders to agents

- **WHEN** `axm commands enable review-pr` is run
- **THEN** the CLI SHALL set `enabled: true` in settings and re-render the command to all configured agents

#### Scenario: Disable removes rendered files

- **WHEN** `axm commands disable review-pr` is run
- **THEN** the CLI SHALL set `enabled: false` in settings and remove the command's rendered files from all agents

#### Scenario: New scaffolds command

- **WHEN** `axm commands new` is run
- **THEN** the CLI SHALL scaffold a `command.json` and `COMMAND.md` in the current directory
- **AND** SHALL prompt for name and description interactively

#### Scenario: Publish syncs frontmatter to manifest

- **WHEN** `axm commands publish` is run
- **THEN** the CLI SHALL sync COMMAND.md frontmatter fields (description, model, etc.) to the manifest for registry use
- **AND** SHALL validate and upload to the registry

### Requirement: Preview flag on state-changing operations

The `--preview` flag SHALL be supported on state-changing CLI operations: `install`, `uninstall`, `update`, `enable`, `disable`, and `sync`. When `--preview` is passed, the CLI SHALL display what would happen without writing any files or modifying settings.

#### Scenario: Preview install

- **WHEN** `axm commands install review-pr --preview` is run
- **THEN** the CLI SHALL display which agents would receive rendered files and any lossy-rendering warnings
- **AND** SHALL NOT write any files or modify settings or lockfile

#### Scenario: Preview uninstall

- **WHEN** `axm commands uninstall review-pr --preview` is run
- **THEN** the CLI SHALL display which rendered files would be removed
- **AND** SHALL NOT delete any files or modify settings or lockfile

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
