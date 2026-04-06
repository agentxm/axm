## Why

AXM manages skills, commands, MCP servers, and packs across coding agents — but has no concept of a **subagent** extension type. Every major coding agent now supports subagents, each with its own configuration format and directory convention. Teams building reusable subagents today must manually duplicate configuration across agents. AXM should treat subagents as a first-class extension type — installable, publishable, and portable — just like skills.

**Ecosystem momentum.** Twelve agents now support subagents natively: Claude Code, GitHub Copilot, Codex, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro, and Roo Code — up from two (Claude Code and Codex) a year ago. The format landscape is fragmented: most use Markdown + YAML frontmatter but with different field names and semantics; Codex uses TOML; Kiro CLI uses JSON; Roo Code uses YAML/JSON mode definitions. This fragmentation is accelerating as each agent adds agent-specific features (hooks, permissions, isolation, background execution).

**Concrete pain.** A team author writes a code-review subagent for Claude Code (`.claude/agents/code-reviewer.md`), then must manually port it to Cursor (different `readonly` field), Codex (TOML with `developer_instructions` and `sandbox_mode`), Gemini CLI (different tool wildcard syntax), and OpenCode (permission object with `ask`/`allow`/`deny`). When they update the prompt, they update it in five places. When a new team member onboards, they discover the copies have drifted. When a sixth agent is adopted, the cycle repeats.

## What Changes

- **New `subagent` extension type** with its own manifest schema (`axm-subagent.json`), FQN segment (`subagents`), and registry support. Touches `ExtensionTypeSchema`, `ExtensionTypePlural`, FQN parsing, and manifest resolution.
- **Cross-agent subagent installation** — `axm subagents install` writes agent-native configuration files into each agent's `agents/` directory. Each `CodingAgent` implementation gains `addSubagent` / `removeSubagent` methods (or a generalized `addExtension` pattern) and an `agentsDir` property alongside the existing `skillsDir`.
- **Agent-specific rendering** — new per-agent renderers translate the portable manifest into agent-native config formats:
  - **Markdown + YAML frontmatter** — Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE
  - **TOML** — Codex
  - **JSON** — Kiro CLI
  - **YAML/JSON modes** — Roo Code (merged into `.roomodes`)
- **`axm subagents` command group** — `install`, `uninstall`, `list`, `new`, `publish` commands mirroring the existing skills command group.
- **Pack support** — pack manifest schema and resolution logic include `subagents` alongside skills, commands, and MCP servers.
- **Workspace reconciliation** — `axm sync` reconciles subagent files across configured agents using render-on-install (not symlinks, since each agent expects a different format).
- **Settings integration** — `SettingsSchema` adds `subagents: Record<string, SubagentEntry>` analogous to `skills`.
- **Registry** — registry API and publish flow support the `subagent` extension type.

## Non-Goals

- **Recursive subagent support** — AXM does not model subagents-spawning-subagents. The portable schema targets depth-1 delegation (the common denominator across agents). Agents with native recursion (Codex `max_depth`, Roo `new_task` chains) can use overrides.
- **Remote / A2A subagents** — Gemini CLI's `kind: remote` and Agent-to-Agent protocol support are out of scope. AXM manages local agent configuration files, not remote service orchestration.
- **Runtime orchestration** — AXM manages subagent _configuration_, not execution. It does not spawn, route, or monitor subagent runs. The host agent handles all runtime behavior.
- **Importing existing agent-native files** — An `axm subagents import` command (converting `.claude/agents/foo.md` into AXM managed format) is a useful follow-on but not part of this change.
- **Agent-native features without portable equivalents** — Features like Claude Code's `memory`, `hooks`, and `isolation` or OpenCode's `{file:./path}` interpolation have no portable mapping. They are accessible only via the per-agent `overrides` escape hatch, not modeled in the portable schema.

## Open Questions

These questions are flagged for resolution during design:

1. **`toolAccess` granularity** — Is the three-level enum (`full` / `readonly` / `none`) sufficient, or should the portable schema support an object form with allow/deny lists using portable tool categories (`read`, `edit`, `execute`, `search`, `web`, `agent`)? The richer form maps cleanly to most agents' native tool control (Copilot's aliases, Gemini's wildcards, OpenCode/Kilo's permission objects) and would reduce override burden for common cases. Trade-off: more complex schema and rendering logic.

2. **Roo Code rendering strategy** — Roo uses a single `.roomodes` file rather than per-agent files. AXM must merge mode entries into this file rather than writing standalone files. Should AXM own the entire `.roomodes` file, or read-modify-write to preserve manually-defined modes? The MCP server management change faced a similar question with agent config files.

