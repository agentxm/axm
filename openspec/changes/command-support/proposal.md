## Why

AXM manages skills, subagents, MCP servers, and packs across coding agents — but treats **commands** as a stub extension type with no real schema, installation, or cross-agent support. Every major coding agent now supports some form of reusable prompt commands (Claude Code skills/commands, Copilot prompt files, Codex custom prompts/skills, Cursor commands, Gemini CLI custom commands, OpenCode commands, Augment custom commands, Junie custom commands, Kiro prompts, Roo Code slash commands), each with its own format, directory convention, and invocation syntax. Teams building reusable prompt commands today must manually duplicate them across agents. AXM should treat commands as a fully realized extension type — installable, publishable, and portable — just like skills.

## What Changes

- **Fleshed-out `command` extension type** with a proper manifest schema (`axm-command.json`), command-specific metadata fields, and registry support beyond the current stub.
- **Cross-agent command installation** — `axm commands install` writes agent-native command files into each agent's **commands directory**, including agents where commands are deprecated but still functional (Claude Code, Codex). AXM explicitly supports these deprecated command paths — they remain fully operational, offer a rich feature set (frontmatter, arguments, file references, shell injection, hooks), and their single-file format maps cleanly to the AXM portable model. AXM's `command` and `skill` extension types are orthogonal: commands target the commands path, skills target the skills path. If a skill and command share a name, the skill wins (by agent convention), which is desirable when a richer version exists.
  - **Markdown with YAML frontmatter** — Claude Code (`.claude/commands/`), Cursor (`.cursor/commands/`), OpenCode (`.opencode/commands/`), Augment (`.augment/commands/`), Junie (`.junie/commands/`), Roo Code (`.roo/commands/`)
  - **`.prompt.md` with YAML frontmatter** — Copilot (`.github/prompts/`)
  - **Markdown with YAML frontmatter** — Codex (`~/.codex/prompts/`)
  - **TOML** — Gemini CLI (`.gemini/commands/`)
  - **Plain text** — Kiro (`.kiro/prompts/`)
- **Command manifest schema** capturing the portable subset of command metadata: name, description, prompt body, argument definitions, and optional agent-specific hints (model override, tool restrictions, subagent forking).
- **Agent-specific rendering** — each agent adapter translates the portable manifest into its native format, mapping fields like `argument-hint`, `model`, `allowed-tools`, `context`/`subtask`, and variable substitution syntax to agent-native equivalents where supported.
- **`axm commands` command group** — `install`, `uninstall`, `list`, `new`, `publish` commands mirroring the existing skills command group.
- **Pack support** — packs can already reference commands; this change ensures commands carry full metadata for cross-agent rendering.
- **Workspace reconciliation** — `axm sync` reconciles command files across configured agents, matching the existing skill reconciliation pattern.
- **Settings integration** — `settings.json` gains a `commands` map analogous to `skills`.

## Capabilities

### New Capabilities

- `commands`: Command extension type — manifest schema, portable metadata model, argument definitions, and cross-agent rendering
- `cli-commands-install`: Install command extensions into workspace agents
- `cli-commands-uninstall`: Remove command extensions from workspace agents
- `cli-commands-list`: List installed commands and their agent mappings
- `cli-commands-new`: Scaffold a new command extension for authoring
- `cli-commands-publish`: Publish command extensions to a registry

### Modified Capabilities

- `extension-packs`: Packs gain full command metadata support (beyond the current stub) for cross-agent rendering
- `cli-init`: Init flow detects agent directories that support commands
- `cli-skills`: Skills list/status output distinguishes commands from skills in summary views

## Impact

- **Core extension model** — `CommandManifestSchema` gains command-specific fields (prompt body, arguments, agent hints). The existing `ExtensionTypeSchema`, `ExtensionTypePlural`, and FQN parsing already include `command`; no changes needed there.
- **Agent adapters** — each `CodingAgent` implementation gains `addCommand` / `removeCommand` methods and a `commandsDir` property alongside the existing `skillsDir`.
- **Agent rendering** — new per-agent renderers that translate the portable command manifest into agent-native **command** formats (not skills paths — AXM `command` and `skill` are orthogonal extension types). For agents with deprecated-but-functional command paths (Claude Code, Codex), renderers target the full feature set of the deprecated system:
  - **Markdown + YAML frontmatter** — Claude Code (`.claude/commands/`, deprecated but functional — supports frontmatter, `$ARGUMENTS`, `@file` refs, `` !`cmd` `` shell injection, hooks), Codex (`~/.codex/prompts/`), Cursor, OpenCode, Augment, Junie, Roo Code
  - **`.prompt.md` + YAML frontmatter** — Copilot
  - **TOML** — Gemini CLI
  - **Plain text** — Kiro
