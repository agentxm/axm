## Context

Commands exist as a stub extension type in AXM today: the type is defined in `ExtensionTypeSchema`, manifest schema exists (`command.json`), refs/manager/workspace-service/settings/lockfile/reconciliation are all wired, and basic install/uninstall CLI commands work against the registry. But commands are registry-only, have no agent-specific rendering, no command-specific manifest fields (arguments, model, etc.), and a minimal CLI surface (install + uninstall only).

Skills, by contrast, are the most mature extension type: multi-source (registry, git, local, builtin), agent-aware (symlinked to per-agent `skillsDir`), and have a full CLI lifecycle (install, uninstall, list, update, new, fork, enable, disable, rename, publish). Commands need to reach a similar level of maturity but with a fundamentally different agent integration model: skills are directory-based (`SKILL.md` + supporting files symlinked into agent skill dirs), while commands are single-file rendered artifacts (AXM translates the portable manifest + `COMMAND.md` body into each agent's native command format and writes the rendered file to each agent's commands directory).

### Current state (what exists)

| Component                                                           | Status | Key file                                           |
| ------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| Extension type definition                                           | Done   | `core/unstable/extensions/common.ts`               |
| Manifest schema (common fields only)                                | Done   | `core/unstable/commands/manifest-schema.ts`        |
| Extension refs (all 4 ref types defined)                            | Done   | `core/unstable/commands/refs.ts`                   |
| Manager (registry-only materialization)                             | Done   | `core/unstable/commands/manager.ts`                |
| Workspace service methods                                           | Done   | `core/unstable/workspace/service-interface.ts`     |
| Settings schema (`commands` map)                                    | Done   | `core/unstable/settings/schema.ts`                 |
| Lockfile schema (`CommandLockEntry`)                                | Done   | `core/unstable/lockfile/schema.ts`                 |
| Taxonomy types (configured/implicit/unmanaged/installed/classified) | Done   | `core/unstable/workspace/taxonomy-types.ts`        |
| Reconciliation adapter                                              | Done   | `core/unstable/commands/reconciliation-adapter.ts` |
| CLI install/uninstall                                               | Done   | `cli/src/root/commands/`                           |
| Workflow actions (registry-only)                                    | Done   | `cli/src/root/commands/install/command-actions.ts` |

### What's missing