## Proposed Design

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
  //
  // Enum form (simple):
  "toolAccess": "full", // "full" | "readonly" | "none"
  //
  // Object form (richer — open question for design):
  // "toolAccess": { "allow": ["read", "search", "web"], "deny": ["execute"] }
  // Portable categories: "read", "edit", "execute", "search", "web", "agent"
  // Each adapter maps categories to agent-native tool names.
  // Design should decide whether the enum form is sufficient or whether
  // the object form earns its complexity. See "Open Questions" below.

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

| Concern               | `axm-subagent.json`                   | `SUBAGENT.md`                                     |
| --------------------- | ------------------------------------- | ------------------------------------------------- |
| Purpose               | Registry metadata, version, ownership | Agent-facing content (canonical for behavior)     |
| Read by               | AXM CLI, registry, pack resolution    | Agent adapters during rendering                   |
| Contains              | owner, name, version, type, agents    | frontmatter (portable config) + instructions body |
| Published to registry | Yes                                   | Yes (as content artifact)                         |
| Canonical for         | Identity and distribution             | Subagent-specific fields and instructions         |

**`SUBAGENT.md` is the source of truth for subagent behavior** — its frontmatter defines `model`, `toolAccess`, `background`, `description`, and agent-specific `overrides`. The manifest (`axm-subagent.json`) owns identity and distribution fields: `owner`, `name`, `version`, `type`, `agents`, `keywords`, `license`, `repository`, and `authors`. During `axm subagents new`, both files are scaffolded in sync. During publish, both are included. During install, the agent adapter reads `SUBAGENT.md` and renders it into the agent-native format. The `description` field appears in both files — during publish, the manifest's `description` is synced from the SUBAGENT.md frontmatter.

### Installation — Render-on-Install

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

### Conflict Resolution

**Principle:** AXM-managed rendered files must not silently overwrite manually-created agent files. Install and sync fail with an actionable error when a name collision is detected; `--force` overrides.

- **Manual file exists at render path** — `axm subagents install` checks for an existing file _without_ the AXM managed header before writing. If found, the install fails with: `Conflict: .claude/agents/code-reviewer.md already exists and is not managed by axm. Use --force to overwrite.`
- **Duplicate subagent names across packs** — two packs declaring the same subagent name is an error at pack resolution time, before any rendering occurs.
- **Rendered file modified after install (drift)** — `axm sync` detects drift by comparing the rendered file's content hash against the expected hash stored in the lockfile. Drifted files are re-rendered with a warning: `Re-rendered .claude/agents/code-reviewer.md (local modifications overwritten)`. Users who need manual customization should use unmanaged agent files instead.

### Git Workflow for Rendered Files

Rendered agent-native files (`.claude/agents/code-reviewer.md`, `.codex/agents/code-reviewer.toml`, etc.) **should be committed to the repository**. This ensures teammates and CI get subagent definitions without needing AXM installed — the same reasoning behind committing any agent-native config today. The managed header comment (`<!-- managed by axm — do not edit -->`) makes ownership clear and discourages manual edits.

Trade-off: updates to a subagent produce rendered file churn across all configured agents. This is acceptable because (a) the diff is mechanical and reviewable, (b) it's the same churn teams currently accept when manually maintaining multi-agent configs, and (c) AXM eliminates the duplication effort that causes it.

### Agent Adapter Rendering

Each agent adapter translates the portable manifest into its native format. The portable schema is intentionally minimal — it captures the common subset, and each adapter maps to agent-native fields where supported (or omits them where not).

| Portable field         | Claude Code                        | Copilot             | Codex                       | Cursor           | Gemini CLI       | OpenCode / Kilo                         | Augment                 | Junie                                | Kiro IDE      | Kiro CLI                     | Roo Code                                |
| ---------------------- | ---------------------------------- | ------------------- | --------------------------- | ---------------- | ---------------- | --------------------------------------- | ----------------------- | ------------------------------------ | ------------- | ---------------------------- | --------------------------------------- |
| `name`                 | `name`                             | `name`              | `name`                      | `name`           | `name`           | (filename)                              | `name`                  | `name`                               | `name`        | `name`                       | `slug` + `name`                         |
| `description`          | `description`                      | `description`       | `description`               | `description`    | `description`    | `description`                           | `description`           | `description`                        | `description` | `description`                | `description` + `whenToUse`             |
| `model`                | mapped                             | mapped              | `model`                     | mapped           | mapped           | `model`                                 | `model`                 | mapped                               | `model`       | `model`                      | —                                       |
| `toolAccess: full`     | (omit)                             | `["*"]`             | (omit)                      | (omit)           | (omit)           | (omit)                                  | (omit)                  | (omit)                               | (omit)        | (omit)                       | `[read,edit,command,mcp]`               |
| `toolAccess: readonly` | `disallowedTools: Edit,Write,Bash` | `["read","search"]` | `sandbox_mode: "read-only"` | `readonly: true` | (read tool list) | `{edit:"deny",bash:"deny"}`             | `disabled_tools: [...]` | `disallowedTools: [Write,Edit,Bash]` | `[read,web]`  | `["read","web","knowledge"]` | `[read,mcp]`                            |
| `toolAccess: none`     | `tools: ""`                        | `[]`                | `sandbox_mode: "read-only"` | `readonly: true` | `[]`             | `{edit:"deny",bash:"deny",task:"deny"}` | `tools: []`             | `tools: []`                          | `[]`          | `[]`                         | `[read]`                                |
| `background`           | `background`                       | —                   | —                           | `is_background`  | —                | —                                       | (parallel by default)   | —                                    | —             | —                            | —                                       |
| Body (instructions)    | MD body                            | MD body (max 30k)   | `developer_instructions`    | MD body          | MD body          | MD body / `prompt`                      | MD body                 | MD body                              | MD body       | `prompt`                     | `roleDefinition` + `customInstructions` |