- **Variable substitution normalization** — the portable manifest uses a canonical argument syntax; renderers translate to each agent's native syntax (`$ARGUMENTS`, `{{args}}`, `${input:name}`, `$argName`, etc.).
- **Registry** — registry API and publish flow already support the `command` extension type; command-specific metadata fields are added to the payload.
- **Settings schema** — `SettingsSchema` adds `commands: Record<string, CommandEntry>`.
- **Workspace reconciliation** — reconciliation engine handles command install/uninstall/sync across agents.
- **Packs** — pack manifest schema and resolution logic gain full command metadata support.
- **CLI surface** — new `axm commands` parent command with install, uninstall, list, new, publish subcommands.

---

## Appendix: Agent Command Reference

> **Sourcing methodology.** Field tables are sourced from official documentation where available. Fields documented from community sources, changelogs, or source code inspection are noted with a confidence indicator where certainty varies (see Cursor section for an example). Documentation URLs were verified at time of writing; agent ecosystems move fast and links may drift.

### Agent Inventory

All agents in the AXM registry, showing command/reusable-prompt support status and whether they are in scope for this change. In-scope agents have detailed reference sections (A–K) below. Out-of-scope agents with command support are candidates for follow-on rendering adapters.

| Agent          | Command Support                             | Format             | In Scope | Detail                  | Command Docs                                                                                   |
| -------------- | ------------------------------------------- | ------------------ | -------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Claude Code    | Yes ("Commands", deprecated but functional) | MD + YAML          | **Yes**  | [A](#a-claude-code)     | [Slash commands (archived)](reference/slash-commands.md)                                       |
| GitHub Copilot | Yes ("Prompt Files")                        | MD + YAML          | **Yes**  | [B](#b-github-copilot)  | [code.visualstudio.com](https://code.visualstudio.com/docs/copilot/customization/prompt-files) |
| Codex          | Yes ("Custom Prompts", deprecated→Skills)   | MD + YAML          | **Yes**  | [C](#c-openai-codex)    | [developers.openai.com](https://developers.openai.com/codex/custom-prompts)                    |
| Cursor         | Yes                                         | MD                 | **Yes**  | [D](#d-cursor)          | [cursor.com](https://cursor.com/docs/context/commands)                                         |
| Gemini CLI     | Yes ("Custom Commands")                     | TOML               | **Yes**  | [E](#e-gemini-cli)      | [geminicli.com](https://geminicli.com/docs/cli/custom-commands/)                               |
| OpenCode       | Yes                                         | MD + YAML or JSONC | **Yes**  | [F](#f-opencode)        | [opencode.ai](https://opencode.ai/docs/commands/)                                              |
| Augment        | Yes ("Custom Slash Commands")               | MD + YAML          | **Yes**  | [G](#g-augment-code)    | [docs.augmentcode.com](https://docs.augmentcode.com/cli/custom-commands)                       |
| Junie          | Yes ("Custom Slash Commands")               | MD + YAML          | **Yes**  | [H](#h-junie-jetbrains) | [junie.jetbrains.com](https://junie.jetbrains.com/docs/custom-slash-commands.html)             |
| Kilo Code      | Yes† (undocumented)                         | MD + YAML          | **Yes**  | [I](#i-kilo-code)       | [kilo.ai](https://kilo.ai/docs/customize/skills)                                               |
| Kiro           | Yes ("Prompts")                             | Plain text         | **Yes**  | [J](#j-kiro-aws)        | [kiro.dev](https://kiro.dev/docs/cli/chat/manage-prompts/)                                     |
| Roo Code       | Yes ("Slash Commands")                      | MD + YAML          | **Yes**  | [K](#k-roo-code)        | [docs.roocode.com](https://docs.roocode.com/features/slash-commands)                           |
| AdaL           | Yes ("Slash Commands")                      | —                  | No       | —                       | [docs.sylph.ai](https://docs.sylph.ai/)                                                        |
| Amp            | Partial ("Agent Skills")                    | SKILL.md           | No       | —                       | [ampcode.com](https://ampcode.com/docs)                                                        |
| Antigravity    | Unknown                                     | —                  | No       | —                       | [antigravity.google](https://antigravity.google/)                                              |
| Cline          | Yes ("Workflows")                           | MD                 | No       | —                       | [docs.cline.bot](https://docs.cline.bot/customization/overview)                                |
| CodeBuddy      | Unknown                                     | —                  | No       | —                       | [codebuddy.ai](https://www.codebuddy.ai/)                                                      |
| Command Code   | No                                          | —                  | No       | —                       | [commandcode.ai](https://commandcode.ai/)                                                      |
| Continue       | Yes ("Prompts")                             | MD + YAML          | No       | —                       | [docs.continue.dev](https://docs.continue.dev/customize/deep-dives/prompts)                    |
| Crush          | Partial ("Agent Skills")                    | SKILL.md           | No       | —                       | [github.com](https://github.com/charmbracelet/crush)                                           |
| Droid          | Unknown                                     | —                  | No       | —                       | [docs.factory.ai](https://docs.factory.ai/)                                                    |
| Goose          | Yes ("Recipes")                             | YAML               | No       | —                       | [block.github.io](https://block.github.io/goose/)                                              |
| iFlow CLI      | Unknown                                     | —                  | No       | —                       | [platform.iflow.cn](https://platform.iflow.cn/)                                                |
| Kimi CLI       | Yes ("Slash Commands")                      | —                  | No       | —                       | [moonshotai.github.io](https://moonshotai.github.io/kimi-cli/)                                 |
| Kode           | Yes (AGENTS.md)                             | MD                 | No       | —                       | [github.com](https://github.com/shareAI-lab/Kode-cli)                                          |
| MCPJam         | N/A                                         | —                  | No       | —                       | [mcpjam.com](https://www.mcpjam.com)                                                           |
| Mistral Vibe   | Yes ("Skills")                              | SKILL.md + YAML    | No       | —                       | [docs.mistral.ai](https://docs.mistral.ai/)                                                    |
| Mux            | Unknown                                     | —                  | No       | —                       | [mux.coder.com](https://mux.coder.com/)                                                        |
| Neovate        | Yes ("Slash Commands")                      | MD + YAML          | No       | —                       | [neovateai.dev](https://neovateai.dev/)                                                        |
| OpenClaw       | N/A                                         | —                  | No       | —                       | [docs.openclaw.ai](https://docs.openclaw.ai/)                                                  |
| OpenHands      | Unknown                                     | —                  | No       | —                       | [docs.openhands.dev](https://docs.openhands.dev/)                                              |
| Pi             | Yes                                         | MD                 | No       | —                       | [github.com](https://github.com/badlogic/pi-mono)                                              |
| Pochi          | Unknown                                     | —                  | No       | —                       | [docs.getpochi.com](https://docs.getpochi.com/)                                                |
| Qoder          | Unknown                                     | —                  | No       | —                       | [docs.qoder.com](https://docs.qoder.com/)                                                      |
| Qwen Code      | Yes ("Custom Commands")                     | MD + YAML          | No       | —                       | [qwenlm.github.io](https://qwenlm.github.io/qwen-code-docs/)                                   |
| Replit         | No                                          | —                  | No       | —                       | [docs.replit.com](https://docs.replit.com/)                                                    |
| Trae           | Yes ("Skills")                              | SKILL.md           | No       | —                       | [docs.trae.ai](https://docs.trae.ai/)                                                          |
| Trae CN        | Yes ("Skills")                              | SKILL.md           | No       | —                       | [docs.trae.ai](https://docs.trae.ai/)                                                          |
| Windsurf       | Yes ("Workflows")                           | MD                 | No       | —                       | [docs.windsurf.com](https://docs.windsurf.com/)                                                |
| Zencoder       | Unknown                                     | —                  | No       | —                       | [docs.zencoder.ai](https://docs.zencoder.ai/)                                                  |

†Kilo Code inherits OpenCode's command system at the code level (as a fork) but does not document custom commands — only Skills (SKILL.md) are documented.

**25 of 39** agents support custom commands (Yes or Partial). 11 are in scope for this change. Notable observations: **Claude Code** and **Codex** have deprecated commands in favor of skills, but their command paths remain fully functional — AXM targets these deprecated-but-working paths for the `command` extension type (see [A](#a-claude-code), [C](#c-openai-codex)); **MCPJam** is an MCP platform and **OpenClaw** is a gateway (both N/A); **Amp** deprecated custom commands in favor of Agent Skills; **Continue** uses Markdown with YAML frontmatter (not JSON config as previously stated); **Kode** follows the AGENTS.md standard (not SKILL.md); **Goose** has a full Recipes system with slash commands (YAML format); **Kimi CLI**, **Mistral Vibe**, **Neovate**, **Qwen Code**, **AdaL**, and **Cline** all have confirmed command support previously marked Unknown or Partial; **Replit** and **Command Code** have no command support; **Trae**/**Trae CN** support Skills (SKILL.md); **Windsurf** supports Workflows (MD). Several agents use different feature names — "Skills", "Prompts", "Workflows", "Recipes" — but all serve the same function as reusable prompt commands.

### Cross-Agent Feature Matrix

The **AXM portable** column shows which features the portable schema covers directly. Features marked "override" require per-agent `agentOverrides`; "—" means the feature is not modeled by AXM.

| Feature            | AXM portable    | Claude Code     | Copilot       | Codex        | Cursor       | Gemini CLI | OpenCode        | Augment             | Junie          | Kilo            | Kiro         | Roo          |
| ------------------ | --------------- | --------------- | ------------- | ------------ | ------------ | ---------- | --------------- | ------------------- | -------------- | --------------- | ------------ | ------------ |
| Arguments          | `{{arguments}}` | `$ARGUMENTS`    | `${input:}`   | `$ARGUMENTS` | `$ARGUMENTS` | `{{args}}` | `$ARGUMENTS`    | `$ARGUMENTS`        | `$argName=val` | `$ARGUMENTS`    | None (files) | `$ARGUMENTS` |
| Shell injection    | override        | `` !`cmd` ``    | —             | —            | —            | `!{cmd}`   | `` !`cmd` ``    | —                   | —              | `` !`cmd` ``    | —            | —            |
| File injection     | override        | `@filepath`     | —             | —            | —            | `@{path}`  | `@filename`     | —                   | —              | `@filename`     | —            | —            |
| Model override     | model           | Yes             | Yes           | —            | —            | —          | Yes             | Yes                 | —              | —               | —            | —            |
| Tool restrictions  | allowedTools    | `allowed-tools` | `tools`       | —            | —            | —          | —               | —                   | —              | `allowed-tools` | —            | —            |
| AI auto-invoke     | autoInvocable   | Yes             | —             | Yes          | —            | —          | —               | —                   | —              | —               | —            | Yes (tool)   |
| Subagent fork      | isolatedContext | `context: fork` | `agent` field | —            | —            | —          | `subtask: true` | —                   | —              | `subtask: true` | —            | `mode` field |
| Namespace via dirs | —               | —               | —             | —            | —            | Yes (`:`)  | —               | Yes (`:`)           | —              | —               | —            | —            |
| Cross-tool compat  | —               | —               | —             | Agent Skills | —            | —          | —               | `.claude/commands/` | —              | OpenCode        | —            | —            |

### Cross-Agent Command Format Summary

| Agent       | Format     | Project Path                       | User Path                               | Invocation      |
| ----------- | ---------- | ---------------------------------- | --------------------------------------- | --------------- |
| Claude Code | MD + YAML  | `.claude/commands/<name>.md`       | `~/.claude/commands/<name>.md`          | `/name`         |
| Copilot     | MD + YAML  | `.github/prompts/<name>.prompt.md` | VS Code profile                         | `/name`         |
| Codex       | MD + YAML  | —                                  | `~/.codex/prompts/<name>.md`            | `/prompts:name` |
| Cursor      | MD         | `.cursor/commands/<name>.md`       | Global library                          | `/name`         |
| Gemini CLI  | TOML       | `.gemini/commands/<name>.toml`     | `~/.gemini/commands/<name>.toml`        | `/name`         |
| OpenCode    | MD + YAML  | `.opencode/commands/<name>.md`     | `~/.config/opencode/commands/<name>.md` | `/name`         |
| Augment     | MD + YAML  | `.augment/commands/<name>.md`      | `~/.augment/commands/<name>.md`         | `/name`         |
| Junie       | MD + YAML  | `.junie/commands/<name>.md`        | `~/.junie/commands/<name>.md`           | `/name`         |
| Kilo Code   | MD + YAML  | `.opencode/commands/<name>.md`     | `~/.config/kilo/commands/<name>.md`     | `/name`         |
| Kiro        | Plain text | `.kiro/prompts/`                   | `~/.kiro/prompts/`                      | `@name`         |
| Roo Code    | MD + YAML  | `.roo/commands/<name>.md`          | `~/.roo/commands/<name>.md`             | `/name`         |

### A. Claude Code

**Docs:**

- [Slash commands (archived)](reference/slash-commands.md) — full reference for the deprecated commands system (**AXM rendering target**)
- [Skills](https://code.claude.com/docs/en/skills) (current canonical; commands merged into skills)
- [Built-in commands](https://code.claude.com/docs/en/commands)

> **AXM targets the deprecated commands path.** Claude Code deprecated standalone commands (`.claude/commands/`) in favor of Skills (`.claude/skills/`), but the commands path remains fully functional. AXM renders the `command` extension type to `.claude/commands/` — the simpler, single-file format that maps directly to the AXM portable command model. AXM's `skill` extension type separately targets `.claude/skills/`. If both exist for the same name, the skill wins (by Claude Code convention), which is desirable when a richer version exists.

**Format:** Markdown with YAML frontmatter. Single `.md` file per command.

**File paths (commands — AXM rendering target):**

| Scope    | Path                           | Notes                |
| -------- | ------------------------------ | -------------------- |
| Project  | `.claude/commands/<name>.md`   | Version-controllable |
| Personal | `~/.claude/commands/<name>.md` | All projects         |

Project commands take precedence over personal commands with the same name. Subdirectories create namespaced groupings visible in descriptions (e.g., `frontend/component.md` shows as "(project:frontend)") but do not affect the command name.

**File paths (skills — for reference, handled by AXM `skill` type):**

| Scope                | Path                               | Notes                     |
| -------------------- | ---------------------------------- | ------------------------- |
| Enterprise (managed) | Managed `.claude/skills/`          | Highest priority          |
| Personal             | `~/.claude/skills/<name>/SKILL.md` | All projects              |
| Project              | `.claude/skills/<name>/SKILL.md`   | Version-controllable      |
| Plugin               | `<plugin>/skills/<name>/SKILL.md`  | Namespaced `plugin:skill` |

Priority across both systems: enterprise skills > personal skills > project skills > personal commands > project commands. If a skill and a command share a name, the skill wins.

**Invocation:** `/command-name [args]` in chat input. Autocomplete works anywhere in input, not just at the start. Claude can auto-invoke commands via the Skill tool based on `description` matching (unless `disable-model-invocation: true`).

**Frontmatter fields (commands):**

| Field                      | Required | Type     | Default              | Notes                                                   |
| -------------------------- | -------- | -------- | -------------------- | ------------------------------------------------------- |
| `description`              | No       | string   | first line of prompt | shown in `/help`; used for AI auto-invocation           |
| `argument-hint`            | No       | string   | —                    | hint shown during autocomplete                          |
| `allowed-tools`            | No       | string[] | inherited            | tools usable without approval (e.g., `Bash(git add:*)`) |
| `model`                    | No       | string   | inherited            | model override (e.g., `claude-3-5-haiku-20241022`)      |
| `context`                  | No       | string   | inline               | `fork` to run in a forked subagent context              |
| `agent`                    | No       | string   | general-purpose      | subagent type when `context: fork`                      |
| `disable-model-invocation` | No       | boolean  | `false`              | prevents AI auto-selection via Skill tool               |
| `hooks`                    | No       | object   | —                    | scoped hooks (`PreToolUse`, `PostToolUse`, `Stop`)      |

**Additional frontmatter fields (skills only — not applicable to commands):**

| Field            | Type     | Notes                                         |
| ---------------- | -------- | --------------------------------------------- |
| `name`           | string   | explicit name (commands derive from filename) |
| `user-invocable` | boolean  | `false` = hidden from `/` menu                |
| `effort`         | string   | `low`, `medium`, `high`, `max`                |
| `paths`          | string[] | glob patterns limiting auto-activation        |
| `shell`          | string   | `bash` or `powershell`                        |

**Variable substitution:**

| Syntax           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `$ARGUMENTS`     | All arguments passed when invoking                   |
| `$1`, `$2`, etc. | Positional arguments (1-based)                       |
| `@filepath`      | File content injection (reference files in prompt)   |
| `` !`command` `` | Inline shell execution (output replaces placeholder) |

**Hooks in commands:** Commands can define scoped hooks via frontmatter that run during execution and are cleaned up when the command finishes. The `once: true` option runs a hook only once per session. See [reference/slash-commands.md](reference/slash-commands.md#define-hooks-for-commands) for examples.

**Notable:** Although deprecated, the commands system remains fully functional and supports a rich feature set: frontmatter metadata, argument substitution (`$ARGUMENTS`, positional `$1`/`$2`), file references (`@path`), shell preprocessing (`` !`cmd` ``), model overrides, tool restrictions, subagent forking (`context: fork`), scoped hooks, and AI auto-invocation via the Skill tool. The single-file Markdown format maps cleanly to the AXM portable command model. The Skills system adds multi-file directories, `paths`-based auto-activation, and richer metadata — these are handled by the AXM `skill` extension type.

---

### B. GitHub Copilot

**Docs:**

- [Prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files) (canonical)

**Format:** Markdown with optional YAML frontmatter. File extension is `.prompt.md`.

**File paths:**

| Scope     | Path                               | Notes                                        |
| --------- | ---------------------------------- | -------------------------------------------- |
| Workspace | `.github/prompts/<name>.prompt.md` | Configurable via `chat.promptFilesLocations` |
| User      | VS Code profile user data          | Synced via Settings Sync                     |

**Invocation:** `/prompt-name` in Copilot Chat input. Also via Command Palette ("Chat: Run Prompt") or play button in editor.

**Frontmatter fields:**

| Field           | Required | Type     | Default  | Notes                                        |
| --------------- | -------- | -------- | -------- | -------------------------------------------- |
| `description`   | No       | string   | —        | brief explanation                            |
| `name`          | No       | string   | filename | display name                                 |
| `argument-hint` | No       | string   | —        | guidance text                                |
| `agent`         | No       | string   | —        | `ask`, `agent`, `plan`, or custom agent name |
| `model`         | No       | string   | —        | model override                               |
| `tools`         | No       | string[] | —        | available tools; `<server>/*` for MCP tools  |

**Variable substitution:**

| Syntax                         | Description                      |
| ------------------------------ | -------------------------------- |
| `${input:variableName}`        | User input prompt at invocation  |
| `${input:varName:placeholder}` | User input with placeholder text |
| `${selection}`                 | Current editor selection         |
| `#tool:<tool-name>`            | Reference agent tool in body     |

**Notable:** IDE-native (VS Code / Visual Studio). Also supports "chat modes" (`.github/chatmodes/`) as separate concept. AI-generated prompt creation via `/create-prompt`. No CLI support for custom prompts.

---

### C. OpenAI Codex

**Docs:**

- [Custom Prompts (deprecated)](https://developers.openai.com/codex/custom-prompts) — AXM command rendering target
- [Skills](https://developers.openai.com/codex/skills) — separate system, handled by AXM `skill` extension type
- [Slash Commands](https://developers.openai.com/codex/cli/slash-commands) — built-in only, not user-defined

**Format:** Two systems. **Custom prompts** (deprecated but functional): Markdown with YAML frontmatter in `~/.codex/prompts/`. **Skills** (replacement): directory with `SKILL.md` plus optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml`. AXM `command` targets the custom prompts path; AXM `skill` targets the skills path.

**File paths (custom prompts — AXM command target):**

| Scope | Path                | Notes                       |
| ----- | ------------------- | --------------------------- |
| User  | `~/.codex/prompts/` | Local-only, not repo-shared |

**Invocation:** `/prompts:prompt-name [args]` in chat.

**Frontmatter fields (custom prompts):**

| Field           | Required | Type   | Default | Notes                    |
| --------------- | -------- | ------ | ------- | ------------------------ |
| `description`   | No       | string | —       | shown in command popup   |
| `argument-hint` | No       | string | —       | expected argument format |

**Variable substitution:**

| Syntax             | Description                               |
| ------------------ | ----------------------------------------- |
| `$1` through `$9`  | Positional arguments                      |
| `$ARGUMENTS`       | All arguments                             |
| `$$`               | Literal dollar sign                       |
| Named placeholders | Uppercase keys like `$FILE`, `$TICKET_ID` |

**Notable:** Custom prompts deprecated in favor of skills but still functional. AXM renders commands to `~/.codex/prompts/` (the command path); skills go to `.agents/skills/` (handled separately by the `skill` extension type). Custom prompts are local-only — not shareable via repo. If a user also installs the same extension as a skill, the skill takes precedence (richer format wins).

---

### D. Cursor

**Docs:**

- [Cursor 1.6 Changelog](https://cursor.com/changelog/1-6) (custom commands announcement)

**Format:** Markdown files. Filename becomes the command name.

**File paths:**

| Scope   | Path                                   | Notes                |
| ------- | -------------------------------------- | -------------------- |
| Project | `.cursor/commands/<name>.md`           | Version-controllable |
| User    | Global library (location undocumented) | Cross-project        |

**Invocation:** `/command-name` in Agent input dropdown.

**Variable substitution:** `$ARGUMENTS` placeholder for user-provided input.

**Notable:** Introduced in Cursor 1.6. Minimal documented feature set. Separate "Notepad" feature and "Rules" (`.cursor/rules/`) are distinct from commands.

---

### E. Gemini CLI

**Docs:**

- [Custom commands](https://geminicli.com/docs/cli/custom-commands/) (canonical)

**Format:** TOML files (`.toml`). Only agent using TOML for commands.

**File paths:**

| Scope           | Path                             | Notes                |
| --------------- | -------------------------------- | -------------------- |
| User (global)   | `~/.gemini/commands/<name>.toml` | All projects         |
| Project (local) | `.gemini/commands/<name>.toml`   | Version-controllable |

Project commands override global commands with the same name. Subdirectories create namespaced commands with colons: `git/commit.toml` becomes `/git:commit`.

**Invocation:** `/command-name [args]` in CLI. `/commands reload` to pick up changes.

**TOML fields:**

| Field         | Required | Type   | Default        | Notes                         |
| ------------- | -------- | ------ | -------------- | ----------------------------- |
| `prompt`      | Yes      | string | —              | instruction sent to the model |
| `description` | No       | string | auto-generated | one-line summary in `/help`   |

**Variable substitution:**

| Syntax       | Description                                   |
| ------------ | --------------------------------------------- |
| `{{args}}`   | Replaced with user arguments                  |
| `!{command}` | Shell execution (confirmation prompted)       |
| `@{path}`    | File/directory content injection (multimodal) |

**Notable:** Only agent using TOML format. Unique `@{path}` syntax supports multimodal input (images, PDFs, audio, video). Shell execution requires user confirmation. MCP Prompts from servers are also exposed as slash commands.

---

### F. OpenCode

**Docs:**

- [Commands](https://opencode.ai/docs/commands/) (canonical)

**Format:** Markdown with YAML frontmatter. Also JSON in `opencode.jsonc`.

**File paths:**

| Scope         | Path                                    | Notes                |
| ------------- | --------------------------------------- | -------------------- |
| Project       | `.opencode/commands/<name>.md`          | Version-controllable |
| User (global) | `~/.config/opencode/commands/<name>.md` | Cross-project        |
| JSON config   | `opencode.jsonc` `command` key          | Alternative to files |

**Invocation:** `/command-name [args]` in TUI.

**Frontmatter fields:**

| Field         | Required | Type    | Default | Notes                     |
| ------------- | -------- | ------- | ------- | ------------------------- |
| `description` | No       | string  | —       | brief explanation         |
| `agent`       | No       | string  | —       | which agent executes      |
| `model`       | No       | string  | —       | override default LLM      |
| `subtask`     | No       | boolean | —       | force subagent invocation |

**Variable substitution:**

| Syntax           | Description                   |
| ---------------- | ----------------------------- |
| `$ARGUMENTS`     | All passed arguments          |
| `$1`, `$2`, `$3` | Positional arguments          |
| `` !`command` `` | Bash command output injection |
| `@filename`      | File content injection        |

**Notable:** Custom commands can override built-in commands. `subtask: true` forces subagent execution with isolated context. Shell commands execute from project root.

---

### G. Augment Code

**Docs:**

- [Custom Commands](https://docs.augmentcode.com/cli/custom-commands) (canonical)

**Format:** Markdown with optional YAML frontmatter.

**File paths:**

| Scope         | Path                                          | Notes                |
| ------------- | --------------------------------------------- | -------------------- |
| User          | `~/.augment/commands/<name>.md`               | Cross-project        |
| Workspace     | `.augment/commands/<name>.md`                 | Version-controllable |
| Claude compat | `.claude/commands/` and `~/.claude/commands/` | Cross-tool support   |

**Invocation:** `/command-name [args]`. Also `auggie command <name>` and `auggie command list`.

**Frontmatter fields:**

| Field           | Required | Type   | Default              | Notes                    |
| --------------- | -------- | ------ | -------------------- | ------------------------ |
| `description`   | No       | string | first line of prompt | —                        |
| `argument-hint` | No       | string | —                    | expected argument format |
| `model`         | No       | string | —                    | model override           |

**Notable:** Cross-tool compatibility with Claude Code commands directories. Subdirectory namespacing (`frontend/component.md` becomes `/frontend:component`).

---

### H. Junie (JetBrains)

**Docs:**

- [Custom slash commands](https://junie.jetbrains.com/docs/custom-slash-commands.html) (canonical)

**Format:** Markdown with YAML frontmatter. Filename becomes command name.

**File paths:**

| Scope   | Path                          | Notes                |
| ------- | ----------------------------- | -------------------- |
| Project | `.junie/commands/<name>.md`   | Version-controllable |
| User    | `~/.junie/commands/<name>.md` | Cross-project        |

**Invocation:** `/command-name` in prompt. `/commands` to manage.

**Frontmatter fields:**

| Field         | Required | Type   | Default | Notes              |
| ------------- | -------- | ------ | ------- | ------------------ |
| `description` | No       | string | —       | shown when listing |

**Variable substitution:** Named-argument syntax: `$argName` with invocation as `/command argName=value`. All arguments are required. Tab autocomplete.

**Notable:** Unique named-argument syntax (`$argName` with `key=value` invocation) rather than positional `$ARGUMENTS`. Available in both IDE and CLI. LLM-agnostic.

---

### I. Kilo Code

**Docs:**

- [Kilo Code CLI](https://kilo.ai/docs/cli)

**Format:** Markdown with YAML frontmatter (inherits from OpenCode).

**File paths:**

| Scope   | Path                                                         | Notes                |
| ------- | ------------------------------------------------------------ | -------------------- |
| Project | `.opencode/commands/<name>.md` or `.kilo/commands/<name>.md` | Version-controllable |
| User    | `~/.config/kilo/` or `~/.config/opencode/`                   | Cross-project        |

**Invocation:** `/command-name [args]` in TUI/chat.

**Variable substitution:** Same as OpenCode: `$ARGUMENTS`, `` !`command` ``, `@filename`.

**Notable:** Built on OpenCode, inherits its command system. Can override built-in commands.

---

### J. Kiro (AWS)

**Docs:**

- [Manage prompts (CLI)](https://kiro.dev/docs/cli/chat/manage-prompts/)
- [Slash commands (IDE)](https://kiro.dev/docs/chat/slash-commands/)

**Format:** Plain text files. Created via CLI commands rather than manual file editing.

**File paths:**

| Scope           | Path                       | Notes              |
| --------------- | -------------------------- | ------------------ |
| Local (project) | `.kiro/prompts/`           | Workspace-specific |
| Global (user)   | `~/.kiro/prompts/`         | Cross-project      |
| MCP             | Via configured MCP servers | Supports arguments |

Priority: local > global > MCP.

**Invocation:** `@prompt-name [arg]` in chat (note: `@` prefix, not `/`).

**Management commands:** `/prompts create`, `/prompts edit`, `/prompts remove`, `/prompts list`, `/prompts details`.

**Notable:** Most limited command system. Uses `@` prefix for invocation. No frontmatter, no structured format — plain text prompts. No variable substitution for file-based prompts. Only MCP prompts support arguments.

---

### K. Roo Code

**Docs:**

- [Slash Commands](https://docs.roocode.com/features/slash-commands) (canonical)
- [run_slash_command tool](https://docs.roocode.com/advanced-usage/available-tools/run-slash-command)

**Format:** Markdown with optional YAML frontmatter. Filename becomes command name.

**File paths:**

| Scope   | Path                        | Notes                |
| ------- | --------------------------- | -------------------- |
| Project | `.roo/commands/<name>.md`   | Version-controllable |
| Global  | `~/.roo/commands/<name>.md` | Cross-project        |

Project commands override global commands with same name.

**Invocation:** `/command-name` in chat with fuzzy-filtered dropdown.

**Frontmatter fields:**

| Field           | Required | Type   | Default | Notes                           |
| --------------- | -------- | ------ | ------- | ------------------------------- |
| `description`   | No       | string | —       | displayed in command menu       |
| `argument-hint` | No       | string | —       | expected input format           |
| `mode`          | No       | string | —       | switch to mode before executing |

**Variable substitution:** `$ARGUMENTS` supported.

**Notable:** Has `run_slash_command` tool allowing AI to execute commands programmatically (chained automation). The `mode` frontmatter field switches behavioral mode before executing. Built-in commands cannot be overridden.

---

## Appendix: AXM Managed Format (Draft)

### Manifest File

**Filename:** `axm-command.json`

Following the existing convention (`axm-skill.json`, `axm-subagent.json`, `axm-mcp-server.json`), the command manifest uses the same common fields plus command-specific metadata.

```jsonc
{
  // --- Common fields (shared with all extension types) ---
  "owner": "@acme",
  "name": "review-pr",
  "version": "1.0.0",
  "type": "command",
  "description": "Review the current PR for style, correctness, and security issues",
  "keywords": ["review", "pr", "code-quality"],
  "license": "MIT",
  "repository": "https://github.com/acme/commands",
  "authors": [{ "name": "Acme Corp" }],

  // --- Command-specific fields ---

  // The prompt template body. This is what gets rendered into each agent's
  // native command format. Supports the AXM portable variable syntax.
  "prompt": "Review the pull request in the current branch...",

  // Argument definitions. Each argument has a name, optional description,
  // and whether it's required.
  "arguments": [
    {
      "name": "scope",
      "description": "Focus area: 'security', 'style', 'correctness', or 'all'",
      "required": false,
      "default": "all",
    },
  ],

  // Hint text shown during autocomplete (e.g., "[scope]")
  "argumentHint": "[scope]",

  // Whether the AI model can auto-invoke this command based on context.
  // Agents that support auto-invocation (Claude Code, Codex) use this;
  // others ignore it.
  "autoInvocable": true,

  // Whether the command should be visible in the slash-command menu.
  // false = background knowledge only (Claude Code `user-invocable: false`).
  "userInvocable": true,

  // Optional model hint. Agents that support per-command model override
  // use this; others ignore it.
  "model": null,

  // Optional tool restrictions. Agents that support per-command tool
  // scoping use this; others ignore it.
  "allowedTools": null,

  // Optional: run in an isolated subagent context.
  // Maps to Claude Code `context: fork`, OpenCode/Kilo `subtask: true`,
  // Copilot `agent` field, Roo `mode` field.
  "isolatedContext": false,

  // Agent-specific overrides for fields that don't have portable
  // equivalents. Keys are agent IDs from the AXM agent registry.
  "agentOverrides": {
    "gemini-cli": {
      // Gemini-specific: enable @{path} file injection syntax
    },
    "junie": {
      // Junie-specific: named argument definitions
    },
  },
}
```

### Portable Variable Syntax

The command manifest uses a canonical variable syntax that AXM renderers translate to each agent's native format:

| AXM Portable Syntax | Description                   | Agent-Native Mappings                                                                                            |
| ------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `{{arguments}}`     | All arguments as a string     | `$ARGUMENTS` (Claude Code, Cursor, OpenCode, Augment, Kilo, Roo), `{{args}}` (Gemini), `${input:args}` (Copilot) |
| `{{arguments[0]}}`  | Positional argument (0-based) | `$0` (Claude Code), `$1` (Codex/OpenCode), `${input:name}` (Copilot)                                             |
| `{{arg:name}}`      | Named argument                | `$name` (Junie), `${input:name}` (Copilot), appended context for others                                          |

Agents that don't support a particular variable syntax receive a best-effort fallback (e.g., named arguments appended as context for agents that only support positional arguments).

### File Structure

```
my-command/
  axm-command.json    # Manifest (required)
  README.md           # Optional documentation
```

Commands are simpler than skills — no supporting scripts or assets directory. The prompt body lives in the manifest's `prompt` field. For longer prompts, authors can use JSON multiline strings or reference a separate prompt file (future enhancement).
