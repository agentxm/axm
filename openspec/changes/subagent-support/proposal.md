## Why

AXM manages skills, commands, MCP servers, and packs across coding agents — but has no concept of a **subagent** extension type. Every major coding agent now supports subagents, each with its own configuration format and directory convention. Teams building reusable subagents today must manually duplicate configuration across agents. AXM should treat subagents as a first-class extension type — installable, publishable, and portable — just like skills.

**Ecosystem momentum.** Thirty agents now support subagents natively — up from two (Claude Code and Codex) a year ago. Eleven are in scope for this change: Claude Code, GitHub Copilot, Codex, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro, and Roo Code. Four agents with subagent support — Amp, Goose, Kimi CLI, and OpenClaw — use architectures (runtime-spawned tasks, recipe files, gateway config) that don't fit the render-on-install model and are candidates for follow-on rendering approaches. The format landscape is fragmented: most use Markdown + YAML frontmatter but with different field names and semantics; Codex uses TOML; Kiro CLI uses JSON; Roo Code uses YAML/JSON mode definitions. This fragmentation is accelerating as each agent adds agent-specific features (hooks, permissions, isolation, background execution).

**Concrete pain.** A team author writes a code-review subagent for Claude Code (`.claude/agents/code-reviewer.md`), then must manually port it to Cursor (different `readonly` field), Codex (TOML with `developer_instructions` and `sandbox_mode`), Gemini CLI (different tool wildcard syntax), and OpenCode (permission object with `ask`/`allow`/`deny`). When they update the prompt, they update it in five places. When a new team member onboards, they discover the copies have drifted. When a sixth agent is adopted, the cycle repeats.

## What Changes

- **New `subagent` extension type** with its own manifest schema (`axm-subagent.json`), FQN segment (`subagents`), and registry support. Touches `ExtensionTypeSchema`, `ExtensionTypePlural`, FQN parsing, and manifest resolution.
- **Cross-agent subagent installation** — `axm subagents install` writes agent-native configuration files into each agent's `agents/` directory. Each `CodingAgent` implementation gains `addSubagent` / `removeSubagent` methods (or a generalized `addExtension` pattern) and an `agentsDir` property alongside the existing `skillsDir`.
- **Agent-specific rendering** — new per-agent renderers translate the portable manifest into agent-native config formats:
  - **Markdown + YAML frontmatter** — Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE
  - **TOML** — Codex
  - **JSON** — Kiro CLI
  - **YAML/JSON modes** — Roo Code (merged into `.roomodes`)
- **`axm subagents` command group** — nine subcommands: `install`, `uninstall`, `list`, `update`, `new`, `publish`, `enable`, `disable`, and `rename`. The first five mirror the existing skills command group. `update` adds re-rendering after version bumps. `enable`, `disable`, and `rename` are new patterns not present in other extension CLI groups — they establish conventions that may generalize to skills and commands in future work.
- **Pack support** — pack manifest schema and resolution logic include `subagents` alongside skills, commands, and MCP servers.
- **Workspace reconciliation** — `axm sync` reconciles subagent files across configured agents using render-on-install (not symlinks, since each agent expects a different format).
- **Settings integration** — `SettingsSchema` adds `subagents: Record<string, SubagentEntry>` analogous to `skills`.
- **Registry** — registry API and publish flow support the `subagent` extension type.

## Non-Goals

- **Recursive subagent support** — AXM does not model subagents-spawning-subagents. The portable schema targets depth-1 delegation (the common denominator across agents). Agents with native recursion (Codex `max_depth`, OpenClaw `maxSpawnDepth`, Roo `new_task` chains) can use overrides.
- **Remote / A2A subagents** — Gemini CLI's `kind: remote` and Agent-to-Agent protocol support are out of scope. AXM manages local agent configuration files, not remote service orchestration.
- **Runtime orchestration** — AXM manages subagent _configuration_, not execution. It does not spawn, route, or monitor subagent runs. The host agent handles all runtime behavior.
- **Importing existing agent-native files** — An `axm subagents import` command (converting `.claude/agents/foo.md` into AXM managed format) is a useful follow-on but not part of this change.
- **Agent-native features without portable equivalents** — Features like Claude Code's `memory`, `hooks`, and `isolation` or OpenCode's `{file:./path}` interpolation have no portable mapping. They are accessible only via the per-agent `overrides` escape hatch, not modeled in the portable schema.