1. **COMMAND.md frontmatter** — behavioral fields (model, allowedTools, isolatedContext, arguments, argumentHint, autoInvocable, userInvocable, description) live in COMMAND.md frontmatter, not the manifest
2. **Command-specific manifest fields** — agents filter, agentOverrides (packaging/distribution concerns only)
3. **Agent command rendering** — translating COMMAND.md frontmatter + body into agent-native formats (11 agents, 5 distinct format families)
4. **Agent adapter extensions** — `commandsDir`, `addCommand`, `removeCommand` on `CodingAgent`
5. **Multi-source support** — manager currently validates registry-only; needs git-hosted, local, builtin
6. **CLI lifecycle** — list, update, enable, disable, new, publish commands
7. **Variable substitution engine** — `{{arguments}}`, `{{arguments[N]}}`, `{{arg:name}}` → agent-native syntax
8. **Managed-file markers** — `<!-- Managed by axm -->` in rendered files for conflict detection
9. **Rendered file tracking** — lockfile tracks rendered file paths + source hash per agent for clean sync/uninstall
10. **Lockfile agents array** — track which agents a command is rendered to (skills have this, commands don't yet)
11. **Scope-aware rendering** — project scope renders to project agent dirs, user scope renders to user agent dirs; Codex auto-redirects to user scope

## Goals / Non-Goals

**Goals:**

- Commands are a fully realized extension type on par with skills for install, uninstall, list, update, enable, disable, new, publish
- Cross-agent rendering: a single portable command installs as agent-native files into all configured agents
- Variable substitution is normalized: authors write `{{arguments}}` / `{{arg:name}}`, renderers produce agent-native syntax
- Lossy rendering is explicit: warnings at install time for unsupported features per agent
- Scope model reuses existing infrastructure (project/user, `--scope` flag, workspace service)
- Create shared rendered-extension infrastructure (managed markers, rendered-file tracking, source hash, conflict detection, content file parsing) that subagent-support and skills-alignment reuse

**Non-Goals:**

- Backward compatibility with any prior command format (there is none to preserve)
- Import from native agent command format (deferred)
- Directory-based namespace support (deferred — flat names only)
- Built-in command collision detection (AXM does not maintain per-agent built-in lists)
- `fork` or `rename` commands (skills have these; commands defer them)

## Decisions

### 1. Rendering architecture: per-agent renderer functions, not classes

Commands need 5 distinct rendering families (MD+YAML frontmatter, MD-only, `.prompt.md`+YAML, TOML, plain text) covering 11 agents. Each renderer is a pure function: `(frontmatter, commandBody, agentOverrides, options) => RenderedCommandFile`. No class hierarchy — the agent adapter calls the appropriate renderer.

**Alternatives considered:**

- (a) Renderer class hierarchy with base class and per-agent subclasses — rejected as over-abstracted for what amounts to template filling
- (b) Single renderer with agent-specific config objects — rejected because format differences (TOML vs Markdown vs plain text) are too structural for config-driven branching

**Approach:** Group renderers by format family. Agents within a family share the bulk of rendering logic; agent-specific differences (field names, variable syntax, scope constraints) are parameterized.

| Format family                   | Renderer                        | Agents                                                            |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| MD + YAML frontmatter           | `renderMarkdownWithFrontmatter` | Claude Code, Codex, OpenCode, Augment, Junie, Kilo Code, Roo Code |
| MD only (no frontmatter)        | `renderMarkdownOnly`            | Cursor                                                            |
| `.prompt.md` + YAML frontmatter | `renderPromptMd`                | Copilot                                                           |
| TOML                            | `renderToml`                    | Gemini CLI                                                        |
| Plain text                      | `renderPlainText`               | Kiro                                                              |

Each renderer receives an agent-specific config that controls: variable substitution mapping, supported frontmatter fields, file extension, and managed-by header format.

### 2. Variable substitution: compile-time replacement in rendered output

The portable manifest uses `{{arguments}}`, `{{arguments[N]}}`, and `{{arg:name}}` in `COMMAND.md`. Renderers replace these with agent-native syntax at install/sync time — not at invocation time. The rendered file contains only agent-native variables.

**Translation table (compile-time):**

| Portable           | Claude Code / Codex / OpenCode / Augment / Kilo / Roo | Cursor                     | Copilot         | Gemini                   | Junie               | Kiro                    |
| ------------------ | ----------------------------------------------------- | -------------------------- | --------------- | ------------------------ | ------------------- | ----------------------- |
| `{{arguments}}`    | `$ARGUMENTS`                                          | `$ARGUMENTS`               | `${input:args}` | `{{args}}`               | (all args appended) | (literal, with warning) |
| `{{arguments[0]}}` | `$1`                                                  | (inline into `$ARGUMENTS`) | `${input:arg1}` | (inline into `{{args}}`) | `$arg1`             | (literal, with warning) |
| `{{arg:name}}`     | (appended as context)                                 | (appended as context)      | `${input:name}` | (appended as context)    | `$name`             | (literal, with warning) |

Escape sequence `\{{` produces literal `{{` in rendered output.

### 3. Content file as source of truth for authoring; manifest for packaging

COMMAND.md uses YAML frontmatter for all behavioral/authoring fields. The manifest (`command.json`) holds packaging/distribution concerns only. This aligns with the dominant industry practice (7 of 11 agents use frontmatter for behavioral config) and matches the subagent-support approach for a consistent model across rendered extension types.

**COMMAND.md frontmatter (SOT for authoring):**

```yaml
---
description: Review the current PR for issues
model: claude-sonnet-4-20250514
allowedTools:
  - bash:*
  - read
isolatedContext: true
autoInvocable: true
userInvocable: true
argumentHint: "[scope]"
arguments:
  - name: scope
    description: Area to review
    required: false
    default: all
---
Review the code changes in the current PR...
Use {{arg:scope}} to focus the review.
```

**Manifest (SOT for packaging/distribution):**

```typescript
// command.json — only packaging/distribution fields
// CommonManifestFields (name, version, type, etc.) plus:
agents: Schema.optional(Schema.Array(Schema.String));
agentOverrides: Schema.optional(
  Schema.Record({
    key: Schema.String,
    value: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  }),
);
```

The manifest may contain derived copies of frontmatter fields (description, model, etc.) for registry search/filtering, but these are synced FROM the content file during `publish` — never edited directly in the manifest.

**CommandArgumentSchema** (used in frontmatter):

```typescript
CommandArgumentSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean), // default false
  default: Schema.optional(Schema.String),
});
```

`agentOverrides` is validated structurally at parse time (record of records) and semantically by each agent's renderer (unknown keys are ignored with a debug log, not an error).

### 4. Agent adapter: add `commandsDir` and command methods to `CodingAgent`

Extend the `CodingAgent` interface with command-specific members, following the pattern of `resolveEffectiveSkillsDir` for skills and `addMcpServer`/`removeMcpServer` for MCP servers.

```typescript
// New members on CodingAgent
resolveEffectiveCommandsDir(args: ResolveCommandsDirArgs): Effect<ResolveCommandsDirOutcome, AppError, Path.Path>
addCommand(args: AddCommandArgs): Effect<CommandSyncOutcome, AppError, FileSystem | Path>
removeCommand(args: RemoveCommandArgs): Effect<CommandSyncOutcome, AppError, FileSystem | Path>
```

`addCommand` calls the appropriate renderer, writes the rendered file to the agent's commands directory, and returns the sync outcome (including any lossy-rendering warnings). `removeCommand` deletes the rendered file.

**Scope-aware directory resolution:** `resolveEffectiveCommandsDir` returns the project or user commands directory for the agent based on the workspace scope. For Codex, this always returns the user-scope path (`~/.codex/prompts/`) regardless of requested scope.

**Agent-specific constraints handled in adapters:**

- **Codex:** Forces user scope; logs informational note
- **Augment:** Checks for Claude Code overlap before writing; skips if same command already rendered to `.claude/commands/`
- **Copilot:** Warns on `--scope user` (no filesystem-based user scope)
- **Kilo Code:** Resolves `.opencode/commands/` vs `.kilo/commands/` based on which directory exists

### 5. Lockfile: add `agents` array to `CommandLockEntry`

Currently `CommandLockEntry` uses `BaseCommonFields` (no `agents` array), unlike `SkillLockEntry` which uses `CommonFields` (includes `agents`). Add `agents` to track which agents a command is rendered to, enabling targeted uninstall and sync.

Switch `CommandLockEntrySchema` from `BaseCommonFields` to `CommonFields` (which includes `agents: Schema.Array(Schema.String)`). This is not a backward compatibility concern — there are no production lockfiles with command entries to migrate.

### 6. Manager: expand beyond registry-only

The current `CommandManager.materializeInstall()` validates that the ref is registry-sourced and rejects others. Expand to support all 4 ref types, following the skill manager pattern:

- **Registry:** Extract zip to canonical path (existing behavior)
- **Git-hosted:** Clone/checkout to canonical path, same as skill manager
- **Local:** Symlink or copy from local path, same as skill manager
- **Builtin:** Copy from bundled source, same as skill manager

After materialization, the manager triggers agent rendering: for each configured agent, call `agent.addCommand()` with the materialized manifest and command body. This is the key difference from skills (where materialization symlinks to agent dirs) — commands are rendered, not symlinked.

### 7. Install flow: materialize then render to agents

The install sequence for commands:

1. **Resolve source** — parse source string, discover refs (existing workflow)
2. **Materialize** — extract/clone/symlink command package to canonical `.axm/extensions/` path
3. **Read content file** — parse COMMAND.md frontmatter (behavioral config) and body from materialized path; read `command.json` for packaging fields (agents filter, agentOverrides)
4. **Render to agents** — for each configured agent (filtered by manifest `agents` if set), call `agent.addCommand()` which:
   - Resolves the agent's commands directory (scope-aware)
   - Checks for existing file: no marker → conflict (block unless `--force`); marker present → re-render; no file → render
   - Calls the appropriate format-family renderer
   - Writes the rendered file with managed-by marker
   - Collects and returns lossy-rendering warnings
5. **Update settings** — write command entry to settings.json
6. **Update lockfile** — write lock entry with `agents` array, entry-level `sourceHash`, `renderedFiles` map (array of `{ path }` per agent)
7. **Report** — display install result with any warnings

Uninstall reverses steps 4-6: remove rendered files from each agent listed in lockfile `renderedFiles`, remove settings entry, remove lockfile entry, remove materialized files.

### 8. CLI commands: follow skills pattern for list, update, enable, disable, new, publish

| Command   | Handler pattern                                                         | Notes                                                |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `list`    | Read workspace service `getClassifiedCommands()`, format as table       | Show name, source, enabled, agents                   |
| `update`  | Re-resolve source, update materialized files, re-render to agents       | Preserves settings; updates lockfile source hash     |
| `enable`  | Set `enabled: true` in settings, re-render to agents                    | Follows skill enable pattern                         |
| `disable` | Set `enabled: false` in settings, remove rendered files from agents     | Follows skill disable pattern                        |
| `new`     | Scaffold `command.json` + `COMMAND.md` in current directory             | Interactive prompts for name, description, arguments |
| `publish` | Sync frontmatter fields to manifest, validate, pack, upload to registry | Follows skill publish pattern                        |

All commands accept `--scope` flag (default: project). `list` shows commands from the active scope. `enable`/`disable` operate on the active scope's settings.

`--preview` is supported on state-changing operations: `install`, `uninstall`, `update`, `enable`, `disable`, `sync`. It displays what would happen without writing any files.

### 9. Managed-file marker, rendered file tracking, and shared infrastructure

Each rendered command file starts with a static managed-by marker appropriate to its format. The marker identifies AXM ownership and points to the relevant CLI help for discoverability.

| Format                  | Marker                                                |
| ----------------------- | ----------------------------------------------------- |
| Markdown (all variants) | `<!-- Managed by axm — see "axm commands --help" -->` |
| TOML                    | `# Managed by axm — see "axm commands --help"`        |
| Plain text              | `# Managed by axm — see "axm commands --help"`        |

The marker is static — no timestamp or hash in the file. This avoids noisy git diffs on every sync when only the timestamp changes.

**Rendered file tracking in lockfile:** Each command's lock entry includes an entry-level `sourceHash` (hash of the portable inputs: COMMAND.md frontmatter + body + relevant manifest fields) and a `renderedFiles` map keyed by agent ID, where each value is an array of `{ path }` objects tracking rendered file locations. The `sourceHash` is entry-level because all agents share the same canonical source — it determines when re-rendering is needed. The array-per-agent shape accommodates agents that produce multiple files (e.g. Kiro dual-format in subagent-support). Hashing the inputs rather than the rendered output avoids false drift from Prettier or editor reformatting.

**Conflict detection on install:** If a file exists at the render target path without an axm marker, it's a conflict (pre-existing manual file). Install blocks unless `--force` is passed. If the marker is present, axm owns the file and re-renders freely.

**Sync behavior:** Marker present → re-render when source hash changes. File missing but extension installed → re-render (recreate). Uninstall/disable → delete all rendered files tracked in lockfile.

**Shared infrastructure:** The marker generation/detection, rendered-file tracking types, source hash computation, conflict detection, and content file frontmatter parsing are built as shared modules in `core/unstable/extensions/`:

| Module                  | Purpose                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `rendered-files.ts`     | `RenderedFilesMapSchema` (lockfile mixin), `sourceHash` computation, path-based cleanup |
| `managed-marker.ts`     | `generateMarker(type, format)`, `isManagedByAxm(content)`, `stripMarker(content)`       |
| `conflict-detection.ts` | Pre-write conflict check (marker-based ownership detection)                             |
| `content-file.ts`       | YAML frontmatter + body parser (shared by COMMAND.md, SUBAGENT.md)                      |
| `rendering-warnings.ts` | `LossyRenderingWarning` type for per-feature-per-agent warnings                         |

Subagent-support and skills-alignment reuse these modules. The renderer functions themselves are NOT shared — format families differ between commands and subagents (e.g. Codex uses MD+YAML for commands but TOML for subagents). Only the surrounding infrastructure is common.

### 10. Augment cross-tool dedup

When rendering to Augment, the adapter checks whether Claude Code is also a configured agent in the workspace. If so, and if the same command was already rendered to `.claude/commands/`, the Augment adapter skips writing to `.augment/commands/` because Augment natively reads `.claude/commands/`. The skip is logged at info level. If Claude Code is not configured, Augment renders normally to `.augment/commands/`.

This check happens at render time, not at install planning time, so it adapts to workspace configuration changes on re-sync.

## Risks / Trade-offs

**[Agent command path deprecation] → Adapter update**
Claude Code and Codex have deprecated their command paths. If either removes the path entirely, the adapter must be updated to target the replacement (likely the skills path). The portable COMMAND.md is the source of truth, so re-rendering is trivial — but users would need to re-sync.

**[Lossy rendering accumulation] → Warn clearly, document per-agent**
As commands use more portable features, more agents will trigger lossy-rendering warnings. Risk of warning fatigue. Mitigation: warnings are per-feature-per-agent, shown once at install time, and structured (not free-text) so they can be suppressed or filtered in future versions.

**[Variable substitution edge cases] → Escape hatch via agentOverrides**
The compile-time substitution model handles the common cases but can't cover every agent's quirks (e.g., Codex named placeholders like `$FILE`). Authors who need precise control use `agentOverrides` to provide per-agent prompt body patches. This is documented but adds authoring complexity for advanced use cases.

**[TOML rendering fidelity] → Limited by format**
Gemini CLI's TOML format supports only `prompt` and `description` fields. Most portable manifest fields (arguments, model, allowedTools, isolatedContext) have no TOML equivalent. These are silently dropped with a warning. Gemini commands will always be simpler than their Markdown counterparts.

**[Kiro no-substitution] → Commands without arguments work fine**
Kiro has no variable substitution for file-based prompts. Commands with arguments install but render as literal text. This is warned at install time and documented. Commands without arguments work perfectly.

**[Augment dedup timing] → Re-sync resolves**
The Augment cross-tool dedup check at render time means adding/removing Claude Code from agents after initial install could leave stale or missing files. `axm sync` resolves this by re-evaluating all agents.
