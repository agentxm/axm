# Agent Subagent Reference

Companion reference for the [subagent-support proposal](./proposal.md). Contains detailed per-agent field tables, file paths, built-in subagents, and notable behaviors for all 11 in-scope agents plus 4 out-of-scope agents with subagent support.

> **Sourcing methodology.** Field tables are sourced from official documentation where available. Fields documented from community sources, changelogs, or source code inspection are noted with a confidence indicator where certainty varies (see Cursor section for an example). Documentation URLs were verified at time of writing; agent ecosystems move fast and links may drift.

## Agent Inventory

All agents in the AXM registry, showing subagent support status and whether they are in scope for this change. In-scope agents have detailed reference sections (A–K) below. Out-of-scope agents with subagent support are candidates for follow-on rendering adapters.

| Agent          | Subagent Support   | Format                      | In Scope | Detail                  | Subagent Docs                                                                               |
| -------------- | ------------------ | --------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Claude Code    | Yes                | MD + YAML                   | **Yes**  | [A](#a-claude-code)     | [code.claude.com](https://code.claude.com/docs/en/sub-agents)                               |
| GitHub Copilot | Yes                | MD + YAML                   | **Yes**  | [B](#b-github-copilot)  | [docs.github.com](https://docs.github.com/en/copilot/reference/custom-agents-configuration) |
| Codex          | Yes                | TOML                        | **Yes**  | [C](#c-openai-codex)    | [developers.openai.com](https://developers.openai.com/codex/subagents)                      |
| Cursor         | Yes                | MD + YAML                   | **Yes**  | [D](#d-cursor)          | [cursor.com](https://cursor.com/docs/context/subagents)                                     |
| Gemini CLI     | Yes                | MD + YAML                   | **Yes**  | [E](#e-gemini-cli)      | [geminicli.com](https://geminicli.com/docs/core/subagents/)                                 |
| OpenCode       | Yes                | JSONC or MD + YAML          | **Yes**  | [F](#f-opencode)        | [opencode.ai](https://opencode.ai/docs/agents/)                                             |
| Augment        | Yes                | MD + YAML                   | **Yes**  | [G](#g-augment-code)    | [docs.augmentcode.com](https://docs.augmentcode.com/cli/subagents)                          |
| Junie          | Yes                | MD + YAML                   | **Yes**  | [H](#h-junie-jetbrains) | [junie.jetbrains.com](https://junie.jetbrains.com/docs/junie-cli-subagents.html)            |
| Kilo Code      | Yes                | JSONC or MD + YAML          | **Yes**  | [I](#i-kilo-code)       | [kilo.ai](https://kilo.ai/docs/customize/custom-subagents)                                  |
| Kiro           | Yes                | MD + YAML (IDE), JSON (CLI) | **Yes**  | [J](#j-kiro-aws)        | [kiro.dev](https://kiro.dev/docs/chat/subagents/)                                           |
| Roo Code       | Yes                | YAML or JSON                | **Yes**  | [K](#k-roo-code)        | [docs.roocode.com](https://docs.roocode.com/features/boomerang-tasks)                       |
| AdaL           | Unknown            | —                           | No       | —                       | [docs.sylph.ai](https://docs.sylph.ai/)                                                     |
| Amp            | Yes                | —                           | No       | [L](#l-amp)             | [ampcode.com](https://ampcode.com/agents-for-the-agent)                                     |
| Antigravity    | Partial            | —                           | No       | —                       | [antigravity.google](https://antigravity.google/docs/agent)                                 |
| Cline          | Yes (experimental) | —                           | No       | —                       | [docs.cline.bot](https://docs.cline.bot/features/subagents)                                 |
| CodeBuddy      | Yes                | —                           | No       | —                       | [codebuddy.ai](https://www.codebuddy.ai/docs/cli/sub-agents)                                |
| Command Code   | No                 | —                           | No       | —                       | [commandcode.ai](https://commandcode.ai/)                                                   |
| Continue       | Yes                | —                           | No       | —                       | [github.com](https://github.com/continuedev/continue/issues/9550)                           |
| Crush          | Partial            | —                           | No       | —                       | [github.com](https://github.com/charmbracelet/crush)                                        |
| Droid          | Yes                | —                           | No       | —                       | [docs.factory.ai](https://docs.factory.ai/cli/configuration/custom-droids)                  |
| Goose          | Yes                | —                           | No       | [M](#m-goose)           | [block.github.io](https://block.github.io/goose/docs/guides/subagents/)                     |
| iFlow CLI      | Yes (EOL)          | —                           | No       | —                       | [platform.iflow.cn](https://platform.iflow.cn/en/cli/examples/subagent)                     |
| Kimi CLI       | Yes                | YAML                        | No       | [N](#n-kimi-cli)        | [moonshotai.github.io](https://moonshotai.github.io/kimi-cli/en/customization/agents.html)  |
| Kode           | Yes                | —                           | No       | —                       | [github.com](https://github.com/shareAI-lab/Kode-cli)                                       |
| MCPJam         | N/A                | —                           | No       | —                       | [mcpjam.com](https://www.mcpjam.com)                                                        |
| Mistral Vibe   | Yes                | —                           | No       | —                       | [docs.mistral.ai](https://docs.mistral.ai/mistral-vibe/agents-skills)                       |
| Mux            | Yes                | —                           | No       | —                       | [mux.coder.com](https://mux.coder.com/agents)                                               |
| Neovate        | Yes                | —                           | No       | —                       | [neovateai.dev](https://neovateai.dev/en/docs/features)                                     |
| OpenClaw       | Yes                | JSON5                       | No       | [O](#o-openclaw)        | [docs.openclaw.ai](https://docs.openclaw.ai/tools/subagents)                                |
| OpenHands      | Yes                | —                           | No       | —                       | [docs.openhands.dev](https://docs.openhands.dev/sdk/guides/agent-delegation)                |
| Pi             | No                 | —                           | No       | —                       | [github.com](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)           |
| Pochi          | No                 | —                           | No       | —                       | [docs.getpochi.com](https://docs.getpochi.com/custom-agent/)                                |
| Qoder          | Yes                | —                           | No       | —                       | [docs.qoder.com](https://docs.qoder.com/user-guide/chat/experts-mode)                       |
| Qwen Code      | Yes                | —                           | No       | —                       | [qwenlm.github.io](https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/)   |
| Replit         | Partial            | —                           | No       | —                       | [replit.com](https://replit.com/agent4)                                                     |
| Trae           | Yes                | —                           | No       | —                       | [docs.trae.ai](https://docs.trae.ai/ide/agent)                                              |
| Trae CN        | Yes                | —                           | No       | —                       | [docs.trae.ai](https://docs.trae.ai/ide/agent)                                              |
| Windsurf       | Partial            | —                           | No       | —                       | [windsurf.com](https://windsurf.com/blog/windsurf-wave-13)                                  |
| Zencoder       | Yes                | —                           | No       | —                       | [docs.zencoder.ai](https://docs.zencoder.ai/features/ai-agents)                             |

**30 of 39** agents fully support subagents; **4** have partial support (Antigravity, Crush, Replit, Windsurf). 11 are in scope for this change; 4 with non-file-based architectures (Amp, Goose, Kimi CLI, OpenClaw) have reference sections below but are out of scope for render-on-install. Notable exceptions: **MCPJam** is an MCP platform (N/A); **Pi**, **Pochi**, and **Command Code** lack native support; **AdaL** has no documented support; **iFlow CLI** supports subagents but is EOL (service shutdown April 17, 2026). Many out-of-scope agents use MD + YAML in `.<agent>/agents/*.md` — follow-on adapters would be mechanically similar.

## Cross-Agent Feature Matrix

The **AXM portable** column shows which features the portable schema covers directly. Features marked "override" require per-agent `overrides`; "—" means the feature is not modeled by AXM. Amp, Goose, Kimi CLI, and OpenClaw columns are included for reference but are out of scope for this change.

| Feature           | AXM portable | Claude Code  | Copilot       | Codex        | Cursor               | Gemini CLI     | OpenCode       | Augment     | Junie                                   | Kilo           | Kiro           | Roo            | Amp                | Goose         | Kimi CLI             | OpenClaw           |
| ----------------- | ------------ | ------------ | ------------- | ------------ | -------------------- | -------------- | -------------- | ----------- | --------------------------------------- | -------------- | -------------- | -------------- | ------------------ | ------------- | -------------------- | ------------------ |
| Auto-delegation   | description  | description  | context       | natural lang | description          | description    | Task tool      | auto-detect | description                             | Task tool      | description    | Orchestrator   | model-driven       | model-driven  | model-driven         | explicit only      |
| Manual invocation | —            | `@"name"`    | dropdown      | `/agent`     | —                    | `@name`        | `@name`        | by name     | —                                       | `@name`        | `/name`        | `new_task`     | —                  | natural lang  | —                    | `/subagents spawn` |
| Tool control      | toolAccess   | allow+deny   | allow+aliases | sandbox enum | readonly bool        | wildcards      | permission obj | allow+deny  | allow+deny                              | permission obj | allow+settings | groups+regex   | permissions+checks | extensions+NL | explicit list        | allow+deny         |
| MCP servers       | override     | yes          | cloud only    | yes          | —                    | yes (isolated) | —              | —           | —                                       | —              | yes (CLI)      | —              | via skills         | inherited     | —                    | —                  |
| Background mode   | background   | yes          | —             | —            | yes (worktree)       | —              | —              | parallel    | —                                       | —              | —              | —              | —                  | —             | yes                  | yes (always)       |
| Model override    | model        | yes          | yes           | yes          | yes                  | yes            | yes            | yes         | yes                                     | yes            | yes            | —              | —                  | yes (recipe)  | yes                  | yes                |
| Recursion         | —            | no (depth 1) | —             | configurable | —                    | no (depth 1)   | Task tool      | parallel    | —                                       | Task tool      | configurable   | via `new_task` | —                  | no (depth 1)  | no (depth 1)         | configurable (1–5) |
| Fallback paths    | —            | —            | —             | —            | `.claude/`,`.codex/` | —              | —              | —           | imports `.claude/`,`.cursor/`,`.codex/` | `.opencode/`   | —              | —              | `.claude/skills/`  | —             | `.claude/`,`.codex/` | —                  |

## A. Claude Code

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

## B. GitHub Copilot

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

## C. OpenAI Codex

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

**All fields:**

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

## D. Cursor

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

**All frontmatter fields:**

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

## E. Gemini CLI

**Docs:**

- [Subagents](https://geminicli.com/docs/core/subagents/) (docs site)
- [GitHub source](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md)

**Format:** Markdown with YAML frontmatter. Filename is not significant; the `name` field is the identifier.

**File paths:**

| Scope   | Path                    |
| ------- | ----------------------- |
| Project | `.gemini/agents/*.md`   |
| User    | `~/.gemini/agents/*.md` |

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

## F. OpenCode

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

## G. Augment Code

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

## H. Junie (JetBrains)

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

## I. Kilo Code

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

## J. Kiro (AWS)

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

**Notable:** Only agent with a dual IDE/CLI format split (MD vs JSON). CLI has the richest config: lifecycle hooks, knowledge bases, tool aliases, keyboard shortcuts, and granular `availableAgents`/`trustedAgents` glob patterns for subagent delegation control. IDE subagents cannot access Specs and hooks don't trigger inside them.

---

## K. Roo Code

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

**Built-in modes:** Code (full tools), Ask (read-only), Architect (read + markdown edit), Debug (full tools), Orchestrator (delegates only).

**Notable:** Different model from other agents — uses "modes" not "agents". No MD+YAML frontmatter agent files. Orchestrator has no tools itself (prevents context poisoning). Context isolation is strict — all context must be explicitly passed in `message`. Supports `.agents/skills/` cross-agent skill path.

---

## L. Amp

**Docs:**

- [Agents for the Agent](https://ampcode.com/agents-for-the-agent) (blog post introducing subagent support)
- [Owner's Manual](https://ampcode.com/manual) (canonical reference; covers skills, checks, Task tool, AGENTS.md, modes)

**Format:** No user-defined subagent files. Subagents are spawned dynamically by the model via the built-in **Task tool**. The closest analogs are **skills** (`SKILL.md` with YAML frontmatter) that load instructions on demand, and **checks** (Markdown with YAML frontmatter in `.agents/checks/`) that each run as an isolated subagent during code review.

**File paths:**

| Scope          | Path                                                                      | Notes                                                   |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Project skills | `.agents/skills/<name>/SKILL.md`                                          | also reads `.claude/skills/`                            |
| Global skills  | `~/.config/agents/skills/`, `~/.config/amp/skills/`, `~/.claude/skills/`  | precedence: `agents/` > `amp/` > `.claude/`             |
| Project checks | `.agents/checks/*.md`                                                     | subtree-scoped (e.g. `api/.agents/checks/`)             |
| Global checks  | `~/.config/amp/checks/`, `~/.config/agents/checks/`                       | apply to all repos                                      |
| Agent guidance | `AGENTS.md` (or `AGENT.md`, `CLAUDE.md`) in CWD and parents up to `$HOME` | glob-scoped via `globs:` frontmatter                    |
| MCP in skills  | `<skill-dir>/mcp.json`                                                    | servers start at launch; tools hidden until skill loads |

**Skill fields (SKILL.md frontmatter):**

| Field         | Required | Type   | Notes                                                        |
| ------------- | -------- | ------ | ------------------------------------------------------------ |
| `name`        | Yes      | string | unique identifier; user-wide skills override project by name |
| `description` | Yes      | string | always visible to model; determines when skill is invoked    |

**Check fields (check file frontmatter):**

| Field              | Required | Type     | Notes                                     |
| ------------------ | -------- | -------- | ----------------------------------------- |
| `name`             | Yes      | string   | check identifier                          |
| `description`      | No       | string   | explains what the check looks for         |
| `severity-default` | No       | string   | `low` \| `medium` \| `high` \| `critical` |
| `tools`            | No       | string[] | tool names the check subagent can access  |

**Built-in subagents:**

| Name      | Purpose                                 | Tool access                          |
| --------- | --------------------------------------- | ------------------------------------ |
| Task      | Complex tasks, parallel work            | full (same as main agent)            |
| Librarian | Cross-repository code search            | read-only                            |
| Oracle    | Second opinion using GPT-5.4            | not documented                       |
| Painter   | Image generation via Gemini 3 Pro Image | not documented                       |
| Checks    | One per check during code review        | restricted via check's `tools` field |

**Notable:** No user-defined subagent definition files — no equivalent to `.claude/agents/*.md`. The Task tool spawns generic subagents with the main agent's full capabilities; the model decides the task via prompt. Each subagent gets a fresh context window (full isolation). Subagents cannot communicate with each other and return only a final summary. Skills serve as the closest analog to named subagents — instruction packages that load on demand and can bundle MCP servers. The checks system is the only place where user-defined subagent-like behavior exists (per-check isolated execution with tool restrictions). AXM portable schema has no direct render target; closest mapping would be a skill directory or check file, neither of which covers the full subagent concept.

---

## M. Goose

**Docs:**

- [Subagents](https://block.github.io/goose/docs/guides/subagents/) (canonical guide — spawning, settings, security, recipes)
- [Recipes](https://block.github.io/goose/docs/guides/recipes/) (reusable workflow definitions including subagent recipes)
- [Prompt Templates](https://block.github.io/goose/docs/guides/prompt-templates) (customizing `subagent_system.md`)
- [Permissions](https://block.github.io/goose/docs/guides/goose-permissions) (autonomy modes that gate subagent spawning)
- [Config Files](https://block.github.io/goose/docs/guides/config-files) (external subagent config in `config.yaml`)

**Format:** No per-file agent definitions. Subagents are either (a) spawned dynamically via natural language by the model, or (b) defined as YAML recipe files with structured fields. External subagents (e.g., Codex as a subprocess) are configured in `config.yaml` as MCP server extension entries.

**File paths:**

| Scope                  | Path                                         | Notes                                                |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Subagent system prompt | `~/.config/goose/prompts/subagent_system.md` | Jinja2 template; overrides built-in default          |
| Recipe files           | `GOOSE_RECIPE_PATH` or working directory     | YAML recipes that can define subagent behavior       |
| External subagent      | `~/.config/goose/config.yaml`                | `stdio`-type entries for external agent subprocesses |
| Global config          | `~/.config/goose/config.yaml`                | provider, model, extensions, settings                |

**Recipe fields (YAML):**

| Field                | Required | Type     | Notes                                                                      |
| -------------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `version`            | No       | string   | semver; defaults to `1.0.0`                                                |
| `title`              | Yes      | string   | display name                                                               |
| `description`        | Yes      | string   | purpose description                                                        |
| `instructions`       | No       | string   | behavioral guidelines for the agent                                        |
| `activities`         | No       | string[] | task descriptions                                                          |
| `extensions`         | No       | object[] | available tools; each has `type`, `name`, `cmd`, `args`, `available_tools` |
| `parameters`         | No       | object[] | input config with `key`, `input_type`, `requirement`, `default`            |
| `prompt`             | No       | string   | execution template with `{{variable}}` substitution                        |
| `sub_recipes`        | No       | object[] | nested subrecipe definitions (auto-generated as tools)                     |
| `settings.max_turns` | No       | number   | turn limit override (default: 25)                                          |

**External subagent config fields (in `config.yaml`):**

| Field         | Required | Type     | Notes                                              |
| ------------- | -------- | -------- | -------------------------------------------------- |
| `name`        | Yes      | string   | identifier                                         |
| `description` | No       | string   | human-readable purpose                             |
| `cmd`         | Yes      | string   | executable command (e.g., `codex`)                 |
| `args`        | No       | string[] | command arguments                                  |
| `type`        | Yes      | string   | `"stdio"` or `"mcp-server"` (MCP-style subprocess) |
| `timeout`     | No       | number   | seconds (default: 300)                             |
| `env_keys`    | No       | string[] | required env vars (e.g., `[OPENAI_API_KEY]`)       |

**Notable:** No project-directory agent files — no `.goose/agents/*.md` convention; subagents are runtime-only or recipe-defined. Tool control is via natural language at spawn time or the `available_tools` field on recipe extensions. External subagents connect via MCP server protocol, enabling tools like Codex as a subprocess. Recursion hard-blocked at depth 1 (subrecipes also cannot nest). Parallel execution supported with partial failure handling. Auto-spawning only available in completely autonomous permission mode. Recipes can be triggered via slash commands (`/command-name` mapped in config). Model override supported via recipe `settings.goose_provider`/`settings.goose_model`.

---

## N. Kimi CLI

**Docs:**

- [Agents and Subagents](https://moonshotai.github.io/kimi-cli/en/customization/agents.html) (canonical; agent files, built-in agents, subagent types, tool inventory)
- [Agent Skills](https://moonshotai.github.io/kimi-cli/en/customization/skills.html) (skill format, discovery hierarchy)
- [Hooks](https://moonshotai.github.io/kimi-cli/en/customization/hooks.html) (`SubagentStart`/`SubagentStop` lifecycle hooks)
- [kimi Command](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html) (`--agent-file`, `--agent`, `--skills-dir` flags)

**Format:** YAML agent files loaded via `--agent-file` flag. Custom agents define `version: 1` plus an `agent` object with name, system prompt path, tools, and optional subagent definitions. Subagents are defined as entries in the parent agent's YAML under the `subagents` key, each pointing to a separate agent YAML file via `path`. Agents can inherit from built-in agents (`extend: default`) or other files. System prompts are Markdown templates with variable interpolation.

**File paths:**

| Scope            | Path                                                                                                        | Notes                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Main config      | `~/.kimi/config.toml`                                                                                       | TOML; override with `--config-file`     |
| Agent file       | any path via `--agent-file`                                                                                 | YAML; mutually exclusive with `--agent` |
| Built-in agents  | `--agent default` or `--agent okabe`                                                                        | CLI flag selection only                 |
| Skills (user)    | `~/.kimi/skills/`, `~/.claude/skills/`, `~/.codex/skills/`, `~/.config/agents/skills/`, `~/.agents/skills/` | loaded automatically                    |
| Skills (project) | `.kimi/skills/`, `.claude/skills/`, `.codex/skills/`, `.agents/skills/`                                     | loaded automatically                    |

**Agent YAML fields:**

| Field                      | Required               | Type     | Notes                                                      |
| -------------------------- | ---------------------- | -------- | ---------------------------------------------------------- |
| `version`                  | Yes                    | `1`      | schema version                                             |
| `agent.name`               | Yes                    | string   | agent identifier                                           |
| `agent.extend`             | No                     | string   | inherit from `"default"` or relative path                  |
| `agent.system_prompt_path` | Yes (unless extending) | path     | Markdown template for system prompt                        |
| `agent.system_prompt_args` | No                     | map      | custom template variables injected into prompt             |
| `agent.tools`              | Yes (unless extending) | string[] | `module:ClassName` format                                  |
| `agent.exclude_tools`      | No                     | string[] | tools to remove when extending                             |
| `agent.subagents`          | No                     | map      | subagent definitions: `<name>.path` + `<name>.description` |

**Built-in subagent types:**

| Type      | Purpose                           | Tool access                                                                 |
| --------- | --------------------------------- | --------------------------------------------------------------------------- |
| `coder`   | software engineering (read/write) | Shell, ReadFile, Glob, Grep, WriteFile, StrReplaceFile, SearchWeb, FetchURL |
| `explore` | read-only exploration             | ReadFile, Glob, Grep, SearchWeb, FetchURL                                   |
| `plan`    | architecture design               | ReadFile, Glob, Grep, SearchWeb, FetchURL                                   |

**Notable:** Subagents are not standalone Markdown files with frontmatter — they are defined as entries in the parent's YAML config, each referencing a separate agent YAML file. No `@name` syntax; subagents invoked exclusively by the model via the `Agent` tool. Recursion hard-blocked at depth 1. Background mode supported (`run_in_background: true` returns task ID immediately). `SubagentStart`/`SubagentStop` lifecycle hooks enable monitoring at subagent boundaries. Python tool module system (`module:ClassName`) for tool identity. Built-in agents: `default` (general-purpose) and `okabe` (experimental with `SendDMail` checkpoint rollback).

---

## O. OpenClaw

**Docs:**

- [Sub-agents](https://docs.openclaw.ai/tools/subagents) (canonical; spawning, tool policy, announce, slash commands)
- [Configuration reference](https://docs.openclaw.ai/gateway/configuration-reference) (all `agents.defaults.subagents.*` fields)
- [Multi-agent](https://docs.openclaw.ai/concepts/multi-agent) (session isolation, agent directories, auth resolution)
- [ACP agents](https://docs.openclaw.ai/tools/acp-agents) (external harness runtime — Claude Code, Codex, Copilot, Cursor, Gemini CLI, and others via ACP)
- [Configuration examples](https://docs.openclaw.ai/gateway/configuration-examples) (orchestrator pattern recipes)

**Format:** JSON5 gateway configuration. Subagents are not standalone agent files; they are spawned sessions of agents configured in the gateway's `agents.list[]`. The `sessions_spawn` tool creates a delegated session at runtime.

**File paths:**

| Scope           | Path                                       | Notes                                                         |
| --------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Gateway config  | `openclaw.config.json5`                    | `agents.defaults.subagents.*` and `agents.list[].subagents.*` |
| Agent workspace | configured via `agents.defaults.workspace` | Bootstrap files: `AGENTS.md`, `TOOLS.md`                      |
| Agent state     | `~/.openclaw/agents/<agentId>/`            | auth, sessions, per-agent config                              |

**Gateway subagent config fields:**

| Field                 | Required | Type          | Default         | Notes                                         |
| --------------------- | -------- | ------------- | --------------- | --------------------------------------------- |
| `model`               | No       | string        | inherits caller | `provider/model-id` format                    |
| `thinking`            | No       | string        | inherits caller | thinking level override                       |
| `runTimeoutSeconds`   | No       | number        | 0 (no timeout)  | fallback when `sessions_spawn` omits timeout  |
| `maxSpawnDepth`       | No       | number (1–5)  | 1               | nesting depth; 2 enables orchestrator pattern |
| `maxChildrenPerAgent` | No       | number (1–20) | 5               | active children cap per session               |
| `maxConcurrent`       | No       | number        | 4               | global concurrency lane cap                   |
| `archiveAfterMinutes` | No       | number        | 60              | auto-archive delay; best-effort               |
| `allowAgents`         | No       | string[]      | same agent only | permitted spawn targets; `["*"]` allows any   |
| `requireAgentId`      | No       | boolean       | false           | force explicit `agentId` in spawn calls       |

**`sessions_spawn` tool parameters:**

| Parameter           | Required | Type    | Default         | Notes                                   |
| ------------------- | -------- | ------- | --------------- | --------------------------------------- |
| `task`              | Yes      | string  | —               | the task to execute                     |
| `label`             | No       | string  | —               | identifier for the run                  |
| `agentId`           | No       | string  | same agent      | target agent (must be in `allowAgents`) |
| `model`             | No       | string  | inherits config | model override                          |
| `thinking`          | No       | string  | inherits config | thinking level override                 |
| `runTimeoutSeconds` | No       | number  | config default  | abort after N seconds                   |
| `mode`              | No       | string  | `"run"`         | `"run"` or `"session"`                  |
| `cleanup`           | No       | string  | `"keep"`        | `"delete"` archives immediately         |
| `thread`            | No       | boolean | false           | request channel thread binding          |
| `sandbox`           | No       | string  | `"inherit"`     | `"inherit"` or `"require"`              |

**Tool policy (`tools.subagents.tools`):**

| Field   | Type     | Notes                                   |
| ------- | -------- | --------------------------------------- |
| `allow` | string[] | permitted tool names/groups (allowlist) |
| `deny`  | string[] | blocked tool names/groups (deny wins)   |

**Notable:** Server-side gateway architecture — no per-subagent config files; subagents are runtime-spawned sessions of configured agents. Always non-blocking (`sessions_spawn` returns run ID immediately). Configurable recursion up to depth 5 — unique among agents surveyed. Explicit invocation via `/subagents spawn` slash command; no auto-delegation. Context isolation is strict: only `AGENTS.md` + `TOOLS.md` injected; `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md` excluded. ACP harness mode delegates to 14+ external coding agents (Claude Code, Codex, Copilot, Cursor, Gemini CLI, and others). AXM's render-on-install model does not directly apply; would need gateway config mutation or override-only approach.
