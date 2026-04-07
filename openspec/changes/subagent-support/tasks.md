> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Subagent Manifest and Content File Schema

> **Subagent:** Run this entire phase in a single subagent.

Creates the `@axm.sh/core/unstable/subagents` module with manifest schema (`subagent.json`), content file module (`subagent-content.ts` — subagent-specific frontmatter schema and parsing), and directory layout constants. No predecessor phases.

**Reference:** `subagents/spec.md` — Subagent manifest schema, Subagent content file, Directory layout, FQN segment.

**Effect v4 patterns for this phase:**

- Use `Schema.Class` for `SubagentManifest`, `SubagentContent`, and `SubagentFrontmatter` — gives validated constructors, `_tag` pattern matching, and `decodeResult` for synchronous hot-path use
- Define `FrontmatterToManifestFields` as a `Schema.encodeTo` transformation for the frontmatter → manifest sync — type-safe bidirectional transformation (same pattern as command-support's `command-content.ts`)
- Use `Schema.withConstructorDefault` for boolean fields (`background: false`)
- Use branded types from shared infrastructure: `SourceHash`, `RenderedFilePath`, `ManagedMarker`

- [ ] 1.1 Create `packages/core/src/unstable/subagents/` directory structure
- [ ] 1.2 Define `SubagentManifestSchema` as `Schema.Class` in `manifest-schema.ts` extending `CommonManifestBaseFields` with subagent-specific fields: `model` (enum `"fast" | "default" | "powerful" | "inherit"` or concrete model ID string), `toolAccess` (`"full" | "readonly" | "none"`), `background` (boolean, `withConstructorDefault(() => false)`), `agents` (optional `string[]`). Set manifest filename to `subagent.json` and schema URL to `https://axm.sh/schemas/subagent.schema.json`. Follow patterns from `packages/core/src/unstable/skills/manifest-schema.ts`
- [ ] 1.3 Create `subagent-content.ts` in `packages/core/src/unstable/subagents/` — the subagent-specific content file module. Define `SubagentFrontmatterSchema` as `Schema.Class` for SUBAGENT.md frontmatter fields: `name`, `description`, `model`, `toolAccess`, `background`, `overrides` (optional map keyed by agent ID with arbitrary agent-native fields). Define `parseSubagentMd(content)` that calls the shared `parseFrontmatter` utility from `core/unstable/extensions/frontmatter.ts` and applies `SubagentFrontmatterSchema` to the result. Define `FrontmatterToManifestFields` as a `Schema.encodeTo` transformation projecting `description`, `model`, `toolAccess`, `background` from frontmatter to manifest shape for publish-time sync. The Markdown body after frontmatter is the instructions content
- [ ] 1.4 Define directory layout constants: canonical path `.axm/extensions/<owner>/subagents/<name>/`, manifest at `subagent.json`, content at `src/SUBAGENT.md`. Follow pattern from skills
- [ ] 1.5 Create `subagent.example.json` example manifest file (analogous to `packages/core/src/unstable/skills/skill.example.json`)
- [ ] 1.6 Export from `packages/core/src/unstable/subagents/index.ts` barrel
- [ ] 1.7 Wire into `packages/core/src/unstable/index.ts` top-level barrel
- [ ] 1.8 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 2. Settings and Lockfile Schema Extensions

> **Subagent:** Run this entire phase in a single subagent.

Extends the settings schema with a `subagents` map and the lockfile schema with subagent lock entries including `sourceHash` and per-agent `renderedFiles`. Depends on Phase 1.

**Reference:** `subagents/spec.md` — Lockfile subagent entries; proposal §Settings Integration, §Lockfile Integration.

- [ ] 2.1 Add `SubagentSettingsEntrySchema` to `packages/core/src/unstable/settings/schema.ts` — union of string (source) or object `{source, enabled}`, following `SkillEntrySchema` pattern. Add `subagents: optional Record<string, SubagentSettingsEntry>` to `SettingsSchema`
- [ ] 2.2 Add workspace service accessors for subagent settings in the settings service — `getSubagent`, `setSubagent`, `removeSubagent`, `getAllSubagents` following patterns from existing skill/command settings accessors
- [ ] 2.3 Write tests for subagent settings CRUD operations
- [ ] 2.4 Define `SubagentLockEntry` schema — union of source types (github, gitlab, bitbucket, azurerepos, git, local, registry) with fields: `agents`, `installedAt`, `updatedAt`, `gitTreeHash` (optional), `sourceHash` (entry-level, hash of SUBAGENT.md frontmatter + body), `renderedFiles` (map of agent ID → array of `{ path }`) — reuse the shared `RenderedFilesMapSchema` from `core/unstable/extensions/rendered-files.ts` (created in command-support)
- [ ] 2.5 Add `subagents: optional Record<string, SubagentLockEntry>` to `LockfileSchema`
- [ ] 2.6 Add lockfile service accessors for subagent entries — `getSubagentEntry`, `setSubagentEntry`, `removeSubagentEntry`, `getAllSubagentEntries`
- [ ] 2.7 Write tests for subagent lockfile entry CRUD and schema validation (including `sourceHash` and `renderedFiles` map)
- [ ] 2.8 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 3. Pack Manifest Schema Extension

> **Subagent:** Run this entire phase in a single subagent.

Extends the pack manifest schema and resolution logic to include `subagents` alongside skills, commands, and MCP servers. Can be worked in parallel with Phase 2.

**Reference:** `extension-packs/spec.md` — Pack manifest includes subagents field; proposal §Pack Integration.

- [ ] 3.1 Add `subagents: optional ExtensionDependencyConstraintMap` to `ExtensionPackManifestSchema` in `packages/core/src/unstable/packs/manifest-schema.ts`
- [ ] 3.2 Add `resolvedSubagents` field to `ExtensionPackLockEntry` in `packages/core/src/unstable/lockfile/schema.ts` — map of FQN to resolved version, following `resolvedSkills` pattern
- [ ] 3.3 Update pack resolution logic to resolve subagent dependencies alongside existing extension types
- [ ] 3.4 Write tests for pack manifest with subagents field and pack resolution including subagent dependencies
- [ ] 3.5 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 4. Subagent Rendering Engine

> **Subagent:** Run this entire phase in a single subagent. This is the largest phase — consider splitting into sub-phases if needed.

Implements the core rendering engine that translates portable SUBAGENT.md into agent-native formats. This is the key differentiator from skills (symlinks) — subagents use render-on-install. Depends on Phase 1.

**Reference:** `subagents/spec.md` — Per-format-family rendering, Model tier mapping, Tool access mapping, Agent-specific overrides, Managed-file header, Kiro dual-format, Roo Code read-modify-write; proposal §Agent Adapter Rendering, §Model Mapping.

**Effect v4 patterns for this phase:**

- Use `Schema.Class` for `RenderInput`, `RenderOutput`, and `RenderOutcome` — tagged types enable pattern matching on outcomes
- Model tier mapping and tool access mapping as `Schema.encodeTo` transformations: portable enum → agent-native string, with lossy mappings producing `LossyRenderingWarning` (Schema.Class from `core/unstable/commands/rendering-warnings.ts`)
- Use `Layer.suspend()` for the adapter registry — defer adapter construction, build only adapters for configured agents
- Each rendering adapter is a pure function `(input: RenderInput) => Effect<RenderOutcome>` — compose via `Effect.forEach` across agents
- Roo Code read-modify-write uses `Effect.acquireRelease` to ensure `.roomodes` file integrity during concurrent operations

- [ ] 4.1 Define rendering types as `Schema.Class` in `packages/core/src/unstable/subagents/rendering/types.ts` — `RenderInput` (parsed SUBAGENT.md frontmatter + body), `RenderOutput` (rendered file content + `RenderedFilePath`), `RenderOutcome` (tagged: `Rendered` with optional `LossyRenderingWarning[]`, or `Skipped` with reason)
- [ ] 4.2 Reuse shared managed marker utilities from `core/unstable/extensions/managed-marker.ts` (created in command-support) — subagent markers use the same `generateMarker("subagent", format)` pattern with the extension type parameterized, returns `ManagedMarker` branded type
- [ ] 4.3 Reuse shared source hash computation from `core/unstable/extensions/rendered-files.ts` (created in command-support) — SHA-256 hash of SUBAGENT.md frontmatter + body (portable inputs only, not overrides), returns `SourceHash` branded type
- [ ] 4.4 Implement model tier mapping as a `Schema.encodeTo` transformation in `packages/core/src/unstable/subagents/rendering/model-mapping.ts` — maps `"fast" | "default" | "powerful" | "inherit"` to agent-specific values per the proposal mapping table. Concrete model IDs pass through verbatim. Returns both the mapped value and any `LossyRenderingWarning` for lossy mappings
- [ ] 4.5 Implement tool access mapping as a `Schema.encodeTo` transformation in `packages/core/src/unstable/subagents/rendering/tool-access-mapping.ts` — maps `"full" | "readonly" | "none"` to agent-native tool control fields. Document lossy mappings (Codex readonly=none, Cursor readonly=none) and return warnings
- [ ] 4.6 Implement Markdown+YAML adapter in `packages/core/src/unstable/subagents/rendering/adapters/markdown-yaml.ts` — covers Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Augment, Junie, Kilo Code, Kiro IDE. Each agent has field-name and semantics differences; use per-agent config `Schema.Struct` with `withConstructorDefault` for agent-specific defaults within the shared adapter. Merge `overrides` on top of portable fields
- [ ] 4.7 Implement TOML adapter in `packages/core/src/unstable/subagents/rendering/adapters/toml.ts` — covers Codex only. Maps body to `developer_instructions`, model/sandbox_mode fields. Merge overrides
- [ ] 4.8 Implement JSON adapter in `packages/core/src/unstable/subagents/rendering/adapters/json.ts` — covers Kiro CLI only. Maps body to `prompt` field. Include `_axm_managed` marker
- [ ] 4.9 Implement Roo Code adapter in `packages/core/src/unstable/subagents/rendering/adapters/roo.ts` — read-modify-write on `.roomodes` (project scope) or `settings/custom_modes.yaml` (user scope) using `Effect.acquireRelease` to ensure file integrity during concurrent operations. Split body: first paragraph → `roleDefinition`, remainder → `customInstructions`. Add `_axm_managed` field to mode entry. Preserve manually-defined modes
- [ ] 4.10 Implement adapter registry in `packages/core/src/unstable/subagents/rendering/index.ts` using `Layer.suspend()` to defer adapter construction — maps agent ID to appropriate adapter, constructing only adapters for configured agents. Handle Kiro dual-format (returns two `RenderOutput` items — `.md` for IDE and `.json` for CLI)
- [ ] 4.11 Write comprehensive tests for each adapter covering: all three `toolAccess` levels, all four `model` tiers, `background` flag rendering, override merging, managed marker injection, lossy mapping warnings
- [ ] 4.12 Write tests for Kiro dual-format rendering (two files per agent)
- [ ] 4.13 Write tests for Roo Code read-modify-write: preserving manual modes, updating existing AXM mode, adding new AXM mode, removing AXM mode
- [ ] 4.14 Write tests for source hash computation (shared utility from command-support)
- [ ] 4.15 Export rendering module from subagents barrel
- [ ] 4.16 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 5. CodingAgent Interface Extensions

> **Subagent:** Run this entire phase in a single subagent.

Extends the `CodingAgent` interface with subagent-specific methods and implements them for all 11 in-scope agents. Depends on Phase 4 (rendering engine).

**Reference:** `subagents/spec.md` — Agent adapter subagent methods, Scope-aware rendering; proposal §Scoping decision, §Installation.

**Effect v4 patterns for this phase:**

- Use `Effect.forEach(agents, addSubagent, { concurrency: "unbounded" })` for parallel rendering across agents
- Use `Effect.all` with `concurrency: "unbounded"` for concurrent conflict detection before any writes
- Use `Effect.acquireRelease` for the multi-agent render lifecycle — rollback rendered files on partial failure

- [ ] 5.1 Extend `CodingAgent` interface in `packages/core/src/unstable/agents/coding-agent.ts` with: `resolveEffectiveSubagentsDir(args)` returning supported/unsupported/disabled/misconfigured outcome (same pattern as `resolveEffectiveSkillsDir`), `addSubagent(args)` returning sync outcome with warnings, `removeSubagent(args)` returning sync outcome
- [ ] 5.2 Define `AddSubagentArgs` — includes `RenderInput`, scope (project/user), force flag. Define `RemoveSubagentArgs` — includes subagent name, scope, rendered file paths from lockfile
- [ ] 5.3 Implement subagent methods for Claude Code agent (`packages/core/src/unstable/agents/claude-code/`). Project dir: `.claude/agents/`, user dir: `~/.claude/agents/`
- [ ] 5.4 Implement subagent methods for remaining 10 agents, using the rendering engine adapters. Each agent's `addSubagent` calls the appropriate rendering adapter and writes to the correct directory:
  - Copilot: `.github/agents/` / VS Code profile dir
  - Codex: `.codex/agents/` / `~/.codex/agents/`
  - Cursor: `.cursor/agents/` / `~/.cursor/agents/`
  - Gemini CLI: `.gemini/agents/` / `~/.gemini/agents/`
  - OpenCode: `.opencode/agents/` / `~/.config/opencode/agents/`
  - Augment: `.augment/agents/` / `~/.augment/agents/`
  - Junie: `.junie/agents/` / `~/.junie/agents/`
  - Kilo Code: `.kilo/agents/` / `~/.config/kilo/agents/`
  - Kiro: `.kiro/agents/` / `~/.kiro/agents/` (dual-format: `.md` + `.json`)
  - Roo Code: `.roomodes` / `settings/custom_modes.yaml` (read-modify-write)
- [ ] 5.5 Implement conflict detection in `addSubagent` — check for existing file without managed marker before writing; return conflict error unless force flag is set
- [ ] 5.6 Write tests for `addSubagent` and `removeSubagent` for representative agents (at minimum: one Markdown+YAML agent, Codex TOML, Kiro dual-format, Roo Code read-modify-write)
- [ ] 5.7 Write tests for conflict detection (unmanaged file exists, managed file exists, no file exists)
- [ ] 5.8 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 6. SubagentManager Service

> **Subagent:** Run this entire phase in a single subagent.

Implements the `SubagentManager` Effect service for subagent CRUD operations: materialize install/uninstall, settings/lockfile management. Follows `SkillManager` patterns. Depends on Phases 2 and 5.

**Reference:** `subagents/spec.md` — Directory layout, Lockfile subagent entries; `cli-subagents-install/spec.md` — Install flow.

**Effect v4 patterns for this phase:**

- Use `Effect.forEach(agents, addSubagent, { concurrency: "unbounded" })` for parallel rendering during `materializeInstall`
- Use `Effect.acquireRelease` for the render lifecycle — on partial failure, rollback already-rendered files
- Use `decodeResult` (synchronous) for source hash comparison in the skip-render fast path — avoids Effect overhead in reconciliation hot path
- Use `Effect.all` with `concurrency: "unbounded"` for batch conflict detection
- Use `Stream.mergeAll` for multi-source discovery when resolving from registry + git + local simultaneously

- [ ] 6.1 Define `SubagentExtensionRef` types in `packages/core/src/unstable/subagents/refs.ts` — union of `GitHostedSubagentRef`, `RegistrySubagentRef`, `LocalSubagentRef`, following patterns from `packages/core/src/unstable/skills/refs.ts`
- [ ] 6.2 Define `SubagentExtensionTarget` in `packages/core/src/unstable/workspace/service-interface.ts` — `{type: "subagent", name: string}`. Add to the `ExtensionTarget` union type
- [ ] 6.3 Create `SubagentManager` service in `packages/core/src/unstable/subagents/manager.ts` implementing `ExtensionManager<SubagentExtensionRef>`:
  - `isInstalled` — checks settings for existing entry
  - `materializeInstall` — copies canonical source to `.axm/extensions/`, reads SUBAGENT.md, renders to all configured agents concurrently via `Effect.forEach(agents, addSubagent, { concurrency: "unbounded" })`, uses `Effect.acquireRelease` for rollback on partial failure, records `renderedFiles` map in lockfile
  - `materializeUninstall` — removes rendered files concurrently using lockfile `renderedFiles` paths via `Effect.forEach`, removes canonical source directory
  - `upsertSettingsEntry` / `removeSettingsEntry`
  - `upsertLockfileEntry` / `removeLockfileEntry`
- [ ] 6.4 Implement source-hash-based skip logic in `materializeInstall` — use `decodeResult` (synchronous) to compare lockfile `sourceHash` with current SUBAGENT.md hash; skip re-rendering when unchanged
- [ ] 6.5 Create `SubagentManagerLive` layer wiring dependencies (FileSystem, Path, CodingAgentRepository, Settings, Lockfile)
- [ ] 6.6 Write tests for `SubagentManager` covering: fresh install with rendering, re-install with source hash skip, uninstall removing rendered files, settings/lockfile CRUD
- [ ] 6.7 Export from subagents barrel and wire into workspace service
- [ ] 6.8 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 7. Subagent Reconciliation Adapter

> **Subagent:** Run this entire phase in a single subagent.

Implements the `ReconciliationAdapter` for subagents in the workspace reconciliation engine. Unlike skills (symlinks), subagent reconciliation involves a render step. Depends on Phase 6.

**Reference:** `workspace-reconciliation/spec.md` — all requirements; proposal §Reconciliation Flow.

**Effect v4 patterns for this phase:**

- Use `decodeResult` (synchronous) for source hash comparison in the reconciliation hot path — called per-subagent per-sync, must be fast
- Use `Effect.forEach` with concurrency for parallel re-rendering when source changes
- Use `Effect.all` for concurrent agent list change detection (new agents added, old removed)

- [ ] 7.1 Create `packages/core/src/unstable/subagents/reconciliation-adapter.ts` implementing `ReconciliationAdapter` with `type: "subagents"`:
  - `scanDeclarations` — reads settings `subagents` map, builds declarations including enabled/disabled state
  - `checkDiskCompatibility` — validates canonical source exists, reads SUBAGENT.md, uses `decodeResult` (synchronous) for source hash comparison against lockfile
- [ ] 7.2 Implement render-on-reconcile logic: when source hash has changed, re-render all agent-native files. Overwrite rendered files that contain the managed marker (no per-file content hash drift detection)
- [ ] 7.3 Implement agent list change handling: when `agents` in settings changes, render for newly added agents (respecting each subagent's `agents` filter), remove rendered files for removed agents
- [ ] 7.4 Implement disabled subagent cleanup: if `enabled: false`, remove rendered files but keep canonical source and lockfile entry
- [ ] 7.5 Implement orphan cleanup: remove rendered files and lockfile entries for subagents absent from settings and packs
- [ ] 7.6 Implement managed marker verification: before overwriting a rendered file, verify it contains the AXM managed marker. Files without marker are treated as conflicts
- [ ] 7.7 Implement frontmatter-to-manifest sync during reconciliation: sync `description`, `model`, `toolAccess`, `background` from SUBAGENT.md frontmatter to `subagent.json`
- [ ] 7.8 Register the subagent reconciliation adapter in the adapter registry (`packages/core/src/unstable/workspace/reconciliation.ts`)
- [ ] 7.9 Write tests: source unchanged (skip render), source changed (re-render + overwrite), agent added (render for new agent), agent removed (delete files), disabled subagent (remove files), orphan cleanup, managed marker conflict
- [ ] 7.10 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 8. CLI Parent Command Group

> **Subagent:** Run this entire phase in a single subagent.

Creates the `axm subagents` parent command with subcommand stubs. Depends on Phase 1 (types exist for imports).

**Reference:** proposal §CLI Commands — parent command.

- [ ] 8.1 Create `packages/cli/src/root/subagents/command.ts` — parent command `subagents` with description "Install, update, and manage subagents". Wire nine subcommand imports (install, uninstall, list, update, new, publish, enable, disable, rename) — initially as stubs returning "not yet implemented"
- [ ] 8.2 Wire the subagents parent command into `packages/cli/src/app.ts` in the EXTENSIONS group alongside skills, packs, commands, and mcp-servers
- [ ] 8.3 Verify `pnpm axm subagents --help` shows the parent help with subcommand list
- [ ] 8.4 Run `pnpm typecheck`, `pnpm lint` — fix any failures

## 9. CLI — `axm subagents install`

> **Subagent:** Run this entire phase in a single subagent.

Implements the install subcommand. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-install/spec.md` — all requirements; proposal §`axm subagents install`.

- [ ] 9.1 Create `packages/cli/src/root/subagents/install/` directory with `command.ts`, `handler.ts`, and `plan.ts`
- [ ] 9.2 Define install command with flags: `--scope` (project/user), `--subagent` (repeatable string[]), `--agent` (repeatable string[]), `--all` (boolean), `--yes`, `--force`, `--preview`. Positional argument: `source` (required)
- [ ] 9.3 Implement install handler flow: resolve source → discover subagents in source → prompt for selection (unless `--subagent` or `--all`) → materialize package → read manifest + SUBAGENT.md → render to agents → update settings + lockfile
- [ ] 9.4 Implement source resolution supporting: FQN (`@owner/subagents/name@version`), bare name (resolve via default owner), local path (`./path`), `file://` URL, git sources (`github:owner/repo`)
- [ ] 9.5 Implement multi-subagent discovery: scan source for `subagent.json` files when source is a repo or directory
- [ ] 9.6 Implement `--agent` flag: restrict rendering to specified agents, intersected with manifest `agents` filter
- [ ] 9.7 Implement `--preview` flag: show install plan (files to create, agents to render for) without making changes
- [ ] 9.8 Implement conflict handling: detect name collision (same source = idempotent re-render; different source = error unless `--force`)
- [ ] 9.9 Implement lossy rendering warnings at install time — display per-agent warnings for unsupported features
- [ ] 9.10 Write tests for install handler: fresh install, re-install (idempotent), conflict detection, `--agent` filtering, `--preview`, multi-subagent discovery, `--scope user`
- [ ] 9.11 Replace the install stub in the parent command with the real implementation
- [ ] 9.12 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 10. CLI — `axm subagents uninstall`

> **Subagent:** Run this entire phase in a single subagent.

Implements the uninstall subcommand. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-uninstall/spec.md` — all requirements; proposal §`axm subagents uninstall`.

- [ ] 10.1 Create `packages/cli/src/root/subagents/uninstall/` directory with `command.ts` and `handler.ts`
- [ ] 10.2 Define uninstall command with flags: `--scope`, `--yes`, `--force`, `--preview`. Positional argument: `subagent` (required)
- [ ] 10.3 Implement uninstall handler: validate subagent exists → remove rendered files (using lockfile `renderedFiles` paths) → remove canonical source → update settings + lockfile
- [ ] 10.4 Write tests: successful uninstall, subagent not found error, `--preview`
- [ ] 10.5 Replace the uninstall stub in the parent command
- [ ] 10.6 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 11. CLI — `axm subagents list`

> **Subagent:** Run this entire phase in a single subagent.

Implements the list subcommand. Depends on Phase 8 (and Phase 2 for settings/lockfile reads).

**Reference:** `cli-subagents-list/spec.md` — all requirements; proposal §`axm subagents list`.

- [ ] 11.1 Create `packages/cli/src/root/subagents/list/` directory with `command.ts` and `handler.ts`
- [ ] 11.2 Define list command with flags: `--scope`, `--agent` (repeatable string[]). Alias: `ls`
- [ ] 11.3 Implement list handler: read lockfile `subagents` section → format output with columns: name, source type, enabled/disabled, agents list. Filter by `--agent` using OR logic
- [ ] 11.4 Implement `--json` output: structured `subagents.list` items
- [ ] 11.5 Write tests: list with subagents present, empty list, `--agent` filter, `--json` output
- [ ] 11.6 Replace the list stub in the parent command
- [ ] 11.7 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 12. CLI — `axm subagents new`

> **Subagent:** Run this entire phase in a single subagent.

Implements the new (scaffold) subcommand. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-new/spec.md` — all requirements; proposal §`axm subagents new`.

- [ ] 12.1 Create `packages/cli/src/root/subagents/new/` directory with `command.ts` and `handler.ts`
- [ ] 12.2 Define new command with flags: `--profile`, `--agent` (repeatable), `--model` (`fast | default | powerful | inherit`), `--tool-access` (`full | readonly | none`), `--background`, `--yes`, `--force`, `--preview`. Positional argument: `name` (required)
- [ ] 12.3 Implement new handler: validate name (`[a-z0-9][a-z0-9-]*`, max 64 chars) → check name collision → scaffold `subagent.json` + `src/SUBAGENT.md` with starter content → render to configured agents immediately → update settings + lockfile
- [ ] 12.4 Implement starter `SUBAGENT.md` template with frontmatter (name, description placeholder, model, toolAccess, background) and a starter instructions body
- [ ] 12.5 Write tests: scaffold with defaults, custom flags, name collision (error and `--force`), name validation failure, `--preview`, immediate rendering after scaffold
- [ ] 12.6 Replace the new stub in the parent command
- [ ] 12.7 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 13. CLI — `axm subagents publish`

> **Subagent:** Run this entire phase in a single subagent.

Implements the publish subcommand. Depends on Phase 8.

**Reference:** `cli-subagents-publish/spec.md` — all requirements; proposal §`axm subagents publish`.

- [ ] 13.1 Create `packages/cli/src/root/subagents/publish/` directory with `command.ts` and `handler.ts`
- [ ] 13.2 Define publish command with flags: `--registry`, `--yes`, `--force`, `--preview`. Positional argument: `extensions` (variadic, required)
- [ ] 13.3 Implement publish handler: validate manifest completeness → validate version bump from published version → sync frontmatter to manifest (`description`, `model`, `toolAccess`, `background`) → upload both `subagent.json` and `SUBAGENT.md` to registry
- [ ] 13.4 Implement glob pattern support for batch publishing (e.g., `"code-*"`)
- [ ] 13.5 Write tests: successful publish, validation failure, frontmatter sync, glob matching, `--preview`, `--registry` targeting
- [ ] 13.6 Replace the publish stub in the parent command
- [ ] 13.7 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 14. CLI — `axm subagents update`

> **Subagent:** Run this entire phase in a single subagent.

Implements the update subcommand with re-rendering after version bumps. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-update/spec.md` — all requirements; proposal §`axm subagents update`.

- [ ] 14.1 Create `packages/cli/src/root/subagents/update/` directory with `command.ts` and `handler.ts`
- [ ] 14.2 Define update command with flags: `--scope`, `--subagent` (repeatable), `--agent` (repeatable), `--yes`, `--force`, `--preview`. Optional positional argument: `source`
- [ ] 14.3 Implement update handler: fetch latest versions matching constraints → update canonical `SUBAGENT.md` → re-render all agent-native files → update lockfile (sourceHash, renderedFiles)
- [ ] 14.4 Implement `--subagent` flag for selective update
- [ ] 14.5 Write tests: update with version bump + re-render, selective update, `--preview`, no updates available
- [ ] 14.6 Replace the update stub in the parent command
- [ ] 14.7 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 15. CLI — `axm subagents enable` and `disable`

> **Subagent:** Run this entire phase in a single subagent.

Implements enable and disable subcommands. These are new CLI patterns not present in other extension types. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-enable/spec.md`, `cli-subagents-disable/spec.md` — all requirements.

- [ ] 15.1 Create `packages/cli/src/root/subagents/enable/` with `command.ts` and `handler.ts`
- [ ] 15.2 Define enable command: positional `name`, flags `--scope`, `--yes`, `--force`, `--preview`
- [ ] 15.3 Implement enable handler: set `enabled: true` in settings → re-render agent-native files from canonical source → update lockfile `renderedFiles`. Handle conflict detection (unmanaged file at render path)
- [ ] 15.4 Create `packages/cli/src/root/subagents/disable/` with `command.ts` and `handler.ts`
- [ ] 15.5 Define disable command: positional `name`, flags `--scope`, `--yes`, `--force`, `--preview`
- [ ] 15.6 Implement disable handler: set `enabled: false` in settings → remove all rendered agent-native files (using lockfile paths) → keep canonical source and lockfile entry
- [ ] 15.7 Write tests for enable: enable a disabled subagent re-renders files, conflict detection on enable, `--preview`
- [ ] 15.8 Write tests for disable: disable removes rendered files, preserves canonical source, `--preview`, round-trip (disable then enable)
- [ ] 15.9 Replace the enable/disable stubs in the parent command
- [ ] 15.10 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 16. CLI — `axm subagents rename`

> **Subagent:** Run this entire phase in a single subagent.

Implements the rename subcommand. Restricted to locally-authored subagents. Depends on Phases 6 and 8.

**Reference:** `cli-subagents-rename/spec.md` — all requirements; proposal §rename decision.

- [ ] 16.1 Create `packages/cli/src/root/subagents/rename/` with `command.ts` and `handler.ts`
- [ ] 16.2 Define rename command: positional `old-name` and `new-name`, flags `--scope`, `--yes`, `--force`, `--preview`
- [ ] 16.3 Implement rename handler: validate new name format → check subagent exists and is locally-authored (reject registry/pack-installed with error) → check new name collision → rename canonical source directory → update `subagent.json` name + `SUBAGENT.md` frontmatter name → remove old rendered files → render new ones → update settings key + lockfile key
- [ ] 16.4 Write tests: successful rename, registry-installed rejection, pack-installed rejection, new name collision, name validation failure, `--preview`
- [ ] 16.5 Replace the rename stub in the parent command
- [ ] 16.6 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 17. Pack Integration — Transitive Subagent Visibility

> **Subagent:** Run this entire phase in a single subagent.

Wires subagent support into pack install/uninstall flows for transitive visibility, materialization, and orphan cleanup. Depends on Phases 3 and 6.

**Reference:** `extension-packs/spec.md` — all requirements.

- [ ] 17.1 Update pack install flow to materialize and render pack-resolved subagents to all configured agents (similar to how pack-resolved skills are symlinked)
- [ ] 17.2 Update pack uninstall flow to remove rendered files for orphaned subagents (subagent not in other packs or direct settings)
- [ ] 17.3 Implement transitive subagent visibility: pack-provided subagents appear in `axm subagents list` output. Direct settings entries take precedence over pack-provided entries with the same name
- [ ] 17.4 Implement direct entry promotion on disable: disabling a transitive (pack-provided) subagent creates a direct settings entry with `enabled: false`
- [ ] 17.5 Write tests: pack install renders subagents, pack uninstall removes orphaned subagent files, transitive visibility in list, direct entry override, disable promotion
- [ ] 17.6 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 18. Init Integration

> **Subagent:** Run this entire phase in a single subagent.

Updates `axm init` to detect agent directories that support subagents and note existing subagent files. Depends on Phase 5 (CodingAgent has subagent dir info).

**Reference:** `cli-init/spec.md` — all requirements.

- [ ] 18.1 Update agent detection in `packages/cli/src/root/init.ts` (or equivalent init module) to check for subagent directories (`.claude/agents/`, `.github/agents/`, `.codex/agents/`, `.cursor/agents/`, etc.) in addition to existing skill and command directory checks
- [ ] 18.2 When existing subagent files are found without AXM managed markers, note their existence in the init summary (do NOT import or convert them). When AXM-managed subagent files are found, include them in the configuration summary
- [ ] 18.3 Write tests: init detects agent with subagent files, init notes unmanaged files, init recognizes managed files
- [ ] 18.4 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 19. Telemetry Events

> **Subagent:** Run this entire phase in a single subagent.

Adds telemetry event emission for subagent operations following existing extension event patterns. Can be worked after any CLI command phase is complete.

- [ ] 19.1 Define subagent telemetry events following existing patterns (e.g., `subagent.install`, `subagent.uninstall`, `subagent.publish`, `subagent.new`, `subagent.update`, `subagent.enable`, `subagent.disable`, `subagent.rename`)
- [ ] 19.2 Wire telemetry emission into each CLI command handler
- [ ] 19.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` — fix any failures

## 20. End-to-End Validation

> **Subagent:** Run this entire phase in a single subagent.

Full integration verification across all phases. Depends on all prior phases.

- [ ] 20.1 Write E2E tests in `packages/cli-e2e/` covering the core subagent lifecycle: `new` → verify scaffolded files and rendered output → `list` → `disable` → verify rendered files removed → `enable` → verify re-rendered → `rename` → verify old files removed and new files exist → `uninstall` → verify all files cleaned up
- [ ] 20.2 Write E2E test for install from a local source with multi-agent rendering — verify each agent gets the correct format (Markdown for Claude Code, TOML for Codex, JSON for Kiro CLI)
- [ ] 20.3 Write E2E test for `axm sync` reconciliation: modify SUBAGENT.md source → run sync → verify re-rendered files reflect changes
- [ ] 20.4 Run full CI pipeline: `pnpm run ci` — fix any failures
- [ ] 20.5 Kill any lingering vitest worker processes