## Open Questions

These questions are flagged for resolution during design:

1. **`toolAccess` granularity** — Is the three-level enum (`full` / `readonly` / `none`) sufficient, or should the portable schema support an object form with allow/deny lists using portable tool categories (`read`, `edit`, `execute`, `search`, `web`, `agent`)? The richer form maps cleanly to most agents' native tool control (Copilot's aliases, Gemini's wildcards, OpenCode/Kilo's permission objects) and would reduce override burden for common cases. Trade-off: more complex schema and rendering logic.

2. **Partial render failure atomicity** — If rendering succeeds for some agents but fails for others (e.g., TOML serialization error for Codex), should the install be atomic (rollback all rendered files) or partial (keep successful renders, report failures)? Partial success is more useful for development; atomicity is safer for CI. Design should define the failure model and whether `--force` affects it.

3. **`rename` scope and interaction model** — `rename` updates the canonical source, settings, lockfile, and re-renders all agent-native files. But the proposal doesn't define how rename interacts with registry-installed or pack-installed subagents. If a user renames `@acme/subagents/code-reviewer` to `security-checker`, the lockfile loses the name→FQN correspondence and `update` can't match the renamed entry to its upstream. For pack-installed subagents, the pack's declared reference breaks. Design should decide: restrict rename to locally-authored subagents only? Track original name/FQN in the lockfile to preserve the update link? Or allow rename freely and document that it severs the upstream relationship?

## Decisions

### Roo Code Rendering: Read-Modify-Write with Managed Markers

**Decision:** AXM uses read-modify-write for `.roomodes` (and user-scope `settings/custom_modes.yaml`), preserving manually-defined modes. Each AXM-managed mode entry includes an `"_axm_managed": true` field (JSON mode) or `# managed by axm` prefix (YAML mode) to distinguish AXM entries from manual ones.

**Rationale:** Owning the entire `.roomodes` file would be hostile to users with manually-defined modes — a common Roo Code workflow. Read-modify-write respects existing content while giving AXM a clean way to identify and reconcile its own entries. The `_axm_managed` marker enables sync to add, update, and remove AXM modes without touching manual ones. The MCP server management change faces the same question with agent config files and should adopt the same approach.

### Scoping: Project + User; Organization and System Deferred

**Decision:** Support `project` and `user` scopes. Defer organization and system scopes (unlikely to pursue).

**Rationale:** All 11 in-scope agents support both project-level and user-level subagent directories natively:

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

User scope has a clear use case: personal utility subagents (e.g., a code-reviewer you use across all projects). Implementation cost is low — same rendering logic, different target directory.

**Deferred scopes:**

- **Organization** — Only Claude Code (org-managed `.claude/agents/`) and Copilot (`.github-private` repo) support org-level scoping, with completely different mechanisms. No portable abstraction exists. Organizations can distribute subagents via packs + CI instead.
- **System** — Only Codex supports system-level config (`/etc/codex/`). No demand signal from other agents.

Three agents have additional scopes beyond project+user (Claude Code: org-managed, CLI flag, plugin; Copilot: organization via `.github-private` repo; Codex: system `/etc/codex/`). These are accessible via agent-specific overrides or CI-driven workflows and don't need AXM-level support.

## Proposed Design

> **Note:** The design detail below is directional — it illustrates feasibility and interaction patterns but is subject to revision in the design artifact.

### Manifest File

**Filename:** `axm-subagent.json`

Following the existing convention (`skill.json`, `command.json`, `mcp-server.json`), the subagent manifest uses the same common fields plus subagent-specific metadata.

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

  // --- Subagent-specific fields (synced from SUBAGENT.md frontmatter) ---
  // These fields are owned by SUBAGENT.md frontmatter and synced to the
  // manifest at publish/sync time for registry search and filtering.
  // See "Relationship: Manifest vs Content File" for sync rules.

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

  // --- Distribution fields (manifest-owned) ---

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

