> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Shared Rendered-Extension Infrastructure

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1, 1.2, 1.3, 1.5 are independent — launch as parallel subagents. Task 1.4 depends on 1.1 (managed-marker).

Build the shared modules in `core/unstable/extensions/` that both command-support and subagent-support reuse. These are the foundation for all rendered-extension types.

**Effect v4 patterns for this phase:**

- Use `Schema.Class` (not bare `Schema.Struct`) for `RenderedFilesMap`, `LossyRenderingWarning`, and `ConflictDetectionResult` — gives validated constructors, `_tag` pattern matching, and `decodeResult` for synchronous hot-path use in reconciliation
- Use `Schema.brand("SourceHash")` and `Schema.brand("RenderedFilePath")` for branded string types — prevents accidental interchange with raw strings at compile time
- Use `Schema.brand("ManagedMarker")` for the marker string type
- The content-file parser should return a `Schema.Class` result with `decodeResult` for synchronous parsing in reconciliation hot paths

- [ ] 1.1 Create `managed-marker.ts` with `generateMarker(extensionType, format)` returning `ManagedMarker` (branded string), `isManagedByAxm(content)`, and `stripMarker(content)` — supports markdown (`<!-- Managed by axm — see "axm <type> --help" -->`), TOML/text (`# Managed by axm — see "axm <type> --help"`). Write tests first covering all format families and edge cases (empty content, marker in middle of file, marker-like strings that aren't markers).
- [ ] 1.2 Create `rendered-files.ts` with `RenderedFilesMapSchema` as `Schema.Class` (lockfile mixin: record keyed by agent ID, value is array of `{ path: RenderedFilePath }` objects), `computeSourceHash(frontmatter, body, manifestFields)` returning `SourceHash` (branded) for determining re-render need. Write tests for hash stability (same inputs = same hash), hash sensitivity (any input change = different hash), schema encode/decode roundtrip, and `decodeResult` synchronous parsing.
- [ ] 1.3 Create `rendering-warnings.ts` with `LossyRenderingWarning` as `Schema.Class` (structured: `{ agent, feature, message }`, tagged via `_tag`) and a collector utility for accumulating warnings during a render pass. Write tests for accumulation and dedup behavior.
- [ ] 1.4 Create `conflict-detection.ts` with `detectConflict(filePath, fileContent?)` returning a `ConflictDetectionResult` tagged union (`Absent | Owned | Conflict`) that checks: no file → `Absent`, file with managed marker → `Owned` (re-renderable), file without marker → `Conflict` (blocks unless `--force`). Use `Effect.acquireRelease` for file reads to ensure handles are released. Depends on `managed-marker.ts`. Write tests for each case including file-not-found and permission errors.
- [ ] 1.5 Create `content-file.ts` with a YAML frontmatter + body parser shared by COMMAND.md and SUBAGENT.md — `parseContentFile(content)` returns `{ frontmatter: Record<string, unknown>, body: string }`. Provide both `parseContentFileEffect` (for boundary parsing with full error channel) and `parseContentFileResult` (synchronous `decodeResult` for reconciliation hot paths). Handle: no frontmatter (pure body), valid frontmatter, malformed YAML (error), empty body. Write tests for all parse scenarios.
- [ ] 1.6 Export all new modules from `core/unstable/extensions/index.ts`
- [ ] 1.7 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 1.8 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 1.9 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 1.10 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Command Schema Updates

> **Subagent:** Run this entire phase in a single subagent.

Update the command-specific schemas to support the full extension lifecycle. Depends on Phase 1 (content-file parser, rendered-files schema).

**Effect v4 patterns for this phase:**

- Use `Schema.Class` for `CommandArgument` and `CommandFrontmatter` — gives validated constructors and `decodeResult` for synchronous parsing
- Define a `FrontmatterToManifestFields` transformation using `Schema.encodeTo` for the publish-time sync from COMMAND.md frontmatter to manifest — type-safe bidirectional transformation replacing ad-hoc field copying
- Use `Schema.ArrayEnsure` where single-value inputs should normalize to arrays (e.g., `allowedTools` could be a single string or array)
- Constructor defaults via `Schema.withConstructorDefault` for boolean fields (`isolatedContext: false`, `autoInvocable: true`, `userInvocable: true`)

- [ ] 2.1 Create `CommandArgumentSchema` as `Schema.Class` in `core/unstable/commands/` with fields: `name: Schema.String`, `description: Schema.optional(Schema.String)`, `required: Schema.optional(Schema.Boolean).pipe(Schema.withConstructorDefault(() => false))`, `default: Schema.optional(Schema.String)`. Write tests for encode/decode, defaults, and `decodeResult` synchronous parsing.
- [ ] 2.2 Create `CommandFrontmatterSchema` as `Schema.Class` in `core/unstable/commands/` for COMMAND.md frontmatter fields: `description` (optional string), `model` (optional nullable string), `allowedTools` (optional nullable array of strings), `isolatedContext` (optional boolean, `withConstructorDefault(() => false)`), `arguments` (optional array of `CommandArgumentSchema`), `argumentHint` (optional string), `autoInvocable` (optional boolean, `withConstructorDefault(() => true)`), `userInvocable` (optional boolean, `withConstructorDefault(() => true)`). Define `FrontmatterToManifestFields` as a `Schema.encodeTo` transformation projecting `description` and `model` for registry sync. Write tests for all field combinations including nullable semantics (`model: null` clears model) and the bidirectional transformation roundtrip.
- [ ] 2.3 Update `CommandManifestSchema` in `manifest-schema.ts` to add `agents: Schema.optional(Schema.Array(Schema.String))` and `agentOverrides: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Record({ key: Schema.String, value: Schema.Unknown }) }))`. Write tests for valid manifest with and without these fields. Update `command.example.json` to include example fields.
- [ ] 2.4 Run typecheck, fix any errors
- [ ] 2.5 Update `CommandsMapSchema` in settings schema from `Record(String, String)` to a per-type entry schema supporting `string | { source, enabled? }` — follow the `SkillSettingsEntrySchema` pattern. Write tests for string shorthand, object entry with enabled, object entry defaulting enabled to true. Update any code reading `CommandsMapSchema` to handle the new shape.
- [ ] 2.6 Update `CommandLockEntrySchema` in lockfile schema: switch from `BaseCommonFields` to `CommonFields` (adds `agents` array). Add `sourceHash: Schema.String` and `renderedFiles: RenderedFilesMapSchema` (from Phase 1). Write tests for encode/decode roundtrip with new fields. Verify existing lockfile code handles the new fields.
- [ ] 2.7 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 2.8 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 2.9 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 2.10 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 2.11 Kill any vitest worker processes

## 3. Agent Adapter Extensions

> **Subagent:** Run this entire phase in a single subagent.

Extend the `CodingAgent` interface with command-specific methods and implement them for all 11 agents. Depends on Phase 1 (managed-marker, conflict-detection). Depends on Phase 2 (frontmatter schema, manifest schema).

**Effect v4 patterns for this phase:**

- Use `Layer.suspend()` for the agent adapter registry — defer adapter construction until workspace config is resolved, constructing only adapters for configured agents (avoids eagerly building all 11 adapters with filesystem checks when a workspace typically uses 2-4)
- Use `Effect.forEach` with `concurrency: "unbounded"` in `addCommand`/`removeCommand` batch operations across agents
- Use `Effect.all` with `concurrency: "unbounded"` for concurrent conflict detection — check all target paths before any writes (all-or-nothing)
- Use `Effect.acquireRelease` for Augment cross-tool dedup detection — acquire the Claude Code rendered file check, release clean if skipping

- [ ] 3.1 Add `resolveEffectiveCommandsDir`, `addCommand`, and `removeCommand` to the `CodingAgent` interface. Define `ResolveCommandsDirArgs` (scope), `AddCommandArgs` (frontmatter, body, manifest, overrides, force flag), `RemoveCommandArgs` (command name), `CommandSyncOutcome` (including lossy-rendering warnings). Write interface-level type tests to verify the shape compiles.
- [ ] 3.2 Define command directory paths for all 11 agents (project and user scope) as constants. Reference the design's agent table: Claude Code (`.claude/commands/`), Codex (`~/.codex/prompts/`), OpenCode (`.opencode/commands/`), Augment (`.augment/commands/`), Junie (`.junie/commands/`), Kilo Code (`.opencode/commands/` or `.kilo/commands/`), Roo Code (`.roo/commands/`), Cursor (`.cursor/commands/`), Copilot (`.github/prompts/`), Gemini CLI (`.gemini/commands/`), Kiro (`.kiro/prompts/`).
- [ ] 3.3 Implement `resolveEffectiveCommandsDir` for all agents with scope-aware logic. Test Codex forces user scope (logs info note), Kilo Code resolves between `.opencode/commands/` and `.kilo/commands/`, Copilot warns on user scope. Write tests per agent for both scopes.
- [ ] 3.4 Implement `addCommand` for all agents — delegates to the appropriate format-family renderer (Phase 4), writes the rendered file with managed-by marker, detects conflicts via shared infrastructure, returns `CommandSyncOutcome` with warnings. Stub the renderer calls for now (renderers built in Phase 4) — use a simple pass-through that returns the body unchanged so tests can verify the adapter wiring.
- [ ] 3.5 Implement `removeCommand` for all agents — deletes the rendered file from the agent's commands directory. Handle file-not-found gracefully. Write tests.
- [ ] 3.6 Implement Augment cross-tool dedup: when Claude Code is a configured agent and the command is already rendered to `.claude/commands/`, skip writing to `.augment/commands/`. Log skip at info level. Write tests for dedup active (Claude Code present), dedup inactive (Claude Code not configured), and re-sync after config change.
- [ ] 3.7 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 3.8 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 3.9 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 3.10 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 3.11 Kill any vitest worker processes

## 4. Command Renderers

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2, 4.3, 4.4, 4.5, 4.6 are independent — launch as parallel subagents after 4.1.

Build the 5 format-family renderer functions and the variable substitution engine. Depends on Phase 2 (frontmatter schema, argument schema) and Phase 1 (managed-marker).

**Effect v4 patterns for this phase:**

- Model variable substitution as a Schema encode transformation pipeline: define `PortableVariable` as a tagged union schema (`arguments | positional | named`), then per-agent `encodeTo(Schema.String)` transformations that produce agent-native syntax — gives type-safe, testable, bidirectional variable translation
- Each renderer function is a pure function returning `Effect` — renderers compose via `Effect.forEach` across agents
- Renderer config objects per agent family use `Schema.Struct` with optional fields and `withConstructorDefault` for agent-specific defaults

- [ ] 4.1 Create the variable substitution engine in `core/unstable/commands/variable-substitution.ts`. Define `PortableVariable` as a `Schema.Union` of tagged structs (`{ type: "arguments" }`, `{ type: "positional", index: Number }`, `{ type: "named", name: String }`). Implement per-agent-family encoding as `Schema.encodeTo(Schema.String)` transformations following the design translation table. Implement `substituteVariables(body, agentConfig)` that parses `{{arguments}}`, `{{arguments[N]}}`, `{{arg:name}}` into `PortableVariable` instances, encodes to agent-native syntax, and interpolates back into the body. Handle escape sequence `\{{` → literal `{{`. Write tests for each portable variable type against each agent family, escaped variables, no-variable passthrough, and Schema roundtrip encoding.
- [ ] 4.2 Create `renderMarkdownWithFrontmatter` renderer for Claude Code, Codex, OpenCode, Augment, Junie, Kilo Code, Roo Code. Accepts frontmatter, body, agent overrides, agent config. Produces `.md` with managed-by marker, YAML frontmatter (description, argument-hint, allowed-tools, model, context/subtask), and substituted body. Write tests for full render with all frontmatter fields, minimal render (no frontmatter), agent overrides applied, and lossy-rendering warnings for unsupported fields per agent.
- [ ] 4.3 Create `renderMarkdownOnly` renderer for Cursor. Produces `.md` with managed-by marker and substituted body only — no YAML frontmatter. Returns lossy-rendering warnings for `model`, `allowedTools`, `isolatedContext`. Write tests.
- [ ] 4.4 Create `renderPromptMd` renderer for Copilot. Produces `.prompt.md` with managed-by marker, YAML frontmatter (description, name, argument-hint, model, tools), and substituted body. Map `{{arguments[N]}}` → `${input:argN}`, `{{arg:name}}` → `${input:name}`. Write tests.
- [ ] 4.5 Create `renderToml` renderer for Gemini CLI. Produces `.toml` with managed-by marker comment, `prompt` field (substituted body), and `description` field. Map `{{arguments}}` → `{{args}}`. Warn for `model`, `allowedTools`, `isolatedContext`, `arguments` (limited support). Write tests.
- [ ] 4.6 Create `renderPlainText` renderer for Kiro. Produces plain text file with managed-by marker comment and body. All portable variables render as literal text with lossy-rendering warnings. Write tests.
- [ ] 4.7 Wire renderers into agent adapters from Phase 3 — replace the stub renderer calls in `addCommand` with actual renderer dispatch based on agent's format family.
- [ ] 4.8 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 4.9 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 4.10 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 4.11 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 4.12 Kill any vitest worker processes

## 5. Manager & Install/Uninstall Flow

> **Subagent:** Run this entire phase in a single subagent.

Expand the command manager beyond registry-only and update install/uninstall flows to include agent rendering. Depends on Phases 2 (schemas), 3 (agent adapters), 4 (renderers).

**Effect v4 patterns for this phase:**

- Use `Effect.forEach(agents, addCommand, { concurrency: "unbounded" })` for parallel agent rendering during install — each agent's render is independent
- Use `Effect.acquireRelease` for the multi-agent render lifecycle: acquire = write rendered file, release = delete on scope failure — ensures failed installs don't leave orphaned files in some agents
- Use `Effect.all` with `concurrency: "unbounded"` for batch conflict detection before any writes
- Use `Stream.mergeAll` for multi-source discovery when resolving from registry + git + local simultaneously — emit results progressively
- Use `decodeResult` (synchronous) for source hash comparison in the skip-render optimization path

- [ ] 5.1 Expand `CommandManager.materializeInstall()` to support all 4 ref types (registry, git-hosted, local, builtin) following the skill manager pattern. Write tests for each source type materialization.
- [ ] 5.2 Update the install flow: after materialization, read `COMMAND.md` (parse frontmatter + body via content-file parser), read `command.json` for `agents` filter and `agentOverrides`. Run conflict detection across all target agents concurrently via `Effect.all(agents.map(detectConflict), { concurrency: "unbounded" })`. Then for each configured agent (filtered by manifest `agents` if set) render concurrently via `Effect.forEach(agents, addCommand, { concurrency: "unbounded" })`. Use `Effect.acquireRelease` to ensure rollback of rendered files on partial failure. Collect all `CommandSyncOutcome` results including lossy-rendering warnings. Write tests for the full flow including agent filtering, concurrent rendering, and rollback on failure.
- [ ] 5.3 Update the install flow to write lockfile entries with `agents` array, `sourceHash` (computed from portable inputs), and `renderedFiles` map (paths per agent from sync outcomes). Write tests verifying lockfile entries contain all new fields.
- [ ] 5.4 Update the uninstall flow: read `renderedFiles` from lockfile, call `agent.removeCommand()` for each tracked file, remove settings entry, remove lockfile entry, remove materialized files. Handle missing rendered files gracefully. Write tests for full uninstall including partial cleanup.
- [ ] 5.5 Implement enable flow: set `enabled: true` in settings, re-read materialized command, re-render to all configured agents, update lockfile `agents` and `renderedFiles`. Write tests.
- [ ] 5.6 Implement disable flow: set `enabled: false` in settings, remove rendered files from all agents listed in lockfile, clear lockfile `agents` array but preserve materialized files. Write tests including verification that `.axm/extensions/` content is preserved.
- [ ] 5.7 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 5.8 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 5.9 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 5.10 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 5.11 Kill any vitest worker processes

## 6. CLI Commands — List, Enable, Disable, Update

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 6.1, 6.2, 6.3, 6.4 are independent — launch as parallel subagents.

Add the remaining lifecycle CLI commands. Depends on Phase 5 (manager flows). Follow the existing skills command patterns for structure.

- [ ] 6.1 Implement `axm commands list` — read workspace service `getClassifiedCommands()`, display table with name, source, enabled status, and agents. Support `--scope` flag and `--json` output. Follow the `skills list` pattern. Write tests for table output, empty state, JSON output, scope filter.
- [ ] 6.2 Implement `axm commands enable <name>` — set enabled in settings, re-render to agents. Support `--scope` flag. Handle already-enabled (no-op), not-installed (error). Follow the `skills enable` pattern. Write tests.
- [ ] 6.3 Implement `axm commands disable <name>` — set disabled in settings, remove rendered files. Support `--scope` flag. Handle already-disabled (no-op), not-installed (error). Preserve materialized files. Follow the `skills disable` pattern. Write tests.
- [ ] 6.4 Implement `axm commands update [name]` — re-resolve source, update materialized files, re-render to agents, update lockfile source hash. Support `--scope` flag. Follow the `skills update` pattern. Write tests for single command update and batch update.
- [ ] 6.5 Update the `commands` parent command to register `list`, `enable`, `disable`, `update` as subcommands alongside existing `install` and `uninstall`.
- [ ] 6.6 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 6.7 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 6.8 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 6.9 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. CLI Commands — New & Publish

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 7.1 and 7.2 are independent — launch as parallel subagents.

Add authoring/registry CLI commands. Depends on Phase 2 (schemas). Can run in parallel with Phase 6.

- [ ] 7.1 Implement `axm commands new [name]` — scaffold `command.json` + `COMMAND.md` in current directory. Interactive prompts for name and description (skip name prompt if provided as argument). Non-interactive mode requires name argument, uses empty description. Validate directory doesn't already exist. Generate minimal manifest (`name`, `version: "0.1.0"`, `description`, `type: "command"`). Generate `COMMAND.md` with placeholder frontmatter and body. Follow the `skills new` pattern. Write tests for interactive, non-interactive, existing directory error.
- [ ] 7.2 Update `axm commands publish` — before packing, sync COMMAND.md frontmatter fields (description, model, etc.) to the manifest for registry use. Validate both `command.json` and `COMMAND.md` exist. Validate manifest schema. Support optional directory argument (default: cwd). Require authentication. Follow the `skills publish` pattern. Write tests for successful publish, missing manifest, missing COMMAND.md, invalid manifest, unauthenticated.
- [ ] 7.3 Register `new` and `publish` as subcommands on the `commands` parent command.
- [ ] 7.4 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 7.5 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 7.6 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 7.7 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 7.8 Kill any vitest worker processes

## 8. Init Flow & Pack Integration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 8.1 and 8.2 are independent — launch as parallel subagents.

Update init and packs to support commands. Depends on Phases 3 (agent dirs) and 5 (install flow).

- [ ] 8.1 Update `axm init` agent detection to check command directories in addition to skill directories. Per the delta spec: detect agents by checking first path segment of each agent's commands directory in cwd, combined with existing skills directory and user-level detection. Run detection concurrently. Write tests for agent detected via commands dir only (e.g., `.gemini/` exists but no skills dir), combined detection, and concurrent execution.
- [ ] 8.2 Update pack resolution to support transitive command visibility: pack-provided commands appear as installed commands, direct settings entries take precedence, disabling a transitive command promotes it to a direct entry. Pack install triggers command rendering to configured agents. Pack uninstall removes orphaned command rendered files. Write tests for transitive visibility, precedence, promotion on disable, pack install rendering, and orphan cleanup on pack uninstall.
- [ ] 8.3 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 8.4 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 8.5 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 8.6 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 8.7 Kill any vitest worker processes

## 9. Preview Flag & Install/Uninstall Updates

> **Subagent:** Run this entire phase in a single subagent.

Add `--preview` support to state-changing command operations and update existing install/uninstall CLI commands. Depends on Phases 5 (flows) and 6 (CLI commands).

- [ ] 9.1 Add `--preview` flag support to `axm commands install` — display which agents would receive rendered files and any lossy-rendering warnings without writing files or modifying settings/lockfile. Write tests.
- [ ] 9.2 Add `--preview` flag support to `axm commands uninstall` — display which rendered files would be removed without deleting files or modifying settings/lockfile. Write tests.
- [ ] 9.3 Add `--preview` flag support to `axm commands update`, `enable`, `disable` — display planned changes without applying them. Write tests.
- [ ] 9.4 Update `axm commands install` to display lossy-rendering warnings grouped by agent after successful install (non-preview mode). Write tests for warning display.
- [ ] 9.5 Update `axm commands uninstall` confirmation prompt to show affected agents from lockfile. Write tests.
- [ ] 9.6 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 9.7 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 9.8 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 9.9 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 9.10 Kill any vitest worker processes

## 10. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Full CI pipeline to verify everything works together. Depends on all prior phases.

- [ ] 10.1 Run the full CI pipeline (`pnpm run ci`), fix any failures
- [ ] 10.2 Verify all new modules are exported from their respective `index.ts` barrel files
- [ ] 10.3 Verify the `commands` parent command help lists all subcommands: install, uninstall, list, enable, disable, update, new, publish
- [ ] 10.4 Kill any vitest worker processes
