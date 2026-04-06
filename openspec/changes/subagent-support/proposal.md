## Why

AXM manages skills, commands, MCP servers, and packs across coding agents — but has no concept of a **subagent** extension type. Every major coding agent now supports subagents (Claude Code, GitHub Copilot, Codex, Cursor, Gemini CLI, OpenCode), each with its own configuration format and directory convention. Teams building reusable subagents today must manually duplicate configuration across agents. AXM should treat subagents as a first-class extension type — installable, publishable, and portable — just like skills.

## What Changes

- **New `subagent` extension type** with its own manifest schema (`axm-subagent.json`), FQN segment (`subagents`), and registry support.
- **Cross-agent subagent installation** — `axm subagents install` writes agent-native configuration files (Markdown+YAML frontmatter for Claude Code, Copilot, Cursor, Gemini CLI, OpenCode; TOML for Codex) into each agent's `agents/` directory.
- **Subagent manifest schema** capturing the portable subset of subagent metadata: name, description, instructions (body), model hint, tool constraints, and optional MCP server references.
- **Agent-specific rendering** — each agent adapter translates the portable manifest into its native format, mapping fields like `tools`, `model`, `readonly`/`sandbox_mode`, `maxTurns`, and `background` to agent-native equivalents where supported.
- **`axm subagents` command group** — `install`, `uninstall`, `list`, `new`, `publish` commands mirroring the existing skills command group.
- **Pack support** — packs can include subagents alongside skills, commands, and MCP servers.
- **Workspace reconciliation** — `axm sync` reconciles subagent symlinks/files across configured agents, matching the existing skill reconciliation pattern.
- **Settings integration** — `settings.json` gains a `subagents` map analogous to `skills`.

## Capabilities

### New Capabilities

- `subagents`: Subagent extension type — manifest schema, portable metadata model, and cross-agent rendering
- `cli-subagents-install`: Install subagent extensions into workspace agents
- `cli-subagents-uninstall`: Remove subagent extensions from workspace agents
- `cli-subagents-list`: List installed subagents and their agent mappings
- `cli-subagents-new`: Scaffold a new subagent extension for authoring
- `cli-subagents-publish`: Publish subagent extensions to a registry

### Modified Capabilities

- `extension-packs`: Packs gain the ability to include `subagents` as a constituent extension type
- `cli-init`: Init flow detects agent directories that support subagents
- `cli-skills`: Skills list/status output distinguishes subagents from skills in summary views

## Impact

- **Core extension model** — `ExtensionTypeSchema`, `ExtensionTypePlural`, FQN parsing, and manifest resolution gain the `subagent` type.
- **Agent adapters** — each `CodingAgent` implementation gains `addSubagent` / `removeSubagent` methods (or a generalized `addExtension` pattern) and an `agentsDir` property alongside the existing `skillsDir`.
- **Agent rendering** — new per-agent renderers that translate the portable subagent manifest into agent-native config formats:
  - **Markdown + YAML frontmatter** — Claude Code, Copilot, Cursor, Gemini CLI, OpenCode
  - **TOML** — Codex
- **Registry** — registry API and publish flow support the `subagent` extension type.
- **Settings schema** — `SettingsSchema` adds `subagents: Record<string, SubagentEntry>`.
- **Workspace reconciliation** — reconciliation engine handles subagent install/uninstall/sync across agents.
- **Packs** — pack manifest schema and resolution logic include subagents.
- **CLI surface** — new `axm subagents` parent command with install, uninstall, list, new, publish subcommands.

---

## Appendix: Targeted Agent Subagent References

### A. Claude Code

**Docs:**