**Agent-specific notes:**

- **Codex** is the only agent requiring TOML rendering. The Markdown body maps to `developer_instructions` (a required TOML string field).
- **Roo Code** uses YAML/JSON modes rather than MD agent files. AXM merges a mode entry into `.roomodes`. The body's first paragraph becomes `roleDefinition`; the remainder becomes `customInstructions`.
- **Kiro CLI** uses JSON — the Markdown body maps to the `prompt` string field.
- **OpenCode / Kilo** — AXM sets `mode: "subagent"` on all rendered files. Name is derived from filename.

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

### Lockfile Integration

Subagent lockfile entries follow the existing lock entry pattern (`SkillLockEntry`, `CommandLockEntry`) with an additional `renderedFiles` map tracking per-agent rendered paths and content hashes for drift detection:

```jsonc
// axm-lock.yaml (subagents section)
{
  "code-reviewer": {
    "type": "github",
    "owner": "acme",
    "repo": "subagents",
    "version": "1.0.0",
    "installedAt": "2026-04-06T12:00:00Z",
    "updatedAt": "2026-04-06T12:00:00Z",
    "gitTreeHash": "abc123",
    "agents": ["claude-code", "cursor", "gemini-cli"],
    "renderedFiles": {
      "claude-code": { "path": ".claude/agents/code-reviewer.md", "contentHash": "sha256:..." },
      "cursor": { "path": ".cursor/agents/code-reviewer.md", "contentHash": "sha256:..." },
      "gemini-cli": { "path": ".gemini/agents/code-reviewer.md", "contentHash": "sha256:..." },
    },
  },
}
```

The `renderedFiles` map enables sync to detect drift (rendered file modified manually) and to clean up rendered files on uninstall without scanning agent directories.

### Reconciliation Flow

`axm sync` reconciles subagents across all configured agents. Unlike skills (which use symlinks), subagent reconciliation involves a **render step** — the adapter must translate the portable `SUBAGENT.md` into each agent's native format on every sync.

1. Read `settings.json` → resolve enabled subagents
2. For each subagent, read `.axm/extensions/.../SUBAGENT.md`
3. For each configured agent, **render** the agent-native file into the agent's `agents/` directory
4. Compute content hashes and update `renderedFiles` in the lockfile
5. Compare existing rendered files against lockfile hashes — warn on drift, re-render
6. Remove rendered files for subagents no longer in settings (using lockfile `renderedFiles` paths)
7. Each rendered file includes a managed header: `<!-- managed by axm — do not edit -->` (or TOML equivalent `# managed by axm — do not edit`)

The render step is the key difference from skill reconciliation. It means subagent sync is not idempotent in the filesystem sense — even unchanged subagents produce a write (though the content is identical). Design should consider whether to skip writes when the content hash matches.

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
- `workspace-reconciliation`: Reconciliation engine gains a subagent adapter using render-on-install (not symlinks)

---

## Appendix: Agent Subagent Reference

> **Sourcing methodology.** Field tables are sourced from official documentation where available. Fields documented from community sources, changelogs, or source code inspection are noted with a confidence indicator where certainty varies (see Cursor section for an example). Documentation URLs were verified at time of writing; agent ecosystems move fast and links may drift.

