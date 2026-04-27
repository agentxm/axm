> Historical note: these tasks used the original `WorkspaceContext` name. The
> implemented API is now `WorkspaceReadModel`; the change slug is preserved for
> traceability.

> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

**Phase dependencies:**

- Phase 1 must complete first (scaffolding everything else imports).
- Phase 2 (errors) and Phase 3 (diagnostics) are independent of each other; both depend only on Phase 1.
- Phase 4 (state loaders) depends on Phase 2.
- Phase 5 (fixture builder + test layer) depends on Phase 1 and Phase 2; can run in parallel with Phase 3 and Phase 4.
- Phase 6 (scanners) depends on Phase 3 and Phase 5.
- Phase 7 (per-extension subject modules + projection helper) depends on Phase 4 and Phase 6.
- Phase 8 (per-agent modules) depends on Phase 6; can run in parallel with Phase 7.
- Phase 9 (`WorkspaceContext` service + Live layer + scope assembly) depends on Phase 7 and Phase 8.
- Phase 10 (golden-fixture scenario tests + AXM-454 closure) depends on Phase 9.
- Phase 11 (final verification) depends on Phase 10.

## 1. Module scaffolding and shared types

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Create the directory tree under `packages/core/src/unstable/workspace/context/` per the design _Impact_ section: `context.ts`, `state.ts`, `diagnostics.ts`, `errors.ts`, `extensions/` (one file per `ExtensionType`), `agents/` (one file per registered agent id plus `index.ts`), `scanners/` (`canonical-extensions.ts`, `agent-dir.ts`, `mcp-config.ts`, `agent-settings.ts`), `__fixtures__/`, and a colocated `__tests__/` directory. Initialize each file with a header comment and a `TODO` body so subsequent phases can fill them in without restructuring.
- [x] 1.2 Add a `types.ts` with shared, non-circular declarations only: `Scope = "project" | "user"`, `ExtensionKey<TType>`, `ActivationState`, `InstallationOrigin`, the empty-shape `ExtensionStateReader<TDeclared, TResolved, TActual>` interface, and the public surface contracts (`ScopedWorkspaceContext`, `ScopedStateApi`, `ScopedSourceHostsApi`, `ScopedProfileApi`, `ScopedAgentsApi`). Each subject module owns its payload types, so import them from this file only when they are subject-agnostic.
- [x] 1.3 Add a vitest spec under `__tests__/types.type-test.ts` that compile-time asserts the shared interfaces (e.g., via `satisfies` checks and `ExtensionStateReader<DeclaredSkills, ResolvedSkills, ActualSkills>` projections against placeholder `unknown`-typed payload aliases) so the scaffolding remains stable as later phases attach payloads. Keep the test pure type-level; no runtime assertions. This file follows the new `*.type-test.ts` convention: compile-time-only assertion files included by `tsconfig.spec.json`, excluded from the runtime suite via `packages/core/vitest.config.ts`, excluded from production builds via `tsconfig.lib.json`, and excluded from Nx's `production` named input via `nx.json`.
- [x] 1.4 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static` to verify the scaffolding type-checks; fix any errors including any `@effect/language-service` diagnostics.
- [x] 1.5 Run `pnpm typecheck` to verify all packages still type-check; fix any errors including any `@effect/language-service` diagnostics.
- [x] 1.6 Run `pnpm lint` and fix any errors.
- [x] 1.7 Run `pnpm test` and fix any failures.
- [x] 1.8 Run `pnpm test:e2e` and fix any failures.
- [x] 1.9 Kill any lingering vitest worker processes.

## 2. Per-source error families

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Add `__tests__/errors.test.ts` covering: (a) `Data.TaggedError` instantiation and tag narrowing for `SettingsIoError`, `SettingsParseError`, `SettingsDecodeError`, `LockfileIoError`, `LockfileParseError`, `LockfileDecodeError`, `WorkspaceRootEscape`; (b) that `SettingsReadError` and `LockfileReadError` are exact unions of their three constituent tags (compile-time `Exclude` checks); (c) that `WorkspaceRootEscape` is NOT a member of either source-read union (provider-construction-only). Run the test, watch it fail (red).
- [x] 2.2 Implement `errors.ts` with the seven `Data.TaggedError` classes and the two re-exported unions per the design _Errors_ sketch. Each class carries the per-tag payload spelled out in the design (path, issues, raw bytes, etc.). Re-run `__tests__/errors.test.ts` and confirm green; refactor for naming/readability.
- [x] 2.3 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 2.4 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 2.5 Run `pnpm lint` and fix any errors.
- [x] 2.6 Run `pnpm test` and fix any failures.
- [x] 2.7 Run `pnpm test:e2e` and fix any failures.
- [x] 2.8 Kill any lingering vitest worker processes.

## 3. Diagnostics buffer

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Add `__tests__/diagnostics.test.ts` covering: (a) creating a fresh diagnostics buffer per scope; (b) appending settings/lockfile/scanner warnings concurrently and asserting they are observed in emission-completion order via an `Effect` `Ref`-backed buffer; (c) snapshot semantics — `ctx.scope(scope).diagnostics` returns a frozen snapshot at read time; (d) no automatic deduplication (two identical warnings remain two entries); (e) the `Warning` type carries a `source: "settings" | "lockfile" | "scanner"` discriminator plus optional `path` and `code`. Run the test, watch it fail (red).
- [x] 3.2 Implement `diagnostics.ts` with the `Warning` type and a `Diagnostics` helper exposing `append`, `snapshot`, and a constructor that takes an `Effect` `Ref<ReadonlyArray<Warning>>`. Re-run `__tests__/diagnostics.test.ts` and confirm green; refactor for readability.
- [x] 3.3 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 3.4 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 3.5 Run `pnpm lint` and fix any errors.
- [x] 3.6 Run `pnpm test` and fix any failures.
- [x] 3.7 Run `pnpm test:e2e` and fix any failures.
- [x] 3.8 Kill any lingering vitest worker processes.

## 4. State source loaders (settings, lockfile)

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Add `__tests__/state.test.ts` covering, for each `(scope, source)` pair: (a) absent file → `Effect.succeed(Option.none())`; (b) IO failure → `Effect.fail(SettingsIoError | LockfileIoError)`; (c) parse failure → `*ParseError`; (d) schema decode failure → `*DecodeError`; (e) `ctx.scope("user").state.lockfile` is permanently `Option.none()`; (f) `Effect.cached` semantics — two `yield*`s of the same scoped source share one execution and one IO call (assert via a counter on the test `FileSystem`). Run the test, watch it fail (red).
- [x] 4.2 Implement `state.ts` exporting `makeScopedStateApi(scope, deps)` that constructs `Effect.cached` settings and lockfile loaders. The implementation MUST: (a) take `FileSystem`, `Path`, and validated workspace root paths as inputs and capture them; (b) return cells whose public types expose no `R` requirement; (c) use `Effect.fn("workspace.context.state.<source>")(...)` so traces land under stable names; (d) wire warnings through the diagnostics buffer for any `*Warning`-class issues that are not source-read failures (none in v1, but the wiring is in place). Re-run state tests and confirm green.
- [x] 4.3 Add `__tests__/state-source-independence.test.ts` covering (per the spec _Source loading is independent_ requirement): (a) corrupt lockfile → `state.settings` returns the unmutated decoded settings; (b) corrupt settings → `state.lockfile` returns the unmutated decoded lockfile; (c) bit-level identity check on the unmutated source against a baseline fixture. Confirm green.
- [x] 4.4 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 4.5 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 4.6 Run `pnpm lint` and fix any errors.
- [x] 4.7 Run `pnpm test` and fix any failures.
- [x] 4.8 Run `pnpm test:e2e` and fix any failures.
- [x] 4.9 Kill any lingering vitest worker processes.

## 5. Test fixture builder and test layer

> **Subagent:** Run this entire phase in a single subagent.

- [x] 5.1 Add `__tests__/fixtures.test.ts` covering the fixture-builder API: building a workspace tree from a declarative spec (settings JSON, lockfile YAML, scanner-visible directories), serializing it into the test `FileSystem`, and asserting the resulting tree matches the spec. Cover absent files, byte-corrupt files, schema-invalid files, and path-escape attempts. Run the test, watch it fail (red).
- [x] 5.2 Implement `__fixtures__/builder.ts` exporting a `buildFixture(spec)` helper plus named scenario constructors (`absentAll`, `validAll`, `lockfileInvalidOnly`, `settingsInvalidOnly`, `bothInvalid`, `projectOnly`, `userOnly`, `projectUserShadowing`, `agentPresentNoDeclaration`, `agentDeclaredNotInstalled`, `mcpConfigDrift`, `sameNameAcrossOrigins`, `pathEscapeAttempt`). Each constructor returns a layer that wires a test `FileSystem`/`Path`/`AgentRegistry` against the synthesized tree.
- [x] 5.3 Implement `__fixtures__/test-layer.ts` exporting a `WorkspaceContextTest` layer that consumes a fixture spec, constructs the test deps, and provides `WorkspaceContext` (via the still-pending Phase 9 implementation — for this phase, leave a placeholder `Layer.fail` stub so the test compiles and skips, and finalize wiring after Phase 9 completes).
- [x] 5.4 Re-run `__tests__/fixtures.test.ts` and confirm green; refactor for readability.
- [x] 5.5 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 5.6 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 5.7 Run `pnpm lint` and fix any errors.
- [x] 5.8 Run `pnpm test` and fix any failures.
- [x] 5.9 Run `pnpm test:e2e` and fix any failures.
- [x] 5.10 Kill any lingering vitest worker processes.

## 6. Scanner functions

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 6.2, 6.3, 6.4, 6.5 are independent — launch as parallel subagents.

- [x] 6.1 Add a shared `__tests__/scanners-shared.test.ts` covering: (a) `Effect.fn("workspace.context.scanner.<id>")(...)` naming for trace stability; (b) scanner public effects expose no `FileSystem | Path` requirement (assertion via type-level check); (c) per-scanner partial failures publish a diagnostic warning rather than failing the cell; (d) workspace-root escape is rejected at provider construction, not by individual scanners. Run, watch fail (red).
- [x] 6.2 Add `__tests__/canonical-extensions.test.ts` and implement `scanners/canonical-extensions.ts` covering canonical AXM (`./.axm/extensions/<owner>/<type>/src/<name>/`) and external AXM (`./.axm/extensions/external/<type>/<name>/`) materializations across all extension types. Each occurrence carries the subject-specific origin owned by the corresponding extension subject module. Confirm green.
- [x] 6.3 Add `__tests__/agent-dir.test.ts` and implement `scanners/agent-dir.ts` covering per-agent skill/command/subagent/rule directories (e.g., `./.claude/skills/`, `./.cursor/rules/`, `./.codex/skills/`). Use the existing `AgentRegistry` to enumerate which agents render which subject types. Each occurrence carries `agent-skill-dir | agent-command-dir | …` origins parameterized by `agentId`. Confirm green.
- [x] 6.4 Add `__tests__/mcp-config.test.ts` and implement `scanners/mcp-config.ts` covering the workspace `.mcp.json` plus agent-native MCP config files. Each occurrence carries `workspace-mcp-config | agent-mcp-config(agentId)` origins. Confirm green.
- [x] 6.5 Add `__tests__/agent-settings.test.ts` and implement `scanners/agent-settings.ts` covering agent-native settings files (`.claude/settings.json`, etc.). Each occurrence carries `agent-settings(agentId)` origins. Confirm green.
- [x] 6.6 Add `__tests__/scanner-occurrence-identity.test.ts` covering: (a) two scanner paths observing the same physical occurrence collapse to one entry with one stable identity (`(scope, type | agentId, origin, contentLocation)`); (b) two distinct physical paths under the same name produce two entries with different identities. Confirm green against the multi-origin scenarios in the spec.
- [x] 6.7 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 6.8 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 6.9 Run `pnpm lint` and fix any errors.
- [x] 6.10 Run `pnpm test` and fix any failures.
- [x] 6.11 Run `pnpm test:e2e` and fix any failures.
- [x] 6.12 Kill any lingering vitest worker processes.

## 7. Per-extension subject modules and projection helper

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9 are independent — launch as parallel subagents (one per `ExtensionType`).

- [x] 7.1 Add `__tests__/projection.test.ts` covering the shared algorithm in `extensions/projection.ts` per the _Projection invariant_: direct-from-declared, implicit-from-installed-pack-members, direct-wins-over-pack-membership, disabled-direct-still-claims-actual, ignored-suppressed-but-raw-visible, orphaned-resolved-becomes-diagnostic, packs-not-installed-as-pack-members, source-tolerance (corrupt lockfile → degraded warning + projection still computes), deterministic ordering, and that intermediate facts (`actualOnly`, `claimed`) are not in the public output. Run, watch fail (red).
- [x] 7.2 Implement `extensions/projection.ts` exporting a generic `projectInstalledExtensions(...)` helper. The helper owns: source-tolerance via `Effect.result` + `Effect.catchTags`, diagnostics publication, direct-over-pack precedence, disabled claiming, actual-occurrence attachment, ignored suppression, orphaned-resolved diagnostics, and deterministic sorting. The helper MUST NOT own subject row shape or subject policy; both come in as parameters. Re-run `projection.test.ts` and confirm green.
- [x] 7.3 Implement `extensions/skill.ts`: TDD-style add `__tests__/extensions/skill.test.ts` for declared/resolved/actual payload shapes, scanner composition (`canonical-extensions` + `agent-dir × skill-rendering agents`), `installed`/`active`/`unmanaged`/`ignored` projections via the helper, and `SkillDetectionOrigin` plus skill-specific facts (`contentRoot`, `sourcePath`, `packageRoot`, `hasSkillMd`, `hasSkillJson`). Implement and confirm green.
- [x] 7.4 Implement `extensions/command.ts`: TDD-style add `__tests__/extensions/command.test.ts` for command declared/resolved/actual payloads, scanner composition (`canonical-extensions` + `agent-dir × command-rendering agents`), projections, and command-specific origin/facts. Implement and confirm green.
- [x] 7.5 Implement `extensions/mcp-server.ts`: TDD-style add `__tests__/extensions/mcp-server.test.ts` for declared/resolved/actual, scanner composition (`canonical-extensions` + `mcp-config(workspace)` + `mcp-config(agentId)`), projections, and MCP-server-specific origin/facts. MCP servers use activation `enabled` by policy; assert the projection row supplies that activation without a no-op declared field. Implement and confirm green.
- [x] 7.6 Implement `extensions/subagent.ts`: TDD-style add `__tests__/extensions/subagent.test.ts` for subagent declared/resolved/actual, scanner composition (`canonical-extensions` + `agent-dir × subagent-rendering agents`), projections, and subagent-specific origin/facts. Implement and confirm green.
- [x] 7.7 Implement `extensions/file.ts`: TDD-style add `__tests__/extensions/file.test.ts` for file declared/resolved/actual, scanner composition, projections, and file-specific origin/facts. Implement and confirm green.
- [x] 7.8 Implement `extensions/rule.ts`: TDD-style add `__tests__/extensions/rule.test.ts` for rule declared/resolved/actual, scanner composition (canonical + `agent-dir × rule-rendering agents`), projections, and rule-specific origin/facts. Implement and confirm green.
- [x] 7.9 Implement `extensions/pack.ts`: TDD-style add `__tests__/extensions/pack.test.ts` for pack declared/resolved/actual, scanner composition, resolved member groups (`resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`, `resolvedSubagents`) read from the pack manifest, and the specialized `installed` projection that supports only direct installation origins (packs are not pack members). Confirm the pack namespace passes an empty installed-pack set into the projection helper for its own derivation. Implement and confirm green.
- [x] 7.10 Add `__tests__/extensions/indexByName.test.ts` for the pure `indexByName(rows)` / `findByName(rows, name)` helpers exported once from a shared utility. Implement and confirm green.
- [x] 7.11 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 7.12 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 7.13 Run `pnpm lint` and fix any errors.
- [x] 7.14 Run `pnpm test` and fix any failures.
- [x] 7.15 Run `pnpm test:e2e` and fix any failures.
- [x] 7.16 Kill any lingering vitest worker processes.

## 8. Per-agent modules and agent registry barrel

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 8.2 through 8.N are independent — launch as parallel subagents (one per registered agent id).

- [x] 8.1 Add `__tests__/agents/registry.test.ts` covering the `agents/index.ts` barrel: it lists every registered agent module, exposes the `AgentNativeConfig` open union as a re-export of each module's typed shape, and is the single point a new agent registers without touching `WorkspaceContext`. Run, watch fail (red).
- [x] 8.2 Implement `agents/claude-code.ts` exposing the typed `ClaudeCodeNativeConfig`, the agent's scanner composition (settings, MCP config, rendered-subject directories), and projectors that produce `declared(id)` / `actual(id)` / `detected` payloads when invoked through `ScopedAgentsApi`. Add `__tests__/agents/claude-code.test.ts` covering golden paths. Confirm green.
- [x] 8.3 Implement `agents/cursor.ts` and tests with the same shape as 8.2. Confirm green.
- [x] 8.4 Implement `agents/codex.ts` and tests with the same shape. Confirm green.
- [x] 8.5 Implement `agents/roo.ts` and tests with the same shape. Confirm green.
- [x] 8.6 Implement remaining registered agent modules per the existing `AgentRegistry` (one task per agent id; each mirrors 8.2's structure). Confirm green for each.
- [x] 8.7 Implement `agents/index.ts` re-exporting each per-agent module's `nativeConfig` variant into the `AgentNativeConfig` open union and registering each module with the scoped agents API. Confirm `__tests__/agents/registry.test.ts` green.
- [x] 8.8 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 8.9 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 8.10 Run `pnpm lint` and fix any errors.
- [x] 8.11 Run `pnpm test` and fix any failures.
- [x] 8.12 Run `pnpm test:e2e` and fix any failures.
- [x] 8.13 Kill any lingering vitest worker processes.

## 9. WorkspaceContext service and Live layer

> **Subagent:** Run this entire phase in a single subagent.

- [x] 9.1 Add `__tests__/context.test.ts` covering, against the fixture builder: (a) `WorkspaceContext` is a single `Context.Service` tagged `axm/WorkspaceContext`; (b) `ctx.scope(scope)` is a lazy selector — calling it does not perform IO until a scoped cell is yielded; (c) every scoped namespace property is dependency-closed at the call site (no `FileSystem | Path | AgentRegistry` leak in `R`); (d) two consumers `yield*`-ing `project.skills.installed` in parallel share one projection run via `Effect.cached`; (e) the cached effect count per `WorkspaceContext` instance stays within ≤50 on a representative full-workspace fixture; (f) provider construction fails the Layer with `WorkspaceRootEscape` when given a workspace root that escapes the allowed root, and never as a per-cell error. Run, watch fail (red).
- [x] 9.2 Implement `context.ts` exporting the `WorkspaceContext` `Context.Service` tag and the `WorkspaceContextLive` Layer. The Layer MUST: (a) resolve `FileSystem`, `Path`, and `AgentRegistry` once; (b) validate workspace roots once and fail with `WorkspaceRootEscape` on escape; (c) eagerly enumerate the closed scanner key set and construct `Effect.cached` wrappers that capture the resolved deps; (d) construct cached source loaders via `state.ts`; (e) build the `scope()` function returning a memoized scoped namespace object whose properties are cached effects; (f) wire scoped diagnostics; (g) wire `state`, `sourceHosts`, `profile`, `skills`, `commands`, `mcpServers`, `subagents`, `files`, `rules`, `packs`, and `agents` for both scopes. Re-run `context.test.ts` and confirm green; refactor for readability.
- [x] 9.3 Finalize `__fixtures__/test-layer.ts` (placeholder from Phase 5) so it provides the real `WorkspaceContextLive` against the fixture-built deps. Re-run all fixture-dependent tests and confirm green.
- [x] 9.4 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 9.5 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 9.6 Run `pnpm lint` and fix any errors.
- [x] 9.7 Run `pnpm test` and fix any failures.
- [x] 9.8 Run `pnpm test:e2e` and fix any failures.
- [x] 9.9 Kill any lingering vitest worker processes.

## 10. Golden-fixture scenario tests and AXM-454 closure

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8 are independent — launch as parallel subagents.

- [x] 10.1 Stand up a scenario-test harness under `__tests__/scenarios/` that consumes the fixture builder, constructs a `WorkspaceContextLive` through the test layer, and provides ergonomic helpers for `Effect.result` boundary assertions and diagnostics inspection. Each subsequent scenario file uses this harness.
- [x] 10.2 Implement `__tests__/scenarios/source-backed-cells.test.ts` covering the spec's _Source-backed cells distinguish absent state from invalid state_ requirement: missing/invalid settings, missing/invalid project lockfile, user lockfile permanently `Option.none()`. Confirm each cell exposes ≤3 tagged-error tags via `Effect.result`. Confirm green.
- [x] 10.3 Implement `__tests__/scenarios/source-independence.test.ts` covering the spec's _Source loading is independent_ requirement: corrupt one source, mutate raw bytes, assert the other two cells are bit-identical to the unmutated baseline. Confirm green.
- [x] 10.4 Implement `__tests__/scenarios/actual-occurrences.test.ts` covering the spec's _Actual extension state is occurrence-shaped_ and _Actual entries carry stable occurrence identity and subject-specific origin_ requirements: single agent-rendered skill is one entry; same skill in two agent dirs is two entries; same skill across two agent dirs and canonical AXM is three entries; same skill across two agent dirs and external AXM is three entries; duplicate scanner observations of one physical occurrence collapse to one entry with one identity; distinct physical paths under one name have different identities. Confirm green.
- [x] 10.5 Implement `__tests__/scenarios/actual-never-fails.test.ts` covering the spec's _Actual cells never fail in the error channel_ requirement: partial scanner failure → readable subset returned + scanner warning published; workspace-root escape fails provider construction. Confirm green.
- [x] 10.6 Implement `__tests__/scenarios/projections.test.ts` covering the spec's _Resilient projections degrade through diagnostics_ requirement, exercising every named scenario: installed-skills-are-managed-inventory, actual-only-skills-remain-visible-outside-installed, pack-provided-skill-is-implicit-installed-inventory, direct-skill-declaration-wins-over-pack-membership, actual-only-pack-does-not-install-member-skills, pack-provided-subagent-is-implicit, direct-subagent-wins-over-pack-membership (with disabled), disabled-direct-skill-still-claims-actual, ignored-skill-suppressed-but-raw-visible, subject-lockfile-entry-alone-does-not-create-implicit-inventory, packs-are-not-installed-as-pack-members. Confirm green.
- [x] 10.7 Implement `__tests__/scenarios/lint-axm454-closure.test.ts` covering the _Installed skills survive invalid lockfile_ and _Raw lockfile cell still exposes invalid lockfile_ scenarios end-to-end: corrupt lockfile + valid settings + actual materializations → `project.skills.installed` returns the derivable rows AND `project.diagnostics` includes a lockfile warning AND `project.state.lockfile` (via `Effect.result`) still surfaces `LockfileReadError`. This is the AXM-454 regression test for the new context. Confirm green.
- [x] 10.8 Implement `__tests__/scenarios/no-network.test.ts` covering the spec's _WorkspaceContext performs no source resolution or network I/O_ requirement: declared `github:owner/repo` source string passes through verbatim AND no registry/source-host/network call is attempted (assert via a mock fetch/registry client that records every call and asserts zero). Confirm green.
- [x] 10.9 Implement `__tests__/scenarios/cross-scope-shadowing.test.ts` covering project + user scope shadowing per the design _Settings shadowing_ note: same source name declared at both scopes; both scope reads exposed independently with no implicit merge on `skills.declared`. Confirm green.
- [x] 10.10 Run `pnpm exec nx run @agentxm/core:typecheck --outputStyle=static`; fix any errors including `@effect/language-service` diagnostics.
- [x] 10.11 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 10.12 Run `pnpm lint` and fix any errors.
- [x] 10.13 Run `pnpm test` and fix any failures.
- [x] 10.14 Run `pnpm test:e2e` and fix any failures.
- [x] 10.15 Kill any lingering vitest worker processes.

## 11. Final verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 11.1 Confirm the new module is NOT exported from any workspace barrel (`packages/core/src/unstable/workspace/index.ts` and any package-level barrel). The migration changes named in the proposal own the export wiring; this change must remain consumer-free.
- [x] 11.2 Confirm `packages/core/src/unstable/workspace/classifier.ts`, `packages/core/src/unstable/workspace/service.ts`, and every CLI handler are unchanged. Run `git diff --stat` against the change base and verify the only touched paths are the new `workspace/context/` tree, the OpenSpec change artifacts, and the test/build config additions required to support the `*.type-test.ts` convention (`nx.json`, `packages/core/tsconfig.lib.json`, `packages/core/tsconfig.spec.json`, `packages/core/vitest.config.ts`).
- [x] 11.3 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics.
- [x] 11.4 Run `pnpm lint` and fix any errors.
- [x] 11.5 Run `pnpm test` and fix any failures.
- [x] 11.6 Run `pnpm test:e2e` and fix any failures.
- [x] 11.7 Kill any lingering vitest worker processes.
- [x] 11.8 Run `pnpm format` to apply repo-wide formatting; commit any resulting changes.
- [x] 11.9 Verify the change passes `openspec verify-change workspace-context` (or the equivalent CLI surface the experimental workflow exposes) and the apply phase prerequisites are satisfied.