- [Sub-agents](https://code.claude.com/docs/en/sub-agents) (canonical; `docs.anthropic.com/en/docs/claude-code/sub-agents` redirects here)
- [Permissions](https://code.claude.com/docs/en/permissions)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [Tools reference](https://code.claude.com/docs/en/tools-reference)
- [Hooks](https://code.claude.com/docs/en/hooks)
- [Skills](https://code.claude.com/docs/en/skills#run-skills-in-a-subagent)

**Format:** Markdown with YAML frontmatter. Body becomes the system prompt (replaces the default Claude Code system prompt entirely).

**File paths:**

| Scope            | Path                            | Priority    |
| ---------------- | ------------------------------- | ----------- |
| Managed settings | org-managed `.claude/agents/`   | 1 (highest) |
| CLI flag         | `--agents` (JSON, session-only) | 2           |
| Project          | `.claude/agents/*.md`           | 3           |
| User             | `~/.claude/agents/*.md`         | 4           |
| Plugin           | plugin's `agents/` directory    | 5 (lowest)  |

**Synopsis:** Subagents are Markdown files where YAML frontmatter declares metadata and the body provides instructions. The primary agent automatically delegates tasks based on the subagent's `description` field, or users can force delegation with `@"agent-name (agent)"` syntax. Subagents inherit the parent's tools by default but can restrict via `tools` (allowlist) and `disallowedTools` (denylist — applied first). Subagents cannot spawn other subagents (depth 1). Managed via `/agents` command or `claude agents` CLI.

**All frontmatter fields:**

| Field             | Required | Type / Values                                                            | Default      |
| ----------------- | -------- | ------------------------------------------------------------------------ | ------------ |
| `name`            | Yes      | lowercase letters and hyphens                                            | —            |
| `description`     | Yes      | string                                                                   | —            |
| `tools`           | No       | comma-separated; supports `Agent(type1, type2)` syntax                   | inherits all |
| `disallowedTools` | No       | comma-separated                                                          | none         |
| `model`           | No       | `sonnet`, `opus`, `haiku`, full model ID, or `inherit`                   | `inherit`    |
| `permissionMode`  | No       | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` | inherits     |
| `maxTurns`        | No       | number                                                                   | —            |
| `skills`          | No       | list of skill names (NOT inherited from parent)                          | none         |
| `mcpServers`      | No       | server names or inline definitions                                       | none         |
| `hooks`           | No       | `PreToolUse`, `PostToolUse`, `Stop`                                      | none         |
| `memory`          | No       | `user`, `project`, `local`                                               | disabled     |
| `background`      | No       | boolean                                                                  | `false`      |
| `effort`          | No       | `low`, `medium`, `high`, `max`                                           | inherits     |
| `isolation`       | No       | `worktree`                                                               | none         |
| `color`           | No       | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`     | none         |
| `initialPrompt`   | No       | string                                                                   | none         |

**Model resolution order:** `CLAUDE_CODE_SUBAGENT_MODEL` env var > per-invocation `model` param > frontmatter `model` > main conversation model.

**Built-in subagents:** Explore (Haiku, read-only), Plan (read-only), General-purpose (all tools), statusline-setup (Sonnet), Claude Code Guide (Haiku).

**Notable:** Richest feature set of any agent. Supports background execution (Ctrl+B), git worktree isolation, scoped hooks, persistent memory (`MEMORY.md`), and skill injection. Plugin subagents silently ignore `hooks`, `mcpServers`, and `permissionMode` for security.

---

### B. GitHub Copilot

**Docs:**

- [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration) (canonical reference)
- [About custom agents](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-custom-agents)
- [Create custom agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents)
- [VS Code custom agents](https://github.com/microsoft/vscode-docs/blob/main/docs/copilot/customization/custom-agents.md)

**Format:** Markdown with YAML frontmatter. Body provides instructions (max 30,000 characters).

**File paths:**

| Scope          | Path                                                              | Notes                        |
| -------------- | ----------------------------------------------------------------- | ---------------------------- |
| Project        | `.github/agents/<NAME>.md` or `.github/agents/<NAME>.agent.md`    | committed to repo            |
| Organization   | `.github-private` repo: `agents/<NAME>.md`                        | enterprise/org-wide          |
| User (VS Code) | VS Code profile dir (configurable via `chat.agentFilesLocations`) | also reads `.claude/agents/` |

**Synopsis:** Custom agents ("agent profiles") are Markdown files where frontmatter declares behavior. Copilot auto-selects agents based on task context unless `disable-model-invocation: true`. Available in VS Code, JetBrains, GitHub.com (cloud agent), and Copilot CLI. Filename (sans extension) deduplicates across levels; repo overrides org.

**All frontmatter fields:**

| Field                      | Scope           | Type                             | Default          | Notes                                                              |
| -------------------------- | --------------- | -------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `name`                     | All             | string                           | filename         | display name                                                       |
| `description`              | All             | string (required)                | —                | purpose and capabilities                                           |
| `tools`                    | All             | string[] or comma-separated      | `["*"]`          | `[]` disables all                                                  |
| `model`                    | All             | string (or array in VS Code)     | platform default | VS Code supports prioritized array                                 |
| `target`                   | All             | `"vscode"` or `"github-copilot"` | both             | restrict to one environment                                        |
| `disable-model-invocation` | All             | boolean                          | `false`          | prevents auto-selection                                            |
| `user-invocable`           | All             | boolean                          | `true`           | manual selection                                                   |
| `mcp-servers`              | GitHub.com only | object                           | —                | MCP server configs                                                 |
| `metadata`                 | GitHub.com only | object                           | —                | key-value annotations                                              |
| `argument-hint`            | IDE only        | string                           | —                | guidance text for users                                            |
| `handoffs`                 | IDE only        | list of objects                  | —                | workflow transitions (`label`, `agent`, `prompt`, `send`, `model`) |
| `agents`                   | IDE only        | string[]                         | —                | allowed subagents (`"*"` for all, `[]` to prevent)                 |
| `hooks`                    | IDE only        | object                           | —                | agent-scoped hooks (requires `chat.useCustomAgentHooks`)           |

**Tool aliases:** `execute` (shell/Bash/powershell), `read` (Read/NotebookRead), `edit` (Edit/MultiEdit/Write/NotebookEdit), `search` (Grep/Glob), `agent` (custom-agent/Task), `web` (WebSearch/WebFetch).

**Notable:** Split feature set between GitHub.com cloud agent and IDE. `mcp-servers` and `metadata` are cloud-only; `handoffs`, `agents`, and `hooks` are IDE-only. Out-of-box MCP servers: `github` and `playwright`. Filename chars restricted to `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`.

---

### C. OpenAI Codex

**Docs:**

- [Subagents](https://developers.openai.com/codex/subagents) (primary reference)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Config basics](https://developers.openai.com/codex/config-basic)
- [Advanced configuration](https://developers.openai.com/codex/config-advanced)
- [GitHub repo](https://github.com/openai/codex)

**Format:** TOML files (only agent using TOML). AGENTS.md files are separate free-form Markdown instruction files (like CLAUDE.md), not subagent definitions.

**File paths:**

| Scope          | Path                     |
| -------------- | ------------------------ |
| Project agents | `.codex/agents/*.toml`   |
| User agents    | `~/.codex/agents/*.toml` |
| Project config | `.codex/config.toml`     |
| User config    | `~/.codex/config.toml`   |
| System config  | `/etc/codex/config.toml` |

**Synopsis:** Codex uses TOML for subagent definitions. Subagents are spawned via natural language or `/agent` CLI command. Codex orchestrates spawning, routing, and result consolidation. Supports configurable concurrency and recursion depth. Custom agents with matching names override built-ins.

**Per-agent TOML fields:**

| Field                    | Required | Type                                                       | Notes                               |
| ------------------------ | -------- | ---------------------------------------------------------- | ----------------------------------- |
| `name`                   | Yes      | string                                                     | agent identifier                    |
| `description`            | Yes      | string                                                     | human-facing guidance for selection |
| `developer_instructions` | Yes      | string                                                     | system prompt                       |
| `model`                  | No       | string                                                     | LLM identifier                      |
| `model_reasoning_effort` | No       | string                                                     | reasoning intensity                 |
| `sandbox_mode`           | No       | `"read-only"`, `"workspace-write"`, `"danger-full-access"` | inherits parent                     |
| `mcp_servers`            | No       | object                                                     | MCP server config                   |
| `nickname_candidates`    | No       | string[]                                                   | display nicknames                   |
| `skills.config`          | No       | object                                                     | skills configuration                |

**Global `[agents]` config (in config.toml):**

| Field                     | Default | Purpose                     |
| ------------------------- | ------- | --------------------------- |
| `max_threads`             | 6       | concurrent agent thread cap |
| `max_depth`               | 1       | nesting depth (root=0)      |
| `job_max_runtime_seconds` | 1800    | per-worker timeout          |

**Built-in agents:** default (general-purpose), worker (execution-focused), explorer (read-heavy).

**Notable:** Only agent using TOML. Three required fields (others need at most name + description). Configurable multi-level recursion via `max_depth`. Sandbox mode is a string enum with three levels. Also supports CSV batch processing via `spawn_agents_on_csv` tool. Actions requiring new approval fail with error surfaced to parent.

---

### D. Cursor

**Docs:**

- [Subagents](https://cursor.com/docs/context/subagents) (canonical)
- [Cursor 2.4 changelog](https://cursor.com/changelog/2-4) (introduction)
- [Community discussion](https://forum.cursor.com/t/cursor-2-4-subagents/149403)

**Format:** Markdown with YAML frontmatter.

**File paths:**

| Scope    | Path                                        | Notes                                                         |
| -------- | ------------------------------------------- | ------------------------------------------------------------- |
| Project  | `.cursor/agents/*.md`                       | highest precedence                                            |
| User     | `~/.cursor/agents/*.md`                     | global                                                        |
| Fallback | `.claude/agents/*.md`, `.codex/agents/*.md` | project-scoped; `.cursor/` takes precedence on name collision |

**Synopsis:** Subagents are Markdown files where the `description` field serves as the primary delegation trigger. The main agent injects a `<subagent_delegation_context>` block listing available subagents, reads descriptions, and delegates matching tasks via an internal Task tool call. Introduced in Cursor 2.4. Background agents use git worktrees.

**Frontmatter fields:**

| Field           | Type     | Default     | Confidence | Notes                                           |
| --------------- | -------- | ----------- | ---------- | ----------------------------------------------- |
| `name`          | string   | —           | High       | internal identifier                             |
| `description`   | string   | —           | High       | delegation trigger — specificity matters        |
| `model`         | string   | `"inherit"` | High       | `"inherit"`, `"fast"`, or specific model ID     |
| `readonly`      | boolean  | `false`     | High       | prevents file modifications                     |
| `is_background` | boolean  | `false`     | High       | async execution; parent doesn't wait            |
| `tools`         | string[] | —           | Medium     | e.g. `["parent:*"]`; may not be fully supported |
| `temperature`   | float    | —           | Low        | single-source; may be unofficial                |

**Built-in subagents:** Explore (repo navigation), Bash (shell isolation), Browser (DOM/screenshot filtering).

**Notable:** Simplest well-attested schema (5 core fields). Reads `.claude/agents/` and `.codex/agents/` as compatibility fallbacks. Does NOT work with "Auto" model selection — requires a specific model. Up to 8 parallel background agents supported. Background agents use git worktrees, which can create merge conflicts on shared files.

---

### E. Gemini CLI

**Docs:**

- [Subagents](https://geminicli.com/docs/core/subagents/) (docs site)
- [GitHub source](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md)

**Format:** Markdown with YAML frontmatter. Filename is not significant; the `name` field is the identifier.

**File paths:**

| Scope   | Path                    |
| ------- | ----------------------- |
| Project | `.gemini/agents/*.md`   |
| User    | `~/.gemini/agents/*.md` |

**Synopsis:** Subagents specialize the main agent for specific tasks. Each subagent is exposed as a callable tool of the same name. Auto-delegated based on description match or force-invoked with `@agent-name` syntax. Managed via `/agents` command. Subagents cannot call other subagents — even with `*` wildcard, subagent tools are excluded. Can be disabled globally via `experimental.enableAgents: false` in `settings.json` or per-agent via `agents.overrides.<name>.enabled: false`.

**All frontmatter fields:**

| Field          | Required | Type                                     | Default                        | Notes                                     |
| -------------- | -------- | ---------------------------------------- | ------------------------------ | ----------------------------------------- |
| `name`         | Yes      | string (lowercase, hyphens, underscores) | —                              | used as tool name                         |
| `description`  | Yes      | string                                   | —                              | delegation trigger                        |
| `kind`         | No       | `"local"` or `"remote"`                  | `"local"`                      | remote uses A2A protocol                  |
| `tools`        | No       | string[]                                 | inherits all (minus subagents) | wildcards: `*`, `mcp_*`, `mcp_<server>_*` |
| `mcpServers`   | No       | object                                   | —                              | inline MCP configs isolated to subagent   |
| `model`        | No       | string                                   | `"inherit"`                    | e.g. `"gemini-3-flash-preview"`           |
| `temperature`  | No       | number                                   | `1`                            | range 0.0–2.0                             |
| `max_turns`    | No       | number                                   | `30`                           | hard cap                                  |
| `timeout_mins` | No       | number                                   | `10`                           | hard cap                                  |

**Built-in subagents:** codebase_investigator (analysis), cli_help (documentation), generalist_agent (internal routing), browser_agent (web automation — **disabled** by default, requires Chrome 144+).

**Notable:** Supports `kind: remote` for Agent-to-Agent protocol. Tool wildcards (`mcp_*`, `mcp_<server>_*`) enable pattern-based filtering. Isolated context — subagent does not share or pollute main agent's conversation. Has explicit `temperature` and `timeout_mins` controls.

---

### F. OpenCode

**Docs:**

- [Agents](https://opencode.ai/docs/agents/)
- [Config](https://opencode.ai/docs/config/)
- [Modes](https://opencode.ai/docs/modes/) (deprecated in favor of agents)
- [Rules](https://opencode.ai/docs/rules/)
- [GitHub](https://github.com/sst/opencode) (redirects to `anomalyco/opencode`)

**Format:** JSONC (`opencode.json` / `opencode.jsonc`) or Markdown with YAML frontmatter. Body becomes the system prompt.

**File paths:**

| Scope                 | Path                                                   |
| --------------------- | ------------------------------------------------------ |
| Project agents (MD)   | `.opencode/agents/<name>.md`                           |
| Project agents (JSON) | `opencode.json` under `"agent"` key                    |
| User agents (MD)      | `~/.config/opencode/agents/<name>.md`                  |
| User agents (JSON)    | `~/.config/opencode/opencode.json` under `"agent"` key |

**Synopsis:** OpenCode supports both JSON and Markdown agent definitions. Agents declare a `mode` (`primary`, `subagent`, or `all`) to control visibility. Subagents are invoked via `@agent-name` syntax or automatically by the primary agent via the Task tool (creates a child session). The `tools` field is **deprecated** — use `permission` instead. Config files are merged (not replaced) with precedence: remote < global < project < .opencode dir < managed.

**All config fields:**

| Field         | Type                               | Default         | Notes                                                                                           |
| ------------- | ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `description` | string (required)                  | —               | human-readable purpose                                                                          |
| `mode`        | `"primary"`, `"subagent"`, `"all"` | `"all"`         | controls visibility; omitted = dual-mode ([#2029](https://github.com/sst/opencode/issues/2029)) |
| `model`       | string                             | inherits global | `"provider/model-id"` format                                                                    |
| `prompt`      | string                             | —               | system prompt; supports `{file:./path}` and `{env:VAR}`                                         |
| `temperature` | number                             | model default   | 0.0–1.0                                                                                         |
| `top_p`       | number                             | model default   | 0.0–1.0                                                                                         |
| `steps`       | number                             | —               | max agentic iterations before text-only fallback                                                |
| `permission`  | object                             | —               | granular: `"ask"`, `"allow"`, `"deny"` per tool; supports glob patterns                         |
| `hidden`      | boolean                            | `false`         | hides from `@` autocomplete (still invokable by Task tool)                                      |
| `color`       | string                             | —               | hex or theme color name                                                                         |
| `disable`     | boolean                            | `false`         | disables entirely                                                                               |
| `tools`       | object                             | —               | **deprecated** — use `permission`                                                               |

**Permission object example:**

```json
{
  "edit": "deny",
  "bash": { "*": "ask", "git status *": "allow" },
  "task": { "code-reviewer": "ask" }
}
```

**Built-in agents:** Build (primary, default), Plan (primary, read-only), General (subagent, full tools), Explore (subagent, read-only).

**Notable:** Only agent with explicit `mode` field distinguishing primary from subagent roles. Most granular permission model — per-tool `ask`/`allow`/`deny` with glob patterns for bash commands and task delegation. Supports `{file:./path}` and `{env:VAR}` interpolation in prompts. Primary agents cycle with Tab key. `default_agent` must reference a primary agent.

---

### G. Augment Code

**Docs:**

- [Subagents](https://docs.augmentcode.com/cli/subagents) (canonical)
- [Plugins](https://docs.augmentcode.com/cli/plugins) (plugin-bundled agents)
- [Skills](https://docs.augmentcode.com/cli/skills) (distinct from subagents)

**Format:** Markdown with YAML frontmatter. Body becomes the system prompt.

**File paths:**

| Scope          | Path                                            |
| -------------- | ----------------------------------------------- |
| Project        | `.augment/agents/*.md`                          |
| User           | `~/.augment/agents/*.md`                        |
| Plugin-bundled | `<plugin>/agents/*.md` (via `.augment-plugin/`) |

**Synopsis:** Subagents are Markdown files with YAML frontmatter. The main agent auto-detects suitable tasks or users reference subagents by name. Subagents run with independent context windows and can execute in parallel. Managed via `/agents` slash command. Currently CLI-only (not in IDE extensions).

**All frontmatter fields:**

| Field            | Required                       | Type     | Default     | Notes                                    |
| ---------------- | ------------------------------ | -------- | ----------- | ---------------------------------------- |
| `name`           | Yes                            | string   | —           | agent identifier                         |
| `description`    | No (standalone) / Yes (plugin) | string   | —           | purpose and delegation trigger           |
| `color`          | No                             | string   | —           | ANSI color name (e.g. `"yellow"`)        |
| `model`          | No                             | string   | CLI default | e.g. `sonnet4.5`                         |
| `tools`          | No                             | string[] | all tools   | allowlist                                |
| `disabled_tools` | No                             | string[] | none        | denylist (takes precedence over `tools`) |

**Tool names:** `view`, `codebase-retrieval`, `str-replace-editor`, `save-file`, `remove-files`, `launch-process`, `github-api`, `web-fetch`, `web-search`.

**Notable:** Tool control uses both allow and deny lists (like Claude Code). `disabled_tools` takes precedence when both are specified. Plugin system enables bundled distribution of subagents.

---

### H. Junie (JetBrains)

**Docs:**

- [Subagents](https://junie.jetbrains.com/docs/junie-cli-subagents.html) (canonical)
- [Agent Skills](https://junie.jetbrains.com/docs/agent-skills.html) (distinct from subagents)
- [Guidelines](https://www.jetbrains.com/help/junie/customize-guidelines.html)

**Format:** Markdown with YAML frontmatter. Body becomes the system prompt.

**File paths:**

| Scope   | Path                   |
| ------- | ---------------------- |
| Project | `.junie/agents/*.md`   |
| User    | `~/.junie/agents/*.md` |

**Synopsis:** Subagents are automatically delegated by the main agent based on `description` matching. They run in isolated contexts with their own tool restrictions and model selection. Subagents cannot be manually invoked — delegation is automatic only. Junie CLI detects and offers to import agents from `.cursor/agents/`, `.claude/agents/`, and `.codex/agents/`.

**All frontmatter fields:**

| Field                 | Required | Type                       | Default   | Notes                                            |
| --------------------- | -------- | -------------------------- | --------- | ------------------------------------------------ |
| `name`                | No       | string (`[a-z][a-z0-9-]*`) | filename  | agent identifier                                 |
| `description`         | Yes      | string                     | —         | delegation trigger                               |
| `tools`               | No       | string[]                   | all tools | allowlist of tool groups                         |
| `disallowedTools`     | No       | string[]                   | none      | denylist (applied after `tools`)                 |
| `model`               | No       | string                     | —         | e.g. `"sonnet"`, `"opus"`, `"grok"`              |
| `skills`              | No       | string[]                   | none      | agent skill IDs to inject                        |
| `allowPromptArgument` | No       | boolean                    | —         | enables custom prompt args from delegating agent |

**Tool groups:** `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `AskUserQuestion`, plus MCP tools.

**Notable:** Automatic delegation only — no `@agent-name` or manual invocation. Imports from Claude/Cursor/Codex agent directories. Skills are distinct from subagents (skills inform, subagents act). Schema is a close subset of Claude Code's.

---

### I. Kilo Code

**Docs:**

- [Custom Subagents](https://kilo.ai/docs/customize/custom-subagents) (canonical)
- [Custom Modes](https://kilo.ai/docs/customize/custom-modes)
- [AGENTS.md](https://kilo.ai/docs/customize/agents-md)

**Format:** Markdown with YAML frontmatter or JSONC (`kilo.jsonc` under `"agent"` key). Built on the OpenCode package — schema is nearly identical to OpenCode.

**File paths:**

| Scope   | Path (MD)                    | Path (JSON)                  |
| ------- | ---------------------------- | ---------------------------- |
| Project | `.kilo/agents/*.md`          | `kilo.jsonc`                 |
| User    | `~/.config/kilo/agents/*.md` | `~/.config/kilo/config.json` |

Also reads: `.opencode/agents/` (compatibility).

**Synopsis:** Subagents are invoked via the Task tool (automatic delegation) or `@agent-name` syntax. Each runs in an isolated session. Config precedence: built-in < global JSON < project JSON < global MD < project MD (properties merged, not replaced). Nested directories create namespaced names (e.g. `agents/backend/sql.md` → `backend/sql`).

**All config fields:**

| Field         | Type                               | Default     | Notes                                                  |
| ------------- | ---------------------------------- | ----------- | ------------------------------------------------------ |
| `description` | string (required)                  | —           | delegation trigger                                     |
| `mode`        | `"subagent"`, `"primary"`, `"all"` | `"all"`     | visibility control                                     |
| `model`       | string                             | inherits    | `provider/model-id` format                             |
| `prompt`      | string                             | —           | system prompt; MD body or `{file:./path}` in JSON      |
| `temperature` | number                             | —           | 0.0–1.0                                                |
| `top_p`       | number                             | —           | 0.0–1.0                                                |
| `permission`  | object                             | full access | per-tool `"allow"`/`"ask"`/`"deny"` with glob patterns |
| `hidden`      | boolean                            | `false`     | hides from `@` autocomplete                            |
| `steps`       | number                             | —           | max iterations before text-only fallback               |
| `color`       | string                             | —           | hex or theme name                                      |
| `disable`     | boolean                            | `false`     | disables entirely                                      |

**Permission object:** Same as OpenCode — per-tool values with bash glob patterns and `task` key for subagent delegation control.

**Built-in subagents:** general (full tools), explore (read-only).

**Notable:** Built on OpenCode — nearly identical schema. Reads `.opencode/agents/` as fallback. Nested directory naming. Provider-specific options pass through directly.

---

### J. Kiro (AWS)

**Docs:**

- [IDE Subagents](https://kiro.dev/docs/chat/subagents/) (IDE)
- [CLI Subagents](https://kiro.dev/docs/cli/chat/subagents/) (CLI)
- [CLI Custom Agents](https://kiro.dev/docs/cli/custom-agents/) (overview)
- [CLI Configuration Reference](https://kiro.dev/docs/cli/custom-agents/configuration-reference/)
- [CLI Examples](https://kiro.dev/docs/cli/custom-agents/examples/)

**Format:** Dual-format system — **MD + YAML** for IDE, **JSON** for CLI. Both use `.kiro/agents/` but different extensions.

**File paths:**

| Scope   | IDE                   | CLI                     |
| ------- | --------------------- | ----------------------- |
| Project | `.kiro/agents/*.md`   | `.kiro/agents/*.json`   |
| User    | `~/.kiro/agents/*.md` | `~/.kiro/agents/*.json` |

**IDE frontmatter fields:**

| Field            | Required | Type     | Default     | Notes                                                           |
| ---------------- | -------- | -------- | ----------- | --------------------------------------------------------------- |
| `name`           | Yes      | string   | filename    | agent identifier                                                |
| `description`    | No       | string   | —           | auto-selection trigger                                          |
| `tools`          | No       | string[] | —           | `read`, `write`, `shell`, `web`, `spec`, `@builtin`, `@<mcp>/*` |
| `model`          | No       | string   | current LLM | model override                                                  |
| `includeMcpJson` | No       | boolean  | `false`     | include MCP tools from mcp.json                                 |
| `includePowers`  | No       | boolean  | `false`     | include Powers MCP tools                                        |

**CLI JSON fields (additional to IDE):**

| Field                                    | Type     | Notes                                                                            |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `prompt`                                 | string   | system prompt; supports `file://` URIs                                           |
| `allowedTools`                           | string[] | tools usable without prompts; supports globs                                     |
| `toolAliases`                            | object   | renames: `{"@git/git_status": "status"}`                                         |
| `toolsSettings`                          | object   | per-tool config (`write.allowedPaths`, `shell.allowedCommands`, etc.)            |
| `mcpServers`                             | object   | MCP server definitions with `command`, `args`, `env`, `timeout`, `oauth`         |
| `resources`                              | array    | `file://`, `skill://`, or knowledge base objects                                 |
| `hooks`                                  | object   | lifecycle: `agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop` |
| `keyboardShortcut`                       | string   | e.g. `"ctrl+a"`                                                                  |
| `welcomeMessage`                         | string   | greeting on agent switch                                                         |
| `toolsSettings.subagent.availableAgents` | string[] | glob patterns for spawnable agents                                               |
| `toolsSettings.subagent.trustedAgents`   | string[] | glob patterns for no-prompt agents                                               |

**IDE invocation:** Auto-selection via description, natural language reference, or `/agent-name` slash commands. Subagents run in parallel, blocking (main waits).

**CLI invocation:** `/agent create`, `/agent swap`, `kiro-cli --agent <name>`.

**Notable:** Only agent with a dual IDE/CLI format split (MD vs JSON). CLI has the richest config: lifecycle hooks, knowledge bases, tool aliases, keyboard shortcuts, and granular `availableAgents`/`trustedAgents` glob patterns for subagent delegation control. IDE subagents cannot access Specs and hooks don't trigger inside them.

---

### K. Roo Code

**Docs:**

- [Boomerang Tasks](https://docs.roocode.com/features/boomerang-tasks) (orchestrator/subtask delegation)
- [Custom Modes](https://docs.roocode.com/features/custom-modes) (mode definitions)
- [Using Modes](https://docs.roocode.com/basic-usage/using-modes)
- [Skills](https://docs.roocode.com/features/skills)

**Format:** YAML (preferred) or JSON. Uses "custom modes" rather than MD+YAML agent files. The Orchestrator mode delegates via the `new_task` tool.

**File paths:**

| Scope      | Path                          | Notes                              |
| ---------- | ----------------------------- | ---------------------------------- |
| Project    | `.roomodes`                   | YAML or JSON (auto-detected)       |
| Global     | `settings/custom_modes.yaml`  | auto-migrated from `.json`         |
| Mode rules | `.roo/rules-{mode-slug}/`     | directory of `.md`/`.txt` files    |
| Skills     | `.roo/skills/{name}/SKILL.md` | also `.agents/skills/` cross-agent |

**Custom mode fields:**

| Field                | Required | Type                     | Default                            | Notes                                                                                          |
| -------------------- | -------- | ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `slug`               | Yes      | string (`[a-zA-Z0-9-]+`) | —                                  | unique ID, used in file paths                                                                  |
| `name`               | Yes      | string                   | —                                  | display name (can include emoji)                                                               |
| `roleDefinition`     | Yes      | string                   | —                                  | core identity; placed at start of system prompt                                                |
| `description`        | No       | string                   | —                                  | shown in mode selector                                                                         |
| `whenToUse`          | No       | string                   | first sentence of `roleDefinition` | Orchestrator delegation guidance                                                               |
| `customInstructions` | No       | string                   | —                                  | added near end of system prompt                                                                |
| `groups`             | Yes      | array                    | —                                  | tool groups: `"read"`, `"edit"`, `"command"`, `"mcp"` (with optional `fileRegex` restrictions) |

**Orchestrator delegation:** Uses `new_task` tool with `mode` (target mode slug) and `message` (full instructions). Subtask runs in isolated context, returns summary via `attempt_completion`. Orchestrator has no direct tool access by default — only delegates.

**Built-in modes:** Code (full tools), Ask (read-only), Architect (read + markdown edit), Debug (full tools), Orchestrator (delegates only).

**Notable:** Different model from other agents — uses "modes" not "agents". No MD+YAML frontmatter agent files. Orchestrator has no tools itself (prevents context poisoning). Context isolation is strict — all context must be explicitly passed in `message`. Supports `.agents/skills/` cross-agent skill path.

---

### Cross-Agent Format Summary

| Agent          | Format             | Project Path            | User Path                        | Required Fields                           |
| -------------- | ------------------ | ----------------------- | -------------------------------- | ----------------------------------------- |
| Claude Code    | MD + YAML          | `.claude/agents/*.md`   | `~/.claude/agents/*.md`          | name, description                         |
| GitHub Copilot | MD + YAML          | `.github/agents/*.md`   | VS Code profile dir              | description                               |
| Codex          | TOML               | `.codex/agents/*.toml`  | `~/.codex/agents/*.toml`         | name, description, developer_instructions |
| Cursor         | MD + YAML          | `.cursor/agents/*.md`   | `~/.cursor/agents/*.md`          | name, description                         |
| Gemini CLI     | MD + YAML          | `.gemini/agents/*.md`   | `~/.gemini/agents/*.md`          | name, description                         |
| OpenCode       | JSONC or MD + YAML | `.opencode/agents/*.md` | `~/.config/opencode/agents/*.md` | description                               |
| Augment        | MD + YAML          | `.augment/agents/*.md`  | `~/.augment/agents/*.md`         | name                                      |
| Junie          | MD + YAML          | `.junie/agents/*.md`    | `~/.junie/agents/*.md`           | description                               |
| Kilo Code      | JSONC or MD + YAML | `.kilo/agents/*.md`     | `~/.config/kilo/agents/*.md`     | description                               |
| Kiro (IDE)     | MD + YAML          | `.kiro/agents/*.md`     | `~/.kiro/agents/*.md`            | name                                      |
| Kiro (CLI)     | JSON               | `.kiro/agents/*.json`   | `~/.kiro/agents/*.json`          | name                                      |
| Roo Code       | YAML or JSON       | `.roomodes`             | `settings/custom_modes.yaml`     | slug, name, roleDefinition, groups        |

### Cross-Agent Feature Matrix

| Feature           | Claude Code  | Copilot       | Codex        | Cursor               | Gemini CLI     | OpenCode       | Augment     | Junie                                   | Kilo           | Kiro           | Roo            |
| ----------------- | ------------ | ------------- | ------------ | -------------------- | -------------- | -------------- | ----------- | --------------------------------------- | -------------- | -------------- | -------------- |
| Auto-delegation   | description  | context       | natural lang | description          | description    | Task tool      | auto-detect | description                             | Task tool      | description    | Orchestrator   |
| Manual invocation | `@"name"`    | dropdown      | `/agent`     | —                    | `@name`        | `@name`        | by name     | —                                       | `@name`        | `/name`        | `new_task`     |
| Tool control      | allow+deny   | allow+aliases | sandbox enum | readonly bool        | wildcards      | permission obj | allow+deny  | allow+deny                              | permission obj | allow+settings | groups+regex   |
| MCP servers       | yes          | cloud only    | yes          | —                    | yes (isolated) | —              | —           | —                                       | —              | yes (CLI)      | —              |
| Background mode   | yes          | —             | —            | yes (worktree)       | —              | —              | parallel    | —                                       | —              | —              | —              |
| Model override    | yes          | yes           | yes          | yes                  | yes            | yes            | yes         | yes                                     | yes            | yes            | —              |
| Recursion         | no (depth 1) | —             | configurable | —                    | no (depth 1)   | Task tool      | parallel    | —                                       | Task tool      | configurable   | via `new_task` |
| Fallback paths    | —            | —             | —            | `.claude/`,`.codex/` | —              | —              | —           | imports `.claude/`,`.cursor/`,`.codex/` | `.opencode/`   | —              | —              |

---

## Appendix: AXM Managed Format (Draft)

### Manifest File

**Filename:** `axm-subagent.json`

Following the existing convention (`axm-skill.json`, `axm-command.json`, `axm-mcp-server.json`), the subagent manifest uses the same common fields plus subagent-specific metadata.

```jsonc
{
  // --- Common fields (shared with all extension types) ---
  "owner": "@acme",
  "name": "code-reviewer",
  "version": "1.0.0",
  "type": "subagent",
  "description": "Reviews code for style, correctness, and security issues",
  "keywords": ["review", "lint", "security"],
  "license": "MIT",
  "repository": "https://github.com/acme/subagents",
  "authors": [{ "name": "Acme Corp" }],

  // --- Subagent-specific fields ---

  // Model hint — agents map this to their native model field.
  // Not a concrete model ID; the agent adapter resolves it.
  // Values: "fast" | "default" | "powerful" | "inherit"
  "model": "default",

  // Tool access constraints — portable abstraction over agent-native
  // tool control (allow/deny lists, readonly, sandbox_mode, permission).
  "toolAccess": "full", // "full" | "readonly" | "none"

  // Whether this subagent can run in the background (async).
  // Only rendered for agents that support it (Claude Code, Cursor).
  "background": false,

  // Optional list of agents this subagent is compatible with.
  // Omit to install for all configured agents. Useful when the
  // instructions use agent-specific features.
  "agents": ["claude-code", "cursor", "gemini-cli"],
}
```

### FQN

```
@acme/subagents/code-reviewer
```

`ExtensionTypePlural` gains `"subagents"`. The FQN regex pattern extends to include the new segment.

### Directory Layout

```
.axm/extensions/@acme/subagents/code-reviewer/
  axm-subagent.json          # Manifest (metadata, version, portable config)
  src/
    SUBAGENT.md              # Instructions — Markdown body becomes the system prompt
```

**`SUBAGENT.md`** is the canonical content file (analogous to `SKILL.md` for skills). It uses YAML frontmatter for portable metadata and a Markdown body for the system prompt / instructions.

```markdown
---
name: code-reviewer
description: Reviews code for style, correctness, and security issues. Delegate when the user asks for a code review, PR review, or style check.
model: default
toolAccess: readonly
background: false
---

You are a code review specialist. Review code changes for:

1. Style violations against the project's conventions
2. Potential bugs and logic errors
3. Security vulnerabilities (OWASP top 10)
4. Performance anti-patterns

## Output format

Present each finding as a numbered item with:

- **File and line** — location of the issue
- **Severity** — error, warning, or info
- **Finding** — what was observed
- **Suggestion** — how to fix it
```

### Relationship: Manifest vs Content File

| Concern               | `axm-subagent.json`                         | `SUBAGENT.md`                                     |
| --------------------- | ------------------------------------------- | ------------------------------------------------- |
| Purpose               | Registry metadata, version, ownership       | Agent-facing content                              |
| Read by               | AXM CLI, registry, pack resolution          | Agent adapters during rendering                   |
| Contains              | owner, name, version, type, portable config | frontmatter (portable config) + instructions body |
| Published to registry | Yes                                         | Yes (as content artifact)                         |

The frontmatter in `SUBAGENT.md` mirrors the subagent-specific fields from the manifest. During `axm subagents new`, both files are scaffolded in sync. During publish, both are included. During install, the agent adapter reads `SUBAGENT.md` and renders it into the agent-native format.

### Installation — Symlink vs Render

Skills use **symlinks** from the agent's skills directory to the managed extension source. Subagents cannot use symlinks because each agent expects a different file format and field set. Instead, subagents use a **render-on-install** strategy:

1. AXM stores the canonical `SUBAGENT.md` in `.axm/extensions/...`
2. On install (and on `axm sync`), AXM **renders** agent-native files into each agent's directory
3. Rendered files include an AXM header comment marking them as managed (do not edit)
4. On uninstall, AXM removes the rendered files
5. On sync, AXM re-renders to pick up any changes

```
.axm/extensions/@acme/subagents/code-reviewer/    # canonical source
  axm-subagent.json
  src/SUBAGENT.md

.claude/agents/code-reviewer.md                    # rendered for Claude Code
.github/agents/code-reviewer.md                    # rendered for Copilot
.codex/agents/code-reviewer.toml                   # rendered for Codex
.cursor/agents/code-reviewer.md                    # rendered for Cursor
.gemini/agents/code-reviewer.md                    # rendered for Gemini CLI
.opencode/agents/code-reviewer.md                  # rendered for OpenCode
.augment/agents/code-reviewer.md                   # rendered for Augment
.junie/agents/code-reviewer.md                     # rendered for Junie
.kilo/agents/code-reviewer.md                      # rendered for Kilo Code
.kiro/agents/code-reviewer.md                      # rendered for Kiro (IDE)
.kiro/agents/code-reviewer.json                    # rendered for Kiro (CLI)
.roomodes                                          # rendered for Roo Code (merged into modes file)
```

### Agent Adapter Rendering Strategy

Each agent adapter translates the portable manifest into its native format. The portable schema is intentionally minimal — it captures the common subset, and each adapter maps to agent-native fields where supported (or omits them where not).

#### Portable → Claude Code (`.claude/agents/<name>.md`)

```yaml
# Frontmatter mapping:
name: → name # direct
description: → description # direct
model: → model (fast→haiku, default→inherit, powerful→opus)
toolAccess: → tools/disallowedTools # readonly → disallowedTools: Edit,Write,Bash
background: → background # direct
# Body:       → markdown body                 # direct
```

Claude Code has the richest native schema. Fields like `permissionMode`, `hooks`, `skills`, `mcpServers`, `isolation`, `effort`, `memory`, and `color` have no portable equivalent — they can be set via agent-specific overrides (see below).

#### Portable → GitHub Copilot (`.github/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model (fast→fast model, default→omit, powerful→powerful model)
toolAccess:
  → tools # readonly → tools: ["read", "search"]
  # none → tools: []
background: → (not supported, omitted)
# Body:       → markdown body                 # direct (max 30,000 chars)
```

#### Portable → Codex (`.codex/agents/<name>.toml`)

```toml
# TOML mapping:
name                  = "name"                    # direct
description           = "description"             # direct
developer_instructions = "<markdown body>"        # body becomes this field
# model:              → model                     # mapped
# toolAccess:         → sandbox_mode              # readonly → "read-only", full → omit
# background:         → (not supported)
```

Codex is the only agent requiring TOML rendering. The Markdown body maps to `developer_instructions` (a required TOML string field).

#### Portable → Cursor (`.cursor/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model (fast→"fast", default→"inherit", powerful→specific ID)
toolAccess: → readonly # readonly → readonly: true
background: → is_background # field name differs
# Body:       → markdown body                 # direct
```

#### Portable → Gemini CLI (`.gemini/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model # mapped to Gemini model IDs
toolAccess: → tools # readonly → read-only tool list
background: → (not supported, omitted)
# Body:       → markdown body                 # direct
```

#### Portable → OpenCode (`.opencode/agents/<name>.md`)

```yaml
description: → description # direct (name derived from filename)
model: → model # mapped to provider/model-id format
toolAccess:
  → permission # readonly → edit: deny, bash: deny
  # none → edit: deny, bash: deny, task: deny
background: → (not supported, omitted)
mode: → always "subagent" # AXM-managed subagents are always subagent mode
# Body:       → markdown body (or prompt)     # direct
```

#### Portable → Augment (`.augment/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model # mapped to Augment model names
toolAccess:
  → tools/disabled_tools # readonly → disabled_tools: [str-replace-editor,save-file,remove-files,launch-process]
  # none → tools: [] (empty allowlist)
background: → (parallel by default, no field needed)
# Body:       → markdown body                 # direct
```

#### Portable → Junie (`.junie/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model # mapped (sonnet, opus, grok, etc.)
toolAccess:
  → tools/disallowedTools # readonly → disallowedTools: [Write, Edit, Bash]
  # same pattern as Claude Code
background: → (not supported, omitted)
# Body:       → markdown body                 # direct
```

Junie's schema is a close subset of Claude Code's — same `tools`/`disallowedTools` pattern and `skills` injection.

#### Portable → Kilo Code (`.kilo/agents/<name>.md`)

```yaml
description: → description # direct (name derived from filename)
model: → model # mapped to provider/model-id format
toolAccess:
  → permission # readonly → edit: deny, bash: deny
  # same pattern as OpenCode
background: → (not supported, omitted)
mode: → always "subagent" # AXM-managed subagents are always subagent mode
# Body:       → markdown body                 # direct
```

Kilo is built on OpenCode — identical rendering strategy.

#### Portable → Kiro IDE (`.kiro/agents/<name>.md`)

```yaml
name: → name # direct
description: → description # direct
model: → model # mapped to Kiro model names
toolAccess:
  → tools # readonly → tools: [read, web]
  # none → tools: [] (empty)
background: → (not supported, omitted)
# Body:       → markdown body                 # direct
```

#### Portable → Kiro CLI (`.kiro/agents/<name>.json`)

```json
// JSON mapping:
name:         → "name"                        // direct
description:  → "description"                 // direct
model:        → "model"                       // mapped
toolAccess:   → "tools"                       // readonly → ["read", "web", "knowledge"]
                                              // none → []
background:   → (not supported)
// Body:      → "prompt"                      // body becomes prompt field
```

Kiro CLI uses JSON — the Markdown body maps to the `prompt` string field (or `file://` URI for external files).

#### Portable → Roo Code (merged into `.roomodes`)

```yaml
# Roo uses custom modes, not agent files. AXM renders a mode entry:
slug: → name (kebab-case) # from subagent name
name: → name (display) # from subagent name
description: → description # direct
roleDefinition: → first paragraph of body # extracted from instructions
customInstructions: → remainder of body # rest of instructions
whenToUse: → description # reused for delegation
groups:
  → mapped from toolAccess # full → [read,edit,command,mcp]
  # readonly → [read,mcp]
  # none → [read]
```

Roo is unique — it uses YAML/JSON modes rather than MD agent files. AXM merges a mode entry into the `.roomodes` file. The Orchestrator delegates to this mode via `new_task`.

### Agent-Specific Overrides

The portable schema covers the common subset. For agent-specific features, the manifest supports an optional `overrides` map keyed by agent ID:

```jsonc
// In SUBAGENT.md frontmatter or axm-subagent.json:
{
  "overrides": {
    "claude-code": {
      "permissionMode": "acceptEdits",
      "effort": "high",
      "isolation": "worktree",
      "skills": ["effect-basics"],
      "maxTurns": 50,
    },
    "gemini-cli": {
      "temperature": 0.3,
      "max_turns": 50,
      "timeout_mins": 15,
    },
    "codex": {
      "sandbox_mode": "workspace-write",
      "model_reasoning_effort": "high",
    },
    "opencode": {
      "permission": {
        "edit": "allow",
        "bash": { "*": "ask", "git *": "allow" },
      },
      "steps": 100,
    },
    "augment": {
      "color": "yellow",
    },
    "junie": {
      "skills": ["effect-basics"],
      "allowPromptArgument": true,
    },
    "kilo": {
      "permission": {
        "task": { "code-reviewer": "allow" },
      },
      "steps": 100,
    },
    "kiro": {
      "includeMcpJson": true,
      "toolsSettings": {
        "subagent": { "trustedAgents": ["code-reviewer"] },
      },
    },
    "roo": {
      "groups": ["read", ["edit", { "fileRegex": "\\.(md|mdx)$" }]],
    },
  },
}
```

Overrides are merged on top of the portable fields during rendering. They use the **agent-native field names** — no translation needed. This keeps the portable schema simple while enabling full agent-native customization when needed.

### Model Mapping

The portable `model` field uses abstract tiers that each adapter resolves to agent-native values:

| Portable     | Claude Code | Copilot    | Codex      | Cursor        | Gemini CLI  | OpenCode/Kilo | Augment    | Junie    | Kiro       | Roo |
| ------------ | ----------- | ---------- | ---------- | ------------- | ----------- | ------------- | ---------- | -------- | ---------- | --- |
| `"fast"`     | `haiku`     | (fast)     | (fast)     | `"fast"`      | (flash)     | (fast)        | (fast)     | (fast)   | (fast)     | —   |
| `"default"`  | `inherit`   | (omit)     | (omit)     | `"inherit"`   | `"inherit"` | (omit)        | (omit)     | (omit)   | (omit)     | —   |
| `"powerful"` | `opus`      | (powerful) | (powerful) | (specific ID) | (pro)       | (powerful)    | (powerful) | `"opus"` | (powerful) | —   |
| `"inherit"`  | `inherit`   | (omit)     | (omit)     | `"inherit"`   | `"inherit"` | (omit)        | (omit)     | (omit)   | (omit)     | —   |

Concrete model IDs (e.g. `claude-opus-4-6`) pass through verbatim for agents that support them. Agents that don't recognize the ID fall back to their default. Roo modes don't have a model field.

### Tool Access Mapping

The portable `toolAccess` field maps to each agent's native access control:

| Portable     | Claude Code         | Copilot             | Codex         | Cursor           | Gemini CLI  | OpenCode/Kilo                           | Augment              | Junie                 | Kiro         | Roo                       |
| ------------ | ------------------- | ------------------- | ------------- | ---------------- | ----------- | --------------------------------------- | -------------------- | --------------------- | ------------ | ------------------------- |
| `"full"`     | (omit)              | `["*"]`             | (omit)        | (omit)           | (omit)      | (omit)                                  | (omit)               | (omit)                | (omit)       | `[read,edit,command,mcp]` |
| `"readonly"` | `disallowedTools:…` | `["read","search"]` | `"read-only"` | `readonly: true` | (read list) | `{edit:"deny",bash:"deny"}`             | `disabled_tools:[…]` | `disallowedTools:[…]` | `[read,web]` | `[read,mcp]`              |
| `"none"`     | `tools: ""`         | `[]`                | `"read-only"` | `readonly: true` | `[]`        | `{edit:"deny",bash:"deny",task:"deny"}` | `tools: []`          | `tools: []`           | `[]`         | `[read]`                  |

### Pack Integration

Packs gain a `subagents` field alongside existing `skills`, `commands`, and `mcp-servers`:

```jsonc
// axm-pack.json
{
  "type": "pack",
  "name": "frontend-tools",
  "version": "1.0.0",
  "owner": "@acme",
  "skills": { "@acme/skills/react-patterns": "^1.0.0" },
  "subagents": { "@acme/subagents/code-reviewer": "^1.0.0" },
  "mcp-servers": { "@acme/mcp-servers/figma": "^2.0.0" },
}
```

### Settings Integration

`settings.json` gains a `subagents` map:

```jsonc
{
  "agents": ["claude-code", "cursor", "gemini-cli"],
  "skills": {
    "code-review": {
      /* ... */
    },
  },
  "subagents": {
    "code-reviewer": {
      "source": "@acme/subagents/code-reviewer@1.0.0",
      "enabled": true,
    },
  },
}
```

### Reconciliation Flow

`axm sync` reconciles subagents across all configured agents:

1. Read `settings.json` → resolve enabled subagents
2. For each subagent, read `.axm/extensions/.../SUBAGENT.md`
3. For each configured agent, **render** the agent-native file into the agent's `agents/` directory
4. Remove rendered files for subagents no longer in settings
5. Each rendered file includes a managed header: `<!-- managed by axm — do not edit -->` (or TOML equivalent `# managed by axm — do not edit`)