**`SUBAGENT.md` is the source of truth for subagent behavior** — its frontmatter defines `model`, `toolAccess`, `background`, `description`, and agent-specific `overrides`. The manifest (`axm-subagent.json`) owns identity and distribution fields: `owner`, `name`, `version`, `type`, `agents`, `keywords`, `license`, `repository`, and `authors`. The manifest also contains synced copies of `description`, `model`, `toolAccess`, and `background` for registry search and filtering. During `axm subagents new`, both files are scaffolded in sync. During publish, both are included. During install, the agent adapter reads `SUBAGENT.md` and renders it into the agent-native format. **Sync direction: frontmatter always wins for `description`, `model`, `toolAccess`, and `background`.** Sync points: `axm subagents new` scaffolds both in sync; `axm sync` overwrites manifest values with frontmatter values for all four synced fields; `axm subagents publish` syncs before upload. Between sync points, local edits to SUBAGENT.md frontmatter may drift from the manifest — this is expected during development. Authors should edit these fields in `SUBAGENT.md` frontmatter, not in `axm-subagent.json`.

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
.kiro/agents/code-reviewer.md                      # rendered for Kiro (IDE format)
.kiro/agents/code-reviewer.json                    # rendered for Kiro (CLI format)
.roomodes                                          # rendered for Roo Code (merged into modes file)
```

**Kiro dual-format rendering.** Kiro is a single agent ID (`kiro`) that produces **two rendered files** — MD for the IDE and JSON for the CLI. Both are tracked in the lockfile `renderedFiles` map under the `kiro` key as an array of entries. Install with `--agent kiro` renders both formats. Adapters that produce multiple files per agent are a general pattern (Kiro is the first case).

**User-scope rendered paths.** When `--scope user` is specified, rendered files target each agent's user-level directory instead of the project directory (see [Scoping decision](#scoping-project--user-organization-and-system-deferred) for rationale — all 11 agents support user-level paths natively):

```
~/.claude/agents/code-reviewer.md                  # Claude Code
~/.cursor/agents/code-reviewer.md                  # Cursor
~/.codex/agents/code-reviewer.toml                 # Codex
~/.github/agents/code-reviewer.md                  # Copilot (VS Code profile)
~/.gemini/agents/code-reviewer.md                  # Gemini CLI
~/.config/opencode/agents/code-reviewer.md         # OpenCode
~/.augment/agents/code-reviewer.md                 # Augment
~/.junie/agents/code-reviewer.md                   # Junie
~/.config/kilo/agents/code-reviewer.md             # Kilo Code
~/.kiro/agents/code-reviewer.md                    # Kiro (IDE)
~/.kiro/agents/code-reviewer.json                  # Kiro (CLI)
```

Roo Code user-scope modes go in the global `settings/custom_modes.yaml` rather than `.roomodes`.

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
- **`toolAccess` lossy mappings** — `toolAccess: none` and `toolAccess: readonly` produce identical output for Codex (`sandbox_mode: "read-only"`) and Cursor (`readonly: true`) because these agents have no "no tools" level. This is a known limitation of the portable schema; authors who need precise tool control for these agents should use `overrides`.

### Agent-Specific Overrides

The portable schema covers the common subset. For agent-specific features, `SUBAGENT.md` frontmatter supports an optional `overrides` map keyed by agent ID:

```jsonc
// In SUBAGENT.md frontmatter:
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

Parenthesized values (e.g., `(flash)`) indicate the adapter selects an appropriate model from the agent's available models at render time; concrete values (e.g., `haiku`, `"fast"`) are rendered verbatim. Concrete model IDs (e.g. `claude-opus-4-6`) also pass through verbatim for agents that support them. Agents that don't recognize the ID fall back to their default. Roo modes don't have a model field.

### Pack Integration

Packs gain a `subagents` field alongside existing `skills`, `commands`, and `mcp-servers`:

```jsonc
// extension-pack.json
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
7. Each rendered file includes a managed marker:
   - **Markdown** — `<!-- managed by axm — do not edit -->` as the first line
   - **TOML** — `# managed by axm — do not edit` as the first line
   - **JSON** (Kiro CLI) — `"_axm_managed": true` metadata field (JSON has no comment syntax)
   - **Roo `.roomodes`** — each AXM-managed mode entry includes `"_axm_managed": true` (JSON mode) or `# managed by axm` prefix (YAML mode)

The render step is the key difference from skill reconciliation. It means subagent sync is not idempotent in the filesystem sense — even unchanged subagents produce a write (though the content is identical). Design should consider whether to skip writes when the content hash matches.

**Agent list changes.** When the `agents` list in `settings.json` changes, `axm sync` automatically adjusts rendered files:

- **Agent added** — sync renders all installed subagents for the new agent (respecting each subagent's `agents` filter if set).
- **Agent removed** — sync deletes rendered files for the removed agent (using lockfile `renderedFiles` paths) and removes those entries from the lockfile.

### CLI Commands

The `axm subagents` command group mirrors the skills command group. All subcommands share the global `--non-interactive` flag and respect the `CI` / `!stdin.isTTY` resolution chain. Subagents-specific behavior (render-on-install, per-agent drift detection) is noted where it diverges from skills.

#### `axm subagents` (parent)

```
axm subagents <subcommand>
```

**Description:** Install, update, and manage subagents

**Subcommands:** `install`, `uninstall`, `list`, `update`, `new`, `publish`, `enable`, `disable`, `rename`

**Examples:**

```
axm subagents install @acme/subagents/code-reviewer     Add a subagent to your agents
axm subagents install @acme/subagents/code-reviewer@^1   Pin to a version range
axm subagents install owner/repo                         Install from a GitHub repository
axm subagents list                                       See what subagents are installed
```

---

#### `axm subagents install`

```
axm subagents install <source> [flags]
```

**Description:** Install subagents from a registry, GitHub, or local path. Renders agent-native configuration files into each configured agent's `agents/` directory.

**Arguments:**

| Argument | Required | Description                                                                                       |
| -------- | -------- | ------------------------------------------------------------------------------------------------- |
| `source` | Yes      | Registry reference (`@owner/subagents/name`), GitHub shorthand (`owner/repo`), local path, or URL |

**Flags:**

| Flag         | Type              | Default   | Description                                                                                                                   |
| ------------ | ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--scope`    | `project \| user` | `project` | Install to project (default) or user-level configuration                                                                      |
| `--subagent` | `string[]`        | —         | Cherry-pick specific subagent(s) from a multi-subagent source. Repeatable                                                     |
| `--agent`    | `string[]`        | —         | Render only for specific agent(s) instead of all configured agents. Repeatable                                                |
| `--all`      | `boolean`         | `false`   | Install every subagent found in the source without prompting                                                                  |
| `--yes`      | `boolean`         | `false`   | Skip confirmation after reviewing the install plan                                                                            |
| `--force`    | `boolean`         | `false`   | Reinstall even if the subagent already exists. Also overrides conflict detection (overwrites unmanaged files at render paths) |
| `--preview`  | `boolean`         | `false`   | Show what would be installed and which files would be rendered, without making changes                                        |

**Behavior notes:**

- After resolving the source and writing the canonical `SUBAGENT.md` to `.axm/extensions/`, renders agent-native files for each configured agent (or `--agent` subset)
- Checks for existing unmanaged files at each render path before writing. Fails with a conflict error if found; `--force` overrides
- Records `renderedFiles` map (path + content hash per agent) in the lockfile
- `--preview` shows the full plan including rendered file paths and formats per agent
- **Multi-subagent discovery** — when the source is a GitHub repo or local directory containing multiple subagents, AXM discovers them by scanning for `axm-subagent.json` files (same pattern as multi-skill repos scanning for `skill.json`). Without `--subagent` or `--all`, the user is prompted to select which subagents to install

> **Pattern departures from `axm skills install`:**
>
> - **`--agent` flag** — skills install has no `--agent` flag; the agent set is determined by workspace configuration. Subagents add `--agent` because render-on-install produces different output per agent, making per-agent targeting useful during development and debugging.
> - **`--subagent` flag** — skills install uses positional arguments with glob expansion for cherry-picking. Subagents use a repeatable `--subagent` flag, which is clearer for multi-value selection from a source containing multiple extension types.

**Examples:**

```
axm subagents install @acme/subagents/code-reviewer
  Add a code review subagent to all configured agents

axm subagents install @acme/subagents/code-reviewer@^1.0.0
  Pin to a specific version range

axm subagents install owner/repo
  Install from a GitHub repository

axm subagents install owner/repo --subagent code-reviewer --subagent security-audit
  Cherry-pick specific subagents from a multi-subagent repo

axm subagents install @acme/subagents/code-reviewer --agent claude-code --agent cursor
  Install but only render for Claude Code and Cursor

axm subagents install ./path/to/subagents
  Install from a local directory during development

axm subagents install owner/repo --all --yes
  CI: install all subagents without prompts

axm subagents install @acme/subagents/code-reviewer --preview
  See what would be installed and rendered before committing
```

---

#### `axm subagents uninstall`

```
axm subagents uninstall <subagent> [flags]
```

**Description:** Remove a subagent from the workspace. Deletes the canonical source from `.axm/extensions/` and all rendered agent-native files tracked in the lockfile.

**Arguments:**

| Argument   | Required | Description                       |
| ---------- | -------- | --------------------------------- |
| `subagent` | Yes      | Name of the subagent to uninstall |

**Flags:**

| Flag        | Type              | Default   | Description                                                |
| ----------- | ----------------- | --------- | ---------------------------------------------------------- |
| `--scope`   | `project \| user` | `project` | Target project or user-level configuration                 |
| `--yes`     | `boolean`         | `false`   | Skip confirmation prompt                                   |
| `--force`   | `boolean`         | `false`   | Remove even if rendered files have been modified (drifted) |
| `--preview` | `boolean`         | `false`   | Show what would be removed without making changes          |

**Behavior notes:**

- Uses `renderedFiles` from the lockfile to locate and remove all rendered agent-native files
- Detects drift (rendered file content differs from lockfile hash). Without `--force`, warns and requires confirmation for drifted files
- Removes the subagent entry from settings and lockfile

**Examples:**

```
axm subagents uninstall code-reviewer
  Remove the code-reviewer subagent and all its rendered files

axm subagents uninstall code-reviewer --preview
  See which files would be deleted

axm subagents uninstall code-reviewer --yes
  Remove without confirmation
```

---

#### `axm subagents list`

```
axm subagents list [flags]
```

**Alias:** `ls`

**Description:** List installed subagents, their source, enabled status, and which agents they are rendered for.

**Flags:**

| Flag      | Type              | Default   | Description                                                       |
| --------- | ----------------- | --------- | ----------------------------------------------------------------- |
| `--scope` | `project \| user` | `project` | List subagents from project (default) or user-level configuration |
| `--agent` | `string[]`        | —         | Show only subagents rendered for specific agent(s). Repeatable    |

**Output columns:** name, source type (registry/github/local), enabled/disabled, agents list

**Behavior notes:**

- Reads the lockfile `subagents` section
- When `--agent` is specified, filters to subagents whose `renderedFiles` include that agent (OR logic for multiple `--agent` values)
- JSON output via `--json` emits structured `subagents.list` items

**Examples:**

```
axm subagents list
  See what subagents are installed

axm subagents list --scope user
  Check user-level subagents

axm subagents list --agent claude-code
  See subagents rendered for Claude Code

axm subagents list --agent claude-code --agent cursor
  See subagents rendered for either Claude Code or Cursor
```

---

#### `axm subagents update`

```
axm subagents update [source] [flags]
```

**Description:** Update installed subagents to their latest matching versions and re-render agent-native files.

**Arguments:**

| Argument | Required | Description                                                          |
| -------- | -------- | -------------------------------------------------------------------- |
| `source` | No       | Limit update to subagents from a specific source. Omit to update all |

**Flags:**

| Flag         | Type              | Default   | Description                                             |
| ------------ | ----------------- | --------- | ------------------------------------------------------- |
| `--scope`    | `project \| user` | `project` | Update in project (default) or user-level configuration |
| `--subagent` | `string[]`        | —         | Update only specific subagent(s) by name. Repeatable    |
| `--agent`    | `string[]`        | —         | Re-render only for specific agent(s). Repeatable        |
| `--yes`      | `boolean`         | `false`   | Skip confirmation after reviewing the update plan       |
| `--force`    | `boolean`         | `false`   | Update even when rendered files have drifted            |
| `--preview`  | `boolean`         | `false`   | Show what would be updated without making changes       |

**Behavior notes:**

- Fetches latest versions matching the version constraint in settings
- After updating the canonical `SUBAGENT.md`, re-renders all agent-native files
- `--preview` shows version changes and which rendered files would change

**Examples:**

```
axm subagents update
  Update all subagents to latest matching versions

axm subagents update --subagent code-reviewer
  Update a specific subagent only

axm subagents update owner/repo
  Update subagents from a specific source

axm subagents update --preview
  See what would change before updating
```

---

#### `axm subagents new`

```
axm subagents new <name> [flags]
```

**Description:** Scaffold a new subagent for authoring. Creates both `axm-subagent.json` (manifest) and `src/SUBAGENT.md` (instructions with frontmatter) in `.axm/extensions/<owner>/subagents/<name>/`.

**Arguments:**

| Argument | Required | Description                                                                         |
| -------- | -------- | ----------------------------------------------------------------------------------- |
| `name`   | Yes      | Name of the subagent (without owner). Must match `[a-z0-9][a-z0-9-]*`, max 64 chars |

**Flags:**

| Flag            | Type                                     | Default           | Description                                            |
| --------------- | ---------------------------------------- | ----------------- | ------------------------------------------------------ |
| `--profile`     | `string`                                 | workspace default | Override the workspace profile / owner (e.g., `@acme`) |
| `--agent`       | `string[]`                               | all configured    | Agent IDs to target for initial rendering. Repeatable  |
| `--model`       | `fast \| default \| powerful \| inherit` | `default`         | Initial model hint                                     |
| `--tool-access` | `full \| readonly \| none`               | `full`            | Initial tool access level                              |
| `--background`  | `boolean`                                | `false`           | Whether the subagent runs in background mode           |
| `--yes`         | `boolean`                                | `false`           | Create the subagent without confirmation               |
| `--force`       | `boolean`                                | `false`           | Overwrite if a subagent with this name already exists  |
| `--preview`     | `boolean`                                | `false`           | Show what files would be created without creating them |

**Behavior notes:**

- Validates name format and checks for name collisions in settings
- Scaffolds `axm-subagent.json` with identity/distribution fields and `SUBAGENT.md` with frontmatter (model, toolAccess, background, description placeholder) and a starter instructions body
- Renders agent-native files for configured agents immediately (so the subagent is usable right away)
- Adds the subagent entry to settings and lockfile

**Examples:**

```
axm subagents new code-reviewer
  Scaffold a new subagent

axm subagents new code-reviewer --profile @acme
  Create under a specific owner

axm subagents new code-reviewer --tool-access readonly --model fast
  Create a read-only subagent using the fast model tier

axm subagents new security-audit --background
  Create a background subagent for async execution

axm subagents new code-reviewer --agent claude-code --agent cursor
  Render only for specific agents
```

---

#### `axm subagents publish`

```
axm subagents publish <extensions...> [flags]
```

**Description:** Publish subagent extensions to a registry. Validates both `axm-subagent.json` and `SUBAGENT.md`, syncs the manifest description from frontmatter, and uploads both files.

**Arguments:**

| Argument     | Required | Description                                                      |
| ------------ | -------- | ---------------------------------------------------------------- |
| `extensions` | Yes (1+) | FQN(s) or glob pattern(s) identifying the subagent(s) to publish |

**Flags:**

| Flag         | Type      | Default            | Description                                        |
| ------------ | --------- | ------------------ | -------------------------------------------------- |
| `--registry` | `string`  | configured default | Target registry (e.g., `local`, a registry URL)    |
| `--yes`      | `boolean` | `false`            | Skip confirmation after reviewing the publish plan |
| `--force`    | `boolean` | `false`            | Publish even if validation warnings are present    |
| `--preview`  | `boolean` | `false`            | Show what would be published without uploading     |

**Behavior notes:**

- Validates manifest completeness (required fields, version bump from published version)
- Syncs `description` from `SUBAGENT.md` frontmatter to `axm-subagent.json` before upload
- Publishes both files as the extension package
- Supports glob patterns (e.g., `axm subagents publish "code-*"`) for batch publishing

**Examples:**

```
axm subagents publish @acme/subagents/code-reviewer
  Publish a single subagent

axm subagents publish "code-*"
  Publish all subagents matching a pattern

axm subagents publish code-reviewer --registry local
  Publish to a local registry for testing

axm subagents publish code-reviewer --preview
  Review what would be published
```

---

#### `axm subagents enable`

```
axm subagents enable <name> [flags]
```

**Description:** Enable a previously disabled subagent. Re-renders agent-native files for all configured agents.

**Arguments:**

| Argument | Required | Description                    |
| -------- | -------- | ------------------------------ |
| `name`   | Yes      | Name of the subagent to enable |

**Flags:**

| Flag        | Type              | Default   | Description                                  |
| ----------- | ----------------- | --------- | -------------------------------------------- |
| `--scope`   | `project \| user` | `project` | Target project or user-level configuration   |
| `--yes`     | `boolean`         | `false`   | Skip confirmation                            |
| `--force`   | `boolean`         | `false`   | Enable even if rendered file conflicts exist |
| `--preview` | `boolean`         | `false`   | Show what would change without applying      |

**Behavior notes:**

- Sets `enabled: true` in settings
- Re-renders agent-native files (since disable removes them)

**Examples:**

```
axm subagents enable code-reviewer
  Re-enable a disabled subagent

axm subagents enable code-reviewer --preview
  See which files would be rendered
```

---

#### `axm subagents disable`

```
axm subagents disable <name> [flags]
```

**Description:** Disable a subagent without uninstalling it. Removes rendered agent-native files but preserves the canonical source and settings entry.

**Arguments:**

| Argument | Required | Description                     |
| -------- | -------- | ------------------------------- |
| `name`   | Yes      | Name of the subagent to disable |

**Flags:**

| Flag        | Type              | Default   | Description                                 |
| ----------- | ----------------- | --------- | ------------------------------------------- |
| `--scope`   | `project \| user` | `project` | Target project or user-level configuration  |
| `--yes`     | `boolean`         | `false`   | Skip confirmation                           |
| `--force`   | `boolean`         | `false`   | Disable even if rendered files have drifted |
| `--preview` | `boolean`         | `false`   | Show what would change without applying     |

**Behavior notes:**

- Sets `enabled: false` in settings
- Removes all rendered agent-native files (tracked via lockfile `renderedFiles`)
- Canonical source in `.axm/extensions/` is preserved — `enable` restores it

**Examples:**

```
axm subagents disable code-reviewer
  Disable without uninstalling

axm subagents disable code-reviewer --scope user
  Disable in user-level config
```

---

#### `axm subagents rename`

```
axm subagents rename <old-name> <new-name> [flags]
```

**Description:** Rename a subagent. Updates the canonical source, re-renders all agent-native files with the new name, and removes the old rendered files.

**Arguments:**

| Argument   | Required | Description                                                      |
| ---------- | -------- | ---------------------------------------------------------------- |
| `old-name` | Yes      | Current subagent name                                            |
| `new-name` | Yes      | New subagent name. Must match `[a-z0-9][a-z0-9-]*`, max 64 chars |

**Flags:**

| Flag        | Type              | Default   | Description                                                   |
| ----------- | ----------------- | --------- | ------------------------------------------------------------- |
| `--scope`   | `project \| user` | `project` | Target project or user-level configuration                    |
| `--yes`     | `boolean`         | `false`   | Skip confirmation                                             |
| `--force`   | `boolean`         | `false`   | Overwrite if the new name conflicts with an existing subagent |
| `--preview` | `boolean`         | `false`   | Show what would change without applying                       |

**Behavior notes:**

- Renames the extension directory, updates `axm-subagent.json` and `SUBAGENT.md` frontmatter `name` field
- Removes old rendered files (e.g., `.claude/agents/old-name.md`) and renders new ones (e.g., `.claude/agents/new-name.md`)
- Updates settings and lockfile entries

**Examples:**

```
axm subagents rename old-name new-name
  Rename a subagent

axm subagents rename old-name new-name --preview
  See what files would change
```

## Capabilities

### New Capabilities

- `subagents`: Subagent extension type — manifest schema, portable metadata model, and cross-agent rendering
- `cli-subagents-install`: Install subagent extensions into workspace agents
- `cli-subagents-uninstall`: Remove subagent extensions from workspace agents
- `cli-subagents-list`: List installed subagents and their agent mappings
- `cli-subagents-new`: Scaffold a new subagent extension for authoring
- `cli-subagents-publish`: Publish subagent extensions to a registry
- `cli-subagents-update`: Update installed subagents to latest matching versions and re-render
- `cli-subagents-enable`: Enable a disabled subagent and re-render agent-native files
- `cli-subagents-disable`: Disable a subagent without uninstalling — removes rendered files, preserves source
- `cli-subagents-rename`: Rename a subagent — updates source, settings, lockfile, and re-renders

> **New CLI patterns:** `enable`, `disable`, and `rename` are new subcommands not present in existing extension type CLI groups (skills, commands). They establish patterns that may be generalized to other extension types in future work.

### Modified Capabilities

- `extension-packs`: Packs gain the ability to include `subagents` as a constituent extension type
- `cli-init`: Init flow detects agent directories that support subagents and includes them in the configured `agents` list. When subagents are already present in agent-native directories, init notes their existence (follow-on `import` command would convert them)
- `workspace-reconciliation`: Reconciliation engine gains a subagent adapter using render-on-install (not symlinks)

## Impact

- **Core extension model** — `ExtensionTypeSchema`, `ExtensionTypePlural`, FQN parsing, manifest resolution gain `subagent` type
- **Agent adapters** — each in-scope `CodingAgent` gains subagent rendering logic (`addSubagent` / `removeSubagent`)
- **Registry** — publish and fetch flows support the `subagent` extension type
- **Settings schema** — `SettingsSchema` adds `subagents: Record<string, SubagentEntry>`
- **Lockfile schema** — subagent lock entries with `renderedFiles` map for drift detection
- **Pack resolution** — pack manifest schema includes `subagents` field; transitive visibility, orphan detection, and direct entry promotion apply
- **Sync engine** — reconciliation gains a render step for subagents (not symlinks)
- **CLI** — new `axm subagents` command group with nine subcommands
- **Telemetry** — install, uninstall, publish, new, update, enable, disable, and rename emit telemetry events following existing extension event patterns

## Cross-Change Coordination

This change shares structural patterns with the parallel `command-support` change: both add a new extension type, a CLI command group, per-agent rendering adapters, pack integration, and settings/lockfile schema extensions. The `mcp-server-management` change (already in design) follows the same shape. Design should consider whether to extract a shared rendering adapter framework (extension type → agent format mapping, managed marker injection, drift detection, conflict resolution) rather than duplicating per extension type. At minimum, the three changes should agree on common adapter interfaces so the patterns converge rather than diverge.

---

## Appendix: Agent Subagent Reference

> The full agent reference has been extracted to [agent-reference.md](./agent-reference.md) to keep this proposal focused. The reference contains detailed per-agent field tables, file paths, built-in subagents, and notable behaviors for all 11 in-scope agents plus 4 out-of-scope agents with subagent support.