### Agent Inventory

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
| Amp            | Yes                | —                           | No       | —                       | [ampcode.com](https://ampcode.com/agents-for-the-agent)                                     |
| Antigravity    | Partial            | —                           | No       | —                       | [antigravity.google](https://antigravity.google/docs/agent)                                 |
| Cline          | Yes (experimental) | —                           | No       | —                       | [docs.cline.bot](https://docs.cline.bot/features/subagents)                                 |
| CodeBuddy      | Yes                | —                           | No       | —                       | [codebuddy.ai](https://www.codebuddy.ai/docs/cli/sub-agents)                                |
| Command Code   | No                 | —                           | No       | —                       | [commandcode.ai](https://commandcode.ai/)                                                   |
| Continue       | Yes                | —                           | No       | —                       | [github.com](https://github.com/continuedev/continue/issues/9550)                           |
| Crush          | Partial            | —                           | No       | —                       | [github.com](https://github.com/charmbracelet/crush)                                        |
| Droid          | Yes                | —                           | No       | —                       | [docs.factory.ai](https://docs.factory.ai/cli/configuration/custom-droids)                  |
| Goose          | Yes                | —                           | No       | —                       | [block.github.io](https://block.github.io/goose/docs/guides/subagents/)                     |
| iFlow CLI      | Yes (EOL)          | —                           | No       | —                       | [platform.iflow.cn](https://platform.iflow.cn/en/cli/examples/subagent)                     |
| Kimi CLI       | Yes                | —                           | No       | —                       | [moonshotai.github.io](https://moonshotai.github.io/kimi-cli/en/customization/agents.html)  |
| Kode           | Yes                | —                           | No       | —                       | [github.com](https://github.com/shareAI-lab/Kode-cli)                                       |
| MCPJam         | N/A                | —                           | No       | —                       | [mcpjam.com](https://www.mcpjam.com)                                                        |
| Mistral Vibe   | Yes                | —                           | No       | —                       | [docs.mistral.ai](https://docs.mistral.ai/mistral-vibe/agents-skills)                       |
| Mux            | Yes                | —                           | No       | —                       | [mux.coder.com](https://mux.coder.com/agents)                                               |
| Neovate        | Yes                | —                           | No       | —                       | [neovateai.dev](https://neovateai.dev/en/docs/features)                                     |
| OpenClaw       | Yes                | —                           | No       | —                       | [docs.openclaw.ai](https://docs.openclaw.ai/tools/subagents)                                |
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

**30 of 39** agents fully support subagents; **4** have partial support (Antigravity, Crush, Replit, Windsurf). 11 are in scope for this change. Notable exceptions: **MCPJam** is an MCP platform (N/A); **Pi**, **Pochi**, and **Command Code** lack native support; **AdaL** has no documented support; **iFlow CLI** supports subagents but is EOL (service shutdown April 17, 2026). Many out-of-scope agents use MD + YAML in `.<agent>/agents/*.md` — follow-on adapters would be mechanically similar.

### Cross-Agent Feature Matrix

The **AXM portable** column shows which features the portable schema covers directly. Features marked "override" require per-agent `overrides`; "—" means the feature is not modeled by AXM.

| Feature           | AXM portable | Claude Code  | Copilot       | Codex        | Cursor               | Gemini CLI     | OpenCode       | Augment     | Junie                                   | Kilo           | Kiro           | Roo            |
| ----------------- | ------------ | ------------ | ------------- | ------------ | -------------------- | -------------- | -------------- | ----------- | --------------------------------------- | -------------- | -------------- | -------------- |
| Auto-delegation   | description  | description  | context       | natural lang | description          | description    | Task tool      | auto-detect | description                             | Task tool      | description    | Orchestrator   |
| Manual invocation | —            | `@"name"`    | dropdown      | `/agent`     | —                    | `@name`        | `@name`        | by name     | —                                       | `@name`        | `/name`        | `new_task`     |
| Tool control      | toolAccess   | allow+deny   | allow+aliases | sandbox enum | readonly bool        | wildcards      | permission obj | allow+deny  | allow+deny                              | permission obj | allow+settings | groups+regex   |
| MCP servers       | override     | yes          | cloud only    | yes          | —                    | yes (isolated) | —              | —           | —                                       | —              | yes (CLI)      | —              |
| Background mode   | background   | yes          | —             | —            | yes (worktree)       | —              | —              | parallel    | —                                       | —              | —              | —              |
| Model override    | model        | yes          | yes           | yes          | yes                  | yes            | yes            | yes         | yes                                     | yes            | yes            | —              |
| Recursion         | —            | no (depth 1) | —             | configurable | —                    | no (depth 1)   | Task tool      | parallel    | —                                       | Task tool      | configurable   | via `new_task` |
| Fallback paths    | —            | —            | —             | —            | `.claude/`,`.codex/` | —              | —              | —           | imports `.claude/`,`.cursor/`,`.codex/` | `.opencode/`   | —              | —              |

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

**Built-in modes:** Code (full tools), Ask (read-only), Architect (read + markdown edit), Debug (full tools), Orchestrator (delegates only).

**Notable:** Different model from other agents — uses "modes" not "agents". No MD+YAML frontmatter agent files. Orchestrator has no tools itself (prevents context poisoning). Context isolation is strict — all context must be explicitly passed in `message`. Supports `.agents/skills/` cross-agent skill path.
