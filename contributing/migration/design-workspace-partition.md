# Workspace module partition — definitive design (design-3f)

Snapshot: worktree `/home/exedev/Code/agentxm/wt/axm-pkg-arch` at `d5c28049c` with
uncommitted churn in flight (e.g. `utils/create-symlink.ts` → `workspace/create-symlink.ts`
moved mid-analysis; `agents/instructions.ts` modified). All paths below are relative to
`packages/extension-management/src/unstable/` unless noted. Every import claim was
verified by grep against production (non-test) sources.

Bins: **WS** = workspace-state (kernel), **WO** = workspace-operations (kernel),
**XW** = extension-workspace (kernel), **CFG** = workspace-configuration (feature),
**INSP** = workspace-inspection (feature), **SYNC** = workspace-sync (feature),
**LINT** = workspace-lint (feature), **CLI** = axm.sh app, **DEL** = delete.

Target rules being enforced (package-architecture.md §Shared kernels, §Dependency rules):
WO→WS only; XW→WS+contracts only; no kernel imports an integration
(`registry`→registry-client, `sources`/`source-resolution`→extension-sources,
`agents`→agent-integration) or a feature; agent-integration imports contracts only;
features import kernels+integrations+contracts; nothing below the app imports
`app-error`, `cli-*`, or `cli/`.

**Standing prerequisite (out of scope here, assumed from the parallel app-error/CLI
workstream):** WS/WO/XW signatures are saturated with `AppError` from `../app-error`.
Every classification below that says "clean" still requires the error-vocabulary
decoupling for the kernel bins; I mark edges whose _only_ problem is `app-error`/`cli-*`
as class (c).

---

## 1. Definitive file-by-file partition of `workspace/**`

### 1.1 Corrections to the prior proposal (read these first)

1. **`configured-agent-outcomes.ts` → WS, not CFG.** `read-model-record-readers.ts`
   (WS, imports `./configured-agent-outcomes.js`) depends on it, and it is a pure
   derivation over the extension-model catalogs + `WorkspaceScope` + the
   `ConfiguredAgentOutcome` type. A feature placement would create WS→feature.
2. **`setup-scope-support.ts` → WS, not CFG.** Imported by `configured-agent-outcomes.ts`
   and `initialization.ts`; pure catalog derivation (extension-model capability +
   extension-type tables). Its one agents-module import (`agents/scope-refusal.ts`,
   39 lines, catalog-derived refusal text, no deps beyond contracts) moves with it into WS.
3. **`desired-state-problem-text.ts` → WS, not CLI.** `projection/contributors.ts`
   (XW-bound) embeds `desiredStateProblemsText(...)` in an error detail. It depends only
   on `desired-state-graph.ts` and produces plain strings — legal and natural in WS as
   diagnostic-text derivation. (If we insist prose lives app-side, projection would need
   a text port for one error message — not worth it.)
4. **`configured-entry-resolution/` is not one unit.** `types.ts` and `workspace-ref.ts`
   are WS after the vocabulary moves; `resolve.ts` (982 lines) imports
   `source-resolution` (integration) + `WorkspaceMutations` + release-age evaluation and
   **cannot be kernel code** — it is feature-layer resolution policy (see knot K1).
   `timeout.ts` moves with `resolve.ts`. `index.ts` barrel dissolves.
5. **`rendered-file-cleanup.ts` is not WO.** It imports `CodingAgentRepository`,
   `pruneManagedMcpServersForAgent` (agents/mcp-sync), `hooks/managed-groups`, and
   `extensions/managed-file-banner` — extension-type + agent-surface semantics. WO may
   depend only on WS. It splits between XW and SYNC (knot K2).
6. **The per-type read-model record builders stay in WS** (the QUESTION in the brief):
   `read-model/extensions/{hook,knowledge,mcp-server,pack,projection,rule,skill,subagent}.ts`
   import **only** `../../../lockfile/schema.js`, `../../../settings/schema.js`, scanner
   types, and read-model-internal modules — zero extension-type-module imports. They are
   projections over WS-owned schemas; no driver seam is needed. The single violation is
   `read-model/extensions/inventory.ts` importing
   `ConfiguredAgentOutcome{,Schema}` from `../../../plan/plan.js` — fixed by moving that
   type into WS (§3.3), not by moving the builders out.
7. **`transaction.ts` splits** (§4): ambient write-protection + restoration-fact →
   WS; transaction runner + closure mechanics → WO. The prior proposal put the whole
   file in WO, which breaks `settings/settings.ts`, `lockfile/lockfile.ts`,
   `workspace/create-symlink.ts`, `utils/fs-helpers.ts`, and `agents/instructions.ts`,
   all of which call `protectWorkspacePath`/`recordFootprint` at write sites
   (WS-or-lower call sites cannot import WO).
8. **`footprint-recorder.ts` → WS, not WO.** Self-contained ambient service
   (effect-only imports); recorded _by_ WS-level writers (`settings.ts`,
   `lockfile.ts`, `create-symlink.ts`, `utils/fs-helpers.ts`) and read by WO
   (`plan/resolve-plan.ts` via `readFootprint`). WO→WS is the legal direction.
9. **`materialized-file-target.ts` → WS** (16 lines, `utils/path-types` only; imported
   by hooks/rules managers). Harmless either way; WS keeps it next to the path
   vocabulary.
10. **`service.internal.test.ts` imports `cli-flags`/`cli-renderer`** — test-only; the
    test must drop or stub those when service.ts lands in WS.

### 1.2 Partition table — production files

| File                                                                                                                                     | Bin                                                        | Evidence / condition                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted-canonical-ref.ts`                                                                                                              | WS                                                         | Deps: extensions refs/extension-paths + `sources` per-type `*LockEntryToRef` — all WS after vocabulary moves V2/V3 (§3.1)                                                        |
| `augment-plan.ts`                                                                                                                        | WO                                                         | Gates a Plan on lockfile health. `LockfileState` type moves to WS (used by `service-interface.getLockfileState`); the function stays WO                                          |
| `canonical-observation.ts`                                                                                                               | WS                                                         | Needs `computeMaterializedTreeIntegrity` (extensions/materialized-tree — pure hashing, moves WS, V2), `extension-paths` (V2), lockfile types, `sources` print/param mapping (V3) |
| `configured-agent-outcomes.ts`                                                                                                           | WS                                                         | Correction 1; requires `ConfiguredAgentOutcome` type in WS (§3.3)                                                                                                                |
| `configured-entry-resolution/index.ts`                                                                                                   | DEL                                                        | Barrel; exports split across WS and lifecycle feature                                                                                                                            |
| `configured-entry-resolution/types.ts`                                                                                                   | WS                                                         | Per-type ref types (V2) + release-age record types (V1) + `NamedRegistryResolution` (sources/provider, V3)                                                                       |
| `configured-entry-resolution/workspace-ref.ts`                                                                                           | WS                                                         | Resolves refs to authored workspace extensions; deps (per-type refs, `extensions/package-hash`, `extensions/utils`, layout, scope, sources/types) all WS after V2/V3             |
| `configured-entry-resolution/resolve.ts`                                                                                                 | Feature (extension-lifecycle)                              | Knot K1. Imports `source-resolution` (integration), registry release-age evaluation, `WorkspaceMutations`                                                                        |
| `configured-entry-resolution/timeout.ts`                                                                                                 | Feature (with resolve.ts)                                  | Generic timeout + app-error                                                                                                                                                      |
| `constants.ts`                                                                                                                           | WS                                                         | No deps                                                                                                                                                                          |
| `create-symlink.ts` (new)                                                                                                                | WS                                                         | Protected symlink writer; calls `protectWorkspacePath`/`recordFootprint` (WS after §4 split)                                                                                     |
| `desired-pack-lock.ts`                                                                                                                   | WS                                                         | `packs/paths` + `computePackManifestContentIdentity` move WS (V2); `PackManifestSchema` already contract                                                                         |
| `desired-state-enabled.ts`                                                                                                               | WS                                                         | Intra-workspace only                                                                                                                                                             |
| `desired-state-graph.ts`                                                                                                                 | WS                                                         | `packs/refs` (V2), `packs/paths` (V2), `settings` (WS), `sources/workspace.js` `isWorkspaceSourceLocator` (12-line pure, V3), `extensions/constants` (V2)                        |
| `desired-state-problem-text.ts`                                                                                                          | WS                                                         | Correction 3                                                                                                                                                                     |
| `display-plan.ts`                                                                                                                        | CLI                                                        | Imports `cli-flags`, `cli-renderer`; sole consumer is `plan/resolve-plan.ts` (also CLI)                                                                                          |
| `extension-list.ts`                                                                                                                      | INSP                                                       | Feature: `registry` client, `source-resolution`, `sources`, lockfile — all legal feature→integration/kernel edges (class a)                                                      |
| `footprint-recorder.ts`                                                                                                                  | WS                                                         | Correction 8                                                                                                                                                                     |
| `index.ts`                                                                                                                               | DEL                                                        | Public barrel; replaced by package `exports`                                                                                                                                     |
| `initialization-interaction.ts`                                                                                                          | CFG (interface + Test layer) / CLI (Live layer)            | Already a service; `WorkspaceInitializationInteractionLive` uses `cli/prompt` + `cli-prompt` → moves to CLI; interface + `...Test` stay CFG                                      |
| `initialization.ts`                                                                                                                      | CFG                                                        | Feature→kernel/integration edges legal; its direct `CliRenderer` + `isNonInteractive` uses (lines ~397–783) must move behind the interaction service (class c)                   |
| `layout.ts`                                                                                                                              | WS                                                         | `AGENTS` → contract (V4); `extensions/constants` (V2); settings schema (WS)                                                                                                      |
| `locked-entries.ts`                                                                                                                      | WS                                                         | lockfile types + service-interface                                                                                                                                               |
| `materialized-file-target.ts`                                                                                                            | WS                                                         | Correction 9                                                                                                                                                                     |
| `observed-installed.ts`                                                                                                                  | WS                                                         | `InstallableExtensionType` (V2)                                                                                                                                                  |
| `paths.ts`                                                                                                                               | WS                                                         | `extensions/constants` (V2)                                                                                                                                                      |
| `read-model-record-readers.ts`                                                                                                           | WS                                                         | `installableExtensionTypes` (V2); `isAxmManagedMcpEntry` + `isMcpServerApplicableToAgent` move to WS settings semantics (§3.4)                                                   |
| `read-model-record-rows.ts`                                                                                                              | WS                                                         | record-types only                                                                                                                                                                |
| `read-model-record-types.ts`                                                                                                             | WS                                                         | No external deps                                                                                                                                                                 |
| `rendered-file-cleanup.ts`                                                                                                               | SYNC (orchestration) + XW (managed-file discovery, see K2) | Correction 5                                                                                                                                                                     |
| `resolve-plan-interaction.ts`                                                                                                            | CLI                                                        | Prompt-backed confirmation service; imports `cli/prompt`, `cli-runtime`, `cli-prompt`                                                                                            |
| `scan-plan-readiness.ts`                                                                                                                 | WO                                                         | Pure over `Plan`                                                                                                                                                                 |
| `scope.ts`                                                                                                                               | WS                                                         | No deps                                                                                                                                                                          |
| `service-interface.ts`                                                                                                                   | WS                                                         | Minus `ExtensionManager`/`WorkspaceReadModelRecords`→ see §5; transaction/transition types stay (they become WS-owned contract types, §4)                                        |
| `service.ts`                                                                                                                             | WS                                                         | With capability injection (§5); `loadWorkspace`/`layer` wiring moves to composition (WO live or app)                                                                             |
| `setup-scope-support.ts`                                                                                                                 | WS                                                         | Correction 2 (brings `agents/scope-refusal.ts` into WS)                                                                                                                          |
| `source-metadata.ts`                                                                                                                     | WS                                                         | record-types only                                                                                                                                                                |
| `test-stubs.ts`                                                                                                                          | WS `./testing`                                             | Consumed by agents/plan/version-currency tests                                                                                                                                   |
| `transaction.ts`                                                                                                                         | SPLIT WS/WO                                                | §4                                                                                                                                                                               |
| `transition-lock.ts`                                                                                                                     | WO (impl) / WS (holder + contention types)                 | §4                                                                                                                                                                               |
| `read-model/agent-root-resolver.ts`                                                                                                      | WS                                                         | `AGENTS` via V4                                                                                                                                                                  |
| `read-model/agents/{index,shared,types}.ts`                                                                                              | WS                                                         | Scoped agents API; `AGENTS` via V4                                                                                                                                               |
| `read-model/diagnostics.ts`                                                                                                              | WS                                                         | —                                                                                                                                                                                |
| `read-model/discovery/{index,plugin-manifests,skills,subagents}.ts`                                                                      | WS                                                         | `AGENTS` via V4; `extensions/discovery-walk` (16-line pure, V2). Inbound consumer `source-resolution/resolve-source-pattern.ts` is knot K5                                       |
| `read-model/errors.ts`                                                                                                                   | WS                                                         | —                                                                                                                                                                                |
| `read-model/extensions/{actual-helpers,hook,indexByName,index,knowledge,mcp-server,package-root,pack,projection,rule,skill,subagent}.ts` | WS                                                         | Correction 6 — no extension-type imports exist                                                                                                                                   |
| `read-model/extensions/inventory.ts`                                                                                                     | WS                                                         | After `ConfiguredAgentOutcome` moves to WS (§3.3)                                                                                                                                |
| `read-model/scanners/{agent-dir,agent-root,agent-settings,canonical-extensions,fs-helpers,index,mcp-config,types}.ts`                    | WS                                                         | `AGENTS`/`agents/constants` via V4; already take `agentRegistry` as a constructor arg                                                                                            |
| `read-model/service.ts`                                                                                                                  | WS                                                         | `AGENTS` via V4; `detectAgentsForScope` inverted behind an `AgentPresence` port (§3.5)                                                                                           |
| `read-model/state.ts`                                                                                                                    | WS                                                         | lockfile/settings schemas + `schema/format-issues` (small shared util — needs a contract-layer or WS home; flag)                                                                 |
| `read-model/types.ts`                                                                                                                    | WS                                                         | —                                                                                                                                                                                |
| `read-model/__fixtures__/{builder,decoders,occurrences,test-layer}.ts`                                                                   | WS `./testing`                                             | Also consumed by `lint/catalog/workspace-fixtures/fixture-state.ts` — legal as test-code import of `./testing`                                                                   |
| `version-currency/{check-currency,collectors,index}.ts`                                                                                  | INSP                                                       | Feature: `registry/client`, `registry/utils`, `source-resolution` legal (class a); also imports `desired-state-graph` + `service-interface` (kernel, legal)                      |
| `version-currency/test-stubs.ts`                                                                                                         | INSP `./testing`                                           | —                                                                                                                                                                                |

### 1.3 Partition table — tests (each follows its subject)

| Test file(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Bin                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `accepted-canonical-ref.internal.test.ts` (imports `lockfile/schema`, `skills/refs` — both WS after V2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | WS                      |
| `augment-plan.internal.test.ts`, `scan-plan-readiness.internal.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | WO                      |
| `canonical-observation.internal.test.ts`, `desired-pack-lock.internal.test.ts`, `desired-state-graph.internal.test.ts`, `layout.internal.test.ts`, `paths.internal.test.ts`, `desired-state-problem-text.internal.test.ts`, `configured-agent-outcomes.internal.test.ts`, `setup-scope-support.internal.test.ts`, `service.internal.test.ts` (strip `cli-flags`/`cli-renderer`), `transaction.internal.test.ts` (protection half; runner half → WO), `create-symlink.internal.test.ts`, `records.type-test.ts`, `configured-entry-resolution/workspace-ref.internal.test.ts` | WS                      |
| `transition-lock.internal.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | WO                      |
| `display-plan.internal.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | CLI                     |
| `extension-list.internal.test.ts`, `version-currency/{check-currency,collectors}.internal.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | INSP                    |
| `initialization-interaction.internal.test.ts` (imports `agents/registry` — contract after V4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | CFG                     |
| `rendered-file-cleanup.internal.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | SYNC (with its subject) |
| `read-model/**/*.test.ts`, `read-model/**/*.type-test.ts` (all 40+, including `__tests__/scenarios/**`, `__tests__/agents/**`)                                                                                                                                                                                                                                                                                                                                                                                                                                               | WS                      |

Nothing in `workspace/**` lands in LINT. The lint module consumes WS read-model
(`lint/workspace-context.ts`, `lint/catalog/workspace-read-model/lint-workspace.ts`,
`lint/catalog/workspace/*`) as feature→kernel — legal as-is; the only lint-side change is
import paths (plus `lint-workspace.ts` importing `canonicalDisplayRoot` from a lint-local
module, unaffected).

---

## 2. Vocabulary moves that dissolve most edges

Most "workspace ↔ extension-type" edges are not behavioral coupling — they are imports of
**pure vocabulary that currently lives in the wrong module**. Five moves (V1–V5) dissolve
the bulk; the leftover behavioral edges are the knots in §7.

- **V1 — release-age policy → `@agentxm/registry-protocol`.**
  `registry/release-age-policy.ts` imports only extension-model, registry-protocol's
  `VersionEntry`, and effect — zero transport. Consumers span kernels
  (`service-interface.ts`, `service.ts`, `configured-entry-resolution/types.ts`), WO
  (`plan/plan.ts`, `operation-journal.ts`, `operation-resolution.ts` — all type-only
  `ReleaseAgeOperationEvidence`), integrations (`registry/`, `sources/provider.ts`), and
  features. The **only** home legal for all of those simultaneously is a contract.
  This one move erases plan→registry (3 files), service-interface→registry,
  service→registry (constant + type), and configured-entry-resolution→registry types.
  ~31 files touch these symbols.
- **V2 — extension ref/identity vocabulary → WS.** Move
  `extensions/{ref-base,refs,installable-types,constants,extension-paths,rendered-files,package-hash,materialized-tree,discovery-walk,utils(sanitizeName et al.)}.ts`
  plus the per-type ref files `{skills,mcps,subagents,rules,hooks,knowledge,packs}/refs.ts`,
  `skills/paths.ts`, `packs/paths.ts`, and `packs`' `computePackManifestContentIdentity`
  into workspace-state. Evidence: all are type-only or pure helpers whose deps are
  contracts + `sources/types` + `workspace/{layout,scope}` + `utils/path-types`
  (`extensions/refs.ts` is explicitly documented as a leaf union assembler;
  `ref-base.ts` imports `sources/types` + `workspace/scope`). This is the desired-state
  vocabulary WS's own files (`accepted-canonical-ref`, `canonical-observation`,
  `desired-state-graph`, `service-interface`) already require. ~21 files import the refs
  layer; ~100+ files import something in the V2 set (mechanical path updates).
  Alternative considered: push refs into extension-model — rejected because refs embed
  `WorkspaceScope` and source-locator unions, which are workspace commitments, not
  platform-neutral identity.
- **V3 — sources syntax split.** `sources/` divides three ways:
  - `types.ts` (contract-only deps), `parser.ts` (contract-only), `utils.ts`,
    `workspace.ts` (no deps) → **source-locator syntax**, importable by both WS and
    extension-sources. Two legal homes: (i) `@agentxm/extension-model` (contract) or
    (ii) WS, with extension-sources _not_ importing it. Since extension-sources
    genuinely needs parse/print (its job is "source syntax, resolution, probing"), and an
    integration cannot import WS, the syntax core must be **contract-side** —
    recommend a `sources` area in extension-model (it already owns package identity).
  - `lock-entry-to-ref.ts` (653 lines; deps: per-type refs, lockfile, settings, scope)
    and `source-to-lock-entry.ts` (lockfile schema + extensions tree/rendered-files) →
    **WS** (lockfile↔ref mapping is state vocabulary).
  - `printer.ts` — knot K4: it imports the five `source-resolution/providers/*` `print`
    functions (pure per-forge shorthand formatting). Fix: lift each provider's pure
    print/parse grammar into the contract-side syntax area (the providers keep probing/
    acquisition); printer follows. Until then, printer is the one syntax file stuck
    integration-side while WS callers (`canonical-observation`, `service.ts`,
    `extension-list`) need `printSourceParams`.
  - `provider.ts` (`NamedRegistryResolution` etc.; deps: refs + release-age after V1)
    → WS types next to `configured-entry-resolution/types.ts`, or contract. ~76 files
    import from `sources/` overall.
- **V4 — agent registry → `@agentxm/extension-model`.** `agents/registry.ts` (58 lines)
  derives `AGENTS` from the extension-model agent-capabilities catalog + one constant
  file (`extensions/universal-skills-dir.ts`, no imports). `agents/constants.ts`
  (39-line path helpers over the catalog + `utils`) and `agents/scope-refusal.ts` are
  the same species. Both WS (layout, read-model scanners/discovery/service — 8+ files)
  and agent-integration (adapters, detection) need the registry, and agent-integration
  may import only contracts ⇒ contract is the only legal shared home. The doc already
  assigns "agent capability data" to extension-model. ~22 importers of
  `agents/registry.js`.
- **V5 — `ConfiguredAgentOutcome` (+Schema) → WS** (from `plan/plan.ts`), together with
  `configured-agent-outcomes.ts`/`setup-scope-support.ts` (correction 1/2). Consumers:
  ~18 files across plan (WO), read-model inventory (WS), agents/coding-agent, CLI.
  WO imports it from WS (legal); plan re-exports nothing.

Cross-cutting flag: `utils/path-types.ts` (`AbsolutePath` etc.) is imported by every
future layer including integrations, so it must land contract-side (or in a `type:lib`
outside the layer matrix) — same treatment as `schema/format-issues.ts` and the `yaml`/
`toml` codec modules. Do not fold it into WS.

---

## 3. Edge-by-edge classification

Classes: **(a)** importing file is destined for a feature/CLI so the edge becomes legal;
**(b)** genuine inversion — either a _vocabulary move_ (b-move, §2) or a _port_ (b-port)
with the interface in the lower package; **(c)** disappears with app-error/CLI
decoupling.

### 3.1 workspace → extension-type modules (production edges, exhaustive)

| Importing file                                                                                                                                             | Imported                                                                                                                                                                                             | Class → resolution                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `accepted-canonical-ref.ts`                                                                                                                                | `extensions/{extension-paths,index}`, `sources` (`*LockEntryToRef` ×7)                                                                                                                               | b-move: V2, V3                                                                                                              |
| `canonical-observation.ts`                                                                                                                                 | `extensions/{index→materialized-tree,extension-paths}`, `lockfile`, `sources` (`lockEntryToSourceParams`, `printSourceParams`)                                                                       | b-move: V2, V3 (printer via K4); lockfile is WS-internal                                                                    |
| `desired-pack-lock.ts`                                                                                                                                     | `lockfile/schema`, `packs/{index→manifest identity,paths}`                                                                                                                                           | b-move: V2                                                                                                                  |
| `desired-state-graph.ts`                                                                                                                                   | `packs/{refs,paths}`, `settings`, `sources/index` (`isWorkspaceSourceLocator`), `extensions/constants`                                                                                               | b-move: V2, V3; settings WS-internal                                                                                        |
| `desired-state-enabled.ts`                                                                                                                                 | (none external)                                                                                                                                                                                      | —                                                                                                                           |
| `extension-list.ts`                                                                                                                                        | `extensions`, `lockfile`, `registry` (`createRegistryClient`), `source-resolution` (`resolveSource`, `SourceHostProviders`), `sources`                                                               | **a** (INSP feature)                                                                                                        |
| `layout.ts`                                                                                                                                                | `agents/registry`, `extensions/constants`, `settings/schema`                                                                                                                                         | b-move: V4, V2                                                                                                              |
| `paths.ts`                                                                                                                                                 | `extensions/constants`                                                                                                                                                                               | b-move: V2                                                                                                                  |
| `observed-installed.ts`                                                                                                                                    | `extensions/index` (`InstallableExtensionType`)                                                                                                                                                      | b-move: V2                                                                                                                  |
| `locked-entries.ts`                                                                                                                                        | `lockfile/index`                                                                                                                                                                                     | WS-internal                                                                                                                 |
| `read-model-record-readers.ts`                                                                                                                             | `extensions` (`installableExtensionTypes`), `mcps` (`isAxmManagedMcpEntry`, `isMcpServerApplicableToAgent`), `settings`                                                                              | b-move: V2 + §3.4 predicate move                                                                                            |
| `read-model/extensions/*.ts` (8 builders)                                                                                                                  | `lockfile/schema`, `settings/schema`                                                                                                                                                                 | WS-internal (correction 6)                                                                                                  |
| `read-model/extensions/inventory.ts`                                                                                                                       | `plan/plan` (`ConfiguredAgentOutcome{,Schema}`)                                                                                                                                                      | b-move: V5                                                                                                                  |
| `read-model/scanners/{agent-dir,agent-settings,mcp-config}.ts`, `read-model/service.ts`, `read-model/agents/index.ts`, `read-model/agent-root-resolver.ts` | `agents/{registry,constants}`                                                                                                                                                                        | b-move: V4                                                                                                                  |
| `read-model/service.ts`                                                                                                                                    | `agents/detection` (`detectAgentsForScope`)                                                                                                                                                          | **b-port**: `AgentPresence` (§3.5)                                                                                          |
| `read-model/scanners/canonical-extensions.ts`, `read-model/discovery/skills.ts`                                                                            | `extensions/discovery-walk`                                                                                                                                                                          | b-move: V2                                                                                                                  |
| `read-model/discovery/{skills,subagents}.ts`                                                                                                               | `agents/registry`                                                                                                                                                                                    | b-move: V4                                                                                                                  |
| `read-model/state.ts`                                                                                                                                      | `lockfile/schema`, `settings/schema`, `schema/format-issues`                                                                                                                                         | WS-internal + shared-util flag                                                                                              |
| `rendered-file-cleanup.ts`                                                                                                                                 | `agents/index` (`CodingAgentRepository`, `pruneManagedMcpServersForAgent`), `hooks/managed-groups`, `extensions/{index,managed-file-banner}`                                                         | **K2** (split XW/SYNC)                                                                                                      |
| `service-interface.ts`                                                                                                                                     | `extensions/{installable-types,refs,extension-paths}`, `lockfile`, `settings`, `registry` (`ScopedReleaseAgeExcludePattern`), `knowledge/discovery-config`, `projection/planning` (`ProjectionPlan`) | b-move: V2, V1, §3.4; `ProjectionPlan` leaves with `ExtensionManager` (§5)                                                  |
| `service.ts`                                                                                                                                               | `skills/paths`, `packs/paths`, `extensions/utils` (`sanitizeName`), `knowledge/discovery-config`, `sources` (param/print), `registry` (V1 items), `lockfile`, `settings`                             | b-move: V2, V1, V3, §3.4                                                                                                    |
| `configured-entry-resolution/types.ts`                                                                                                                     | 7× per-type refs via `<type>/index`, `sources` (`NamedRegistryResolution`), `registry` (release-age records)                                                                                         | b-move: V2, V3, V1 — **but** import via `hooks/index` etc. must be re-pointed at the ref files, not the type-module barrels |
| `configured-entry-resolution/workspace-ref.ts`                                                                                                             | 7× `<type>/refs`, `extensions/{package-hash,utils}`, `sources/types`                                                                                                                                 | b-move: V2, V3                                                                                                              |
| `configured-entry-resolution/resolve.ts`                                                                                                                   | `source-resolution` (`resolveSource`, `SourceHostProviders`), `registry` (`parseMinimumReleaseAge` + types), 7× per-type refs, `sources`                                                             | **K1** (feature) + V1/V2/V3 for its types                                                                                   |
| `initialization.ts`                                                                                                                                        | `agents/{index,instructions,registry}`, `git/detect`, `lockfile`, `settings`                                                                                                                         | **a** (CFG feature) + V4; `agents/instructions` also lands in CFG                                                           |
| `initialization.ts`                                                                                                                                        | `cli-flags` (`isNonInteractive`), `cli-renderer` (`CliRenderer`)                                                                                                                                     | **c**: fold into `WorkspaceInitializationInteraction`                                                                       |
| `initialization-interaction.ts`                                                                                                                            | `cli/prompt`, `cli-prompt`                                                                                                                                                                           | **c**: Live layer → CLI                                                                                                     |
| `resolve-plan-interaction.ts`, `display-plan.ts`                                                                                                           | `cli-*`, `plan/plan`                                                                                                                                                                                 | **a** (CLI)                                                                                                                 |
| `version-currency/{check-currency,collectors}.ts`                                                                                                          | `registry/{utils,client}`, `source-resolution`, `extensions`, `lockfile`                                                                                                                             | **a** (INSP feature)                                                                                                        |
| `test-stubs.ts`                                                                                                                                            | `extensions`, `lockfile`                                                                                                                                                                             | WS `./testing`, post-V2                                                                                                     |
| every workspace file                                                                                                                                       | `app-error`                                                                                                                                                                                          | **c**                                                                                                                       |

### 3.2 agents ↔ workspace (both directions)

agents → workspace:

| File                                                                   | Imports                                                                                                                                                                     | Class → resolution                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `agents/instructions.ts`                                               | `workspace/{paths,scope,transaction(protectWorkspacePath),footprint-recorder,create-symlink}`, `settings`, `extensions` banner helpers, `projection/adapters`, `git/detect` | **a**: file moves to CFG (per brief); its workspace imports become feature→WS (legal after §4 split keeps `protectWorkspacePath` in WS) |
| `agents/coding-agent.ts`                                               | `workspace/{scope,service-interface}` (types), `plan/plan` (`ArtifactChange`), `subagents/rendering/types`, `extensions/{managed-file-banner,rendered-files}`               | **K3**: the `CodingAgent`/`CodingAgentRepository` port is workspace-semantic and cannot live in agent-integration                       |
| `agents/repository.ts`                                                 | `workspace/service-interface` (`WorkspaceMutations`)                                                                                                                        | follows K3                                                                                                                              |
| `agents/mcp-sync.ts`                                                   | `workspace/transaction` (`protectWorkspacePath`), `mcps/*` (7 modules), `settings`, `projection/adapters`, `yaml`                                                           | → **XW** (per-type projection-to-agent-surface semantics; all deps are WS/XW/contract after moves)                                      |
| `agents/subagent-sync.ts`                                              | `workspace/transaction` (`protectWorkspacePath`), `extensions`, `subagents/rendering`                                                                                       | → **XW** (same reasoning)                                                                                                               |
| `agents/detection.ts`                                                  | `app-error`, `utils`                                                                                                                                                        | → agent-integration (class c for app-error)                                                                                             |
| `agents/registry.ts`, `agents/constants.ts`, `agents/scope-refusal.ts` | contracts (+`extensions/universal-skills-dir`)                                                                                                                              | b-move: V4 / WS (correction 2)                                                                                                          |

workspace → agents: covered in §3.1 (layout, read-model, initialization,
rendered-file-cleanup, setup-scope-support rows).

### 3.3 plan → hooks / mcps / registry (and the plan module's destination)

The plan module splits: `plan/{plan,operation-events,operation-journal,operation-resolution,apply-plan,execution-candidate,job-step-message}.ts`
→ **WO**; `plan/resolve-plan.ts` → **CLI** (it is the interactive
preview/confirm/apply orchestration: imports `cli-flags`, `cli-prompt`, `cli-renderer`,
`cli-runtime` ×2, `displayPlan`, `ResolvePlanInteraction` — the doc's definition of
application wiring). Consumers of `resolvePlan` are 4 CLI files already.

| Edge                                        | Exact content                                                                                                                                                                                            | Class → resolution                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan/plan.ts` → `registry`                 | `type ReleaseAgeOperationEvidence`                                                                                                                                                                       | b-move: V1                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `plan/operation-journal.ts` → `registry`    | same type                                                                                                                                                                                                | b-move: V1                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `plan/operation-resolution.ts` → `registry` | same type                                                                                                                                                                                                | b-move: V1                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `plan/resolve-plan.ts` → `hooks/manager`    | `HookManager` via `Effect.serviceOption`, used only for `configuredAgentOutcomes(state)` override (lines 203, 230–238, 606–610)                                                                          | **b-port**: declare `ConfiguredAgentOutcomesProvider` next to `ConfiguredAgentOutcome` in WS (`(state: "projected" \| "current") => Effect<ReadonlyArray<ConfiguredAgentOutcome>, E>` keyed by extension type); `HookManager` provides it; app wires. After resolve-plan moves to CLI the edge is legal anyway, but the port keeps the CLI from reaching into a type-module manager and survives a later re-hosting of resolve-plan into a feature |
| `plan/resolve-plan.ts` → `mcps/targeting`   | `isMcpServerApplicableToAgent(entry, agentId)` — pure predicate over settings `McpServerEntry` + agent-capabilities contract                                                                             | b-move: §3.4                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `plan/resolve-plan.ts` → workspace          | `augment-plan`, `scan-plan-readiness` (WO), `service-interface`, `transaction` closure fns (WO), `footprint-recorder` (WS), `display-plan`, `resolve-plan-interaction`, `configured-agent-outcomes` (WS) | legal once resolve-plan is CLI                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `agents/coding-agent.ts` → `plan/plan`      | `type ArtifactChange`                                                                                                                                                                                    | b-move: `ArtifactChange` is plan-presentation vocabulary; move to WS beside `ConfiguredAgentOutcome` (V5) so both the K3 port and WO can see it                                                                                                                                                                                                                                                                                                    |

### 3.4 Settings-semantics predicates (dissolves mcps edges)

`isMcpServerApplicableToAgent` (`mcps/targeting.ts`; deps: agent-capabilities contract,
`settings`, `mcps/shared-target`) and `isAxmManagedMcpEntry` (`mcps/metadata.ts`; deps:
`sources` + effect) are pure predicates over WS-owned settings/lockfile entry shapes.
Move both (plus the small `shared-target` helper they need) into WS beside the settings
schema. Erases `read-model-record-readers→mcps` and `resolve-plan→mcps`. The rest of
`mcps/` stays put (XW/lifecycle material, out of scope here).

### 3.5 Read-model detection port (`AgentPresence`)

`read-model/service.ts` calls `detectAgentsForScope(workspaceRoot, scope)` once (cached)
to build a `Set<AgentId>` presence fact; failures degrade to a diagnostic + empty set.
Design: WS declares

```ts
interface AgentPresenceProbe {
  readonly detect: (
    root: AbsolutePath,
    scope: WorkspaceScope,
  ) => Effect<ReadonlySet<AgentId>, AgentPresenceError>;
}
```

as an optional service (mirroring the existing `Effect.serviceOption(HookManager)`
pattern and the existing `AgentRootResolver` service seam); agent-integration implements
it from `detection.ts`; the app provides it. Absent probe ⇒ empty presence (same
degradation the code already implements on error). Blast radius: `read-model/service.ts`
plus test layers (`__fixtures__/test-layer.ts`).

### 3.6 Inbound edges that constrain the partition (for completeness)

- `source-resolution/{resolve-identifier,resolve-source,resolve-source-pattern,service}.ts`
  import `WorkspaceMutations`, `read-model/discovery`, `read-model-record-rows` — an
  integration reaching into the kernel. Knot K5.
- `extensions/materializable-from-disk.ts`, `extensions/operations.ts`,
  `projection/{invariant-facts,contributors,planning,constraint-invariant-fact,managed-region-adapter}.ts`,
  per-type managers/operations (hooks, mcps, packs, skills, subagents, knowledge, rules),
  `lint/*`, `settings/settings.ts`, `lockfile/lockfile.ts`, `utils/fs-helpers.ts`,
  `install-meta`, `install-method`, `knowledge/knowledge-query.ts`,
  `sources/lock-entry-to-ref.ts` — all import WS-destined symbols
  (scope, layout, paths, transaction protection, footprint, service-interface,
  record rows, accepted-canonical-ref, observed-installed, desired-state-graph,
  configured-entry-resolution, rendered-file-cleanup, read-model). All become legal
  X→WS edges for whatever bin those modules land in, **except** the two flagged:
  integrations (`source-resolution`, K5) and `rendered-file-cleanup` consumers
  (`subagents/manager.ts`, `lint/workspace-context.ts`, K2).

---

## 4. Transaction machinery: the WS/WO seam inside `transaction.ts`

`transaction.ts` (805 lines) currently contains two species:

**WS half — ambient authority context + write registration** (stays with the state
package because WS-level writers call it: `settings/settings.ts`, `lockfile/lockfile.ts`,
`workspace/create-symlink.ts`, `utils/fs-helpers.ts`; ~24 files use
`protectWorkspacePath`/`recordFootprint`):

- `CurrentWorkspaceTransaction` / `CurrentWorkspaceClosure` references (the ambient
  context definition)
- `protectWorkspacePath` (l.359), `protectCreatedAncestors` (l.397)
- `WorkspaceRestorationIncomplete` (l.96), `restorationIncompleteToAppError` (l.125 —
  becomes an app-side mapper after error decoupling), `surfaceRestorationIncomplete`
  (l.151), `readPendingClosureRestorationFailures` (l.373)
- `footprint-recorder.ts` wholesale
- from `transition-lock.ts`: `TransitionLockHolder`, `TransitionContention` types
- from `augment-plan.ts`: `LockfileState` type
- the facade contract types in `service-interface.ts`:
  `WorkspaceLifecycleTransactionArgs`, `WorkspaceTransactionRunner`,
  `WorkspaceTransitionRequest`, `WorkspaceTransitionAcquirer`

**WO half — safe-application mechanics** (implements against the WS-declared context):

- `runWorkspaceTransaction` (l.591) — snapshot/restore/validate/rollback engine
- `withWorkspaceClosure` (l.70), `settleWorkspaceClosure` (l.297),
  `rollbackWorkspaceClosure` (l.319)
- `transition-lock.ts` acquisition/contention implementation
- `augment-plan.ts` + `scan-plan-readiness.ts` + the plan module (§3.3)

This split preserves the doc's assignment (WO owns "transactions, journals, rollback,
and safe application mechanics") while keeping the _registration_ primitives — which any
workspace writer must reach — at the bottom. The ambient `ServiceMap.Reference`s must be
defined in WS (single definition both halves share); WO's runner installs/consumes them.

---

## 5. WorkspaceMutations facade design (deliverable 4)

What `service.ts` (2050 lines) actually depends on, verified:

- **WS-internal after §2/§3**: lockfile commit API + schemas, settings write API +
  schemas, layout/paths, read-model (records readers, agent-root resolver, errors),
  `desired-state-graph`, `desired-pack-lock`, `sanitizeName` (V2), `skills/paths` +
  `packs/paths` (V2, only in `getSkillDir`/`getPackDir`, lines 1198/1597),
  `lockEntryToSourceParams`/`printSourceParams` (V3, source-string display, 6 call
  sites), `resolveKnowledgeDiscoveryConfig` (15-line pure fn — move it into WS settings
  semantics; it has zero knowledge-module deps), `DEFAULT_MINIMUM_RELEASE_AGE` +
  `ScopedReleaseAgeExcludePattern` (V1), extension-model contract.
- **WO**: exactly two call sites — `runWorkspaceTransaction` (l.378) and
  `acquireWorkspaceTransitionLock` (l.393), implementing the `runTransaction` /
  `acquireTransition` members.

**Design: the facade stays whole in WS, with the two WO capabilities injected.**

1. `service-interface.ts` stays in WS minus two extractions:
   - `ExtensionManager<TRef>` + `MaterializationObservation` +
     (with them) the `ProjectionPlan` type dependency → move to **XW** (new
     `extension-manager.ts`). Evidence: its implementors are the seven type managers
     (hooks/knowledge/mcps/packs/rules/skills/subagents — XW/lifecycle) and its sole
     consumer is `extensions/operations.ts` (lifecycle orchestration). WS never calls
     it. It references `WorkspaceTransactionRunner`, `ExtensionTarget`, `ExtensionRef`
     — all WS types, legal from XW.
   - Nothing else moves; `ExtensionTarget`, Set*/lock-map types, records API stay.
2. `makeWorkspaceMutations` (the body of `loadWorkspace` minus wiring) takes a
   capabilities argument:

   ```ts
   interface WorkspaceTransactionCapabilities {
     readonly runTransaction: WorkspaceTransactionRunner; // type: WS
     readonly acquireTransition: WorkspaceTransitionAcquirer; // type: WS
   }
   ```

   and threads them straight onto the service members. Zero behavior change; the ~198
   files consuming `WorkspaceMutations` keep their call sites verbatim.

3. WO exports `makeWorkspaceTransactionCapabilities(layout, …)` wrapping
   `runWorkspaceTransaction` + `acquireWorkspaceTransitionLock`.
4. `loadWorkspace` / `layer` (l.268/l.2049) — the only places that need both packages —
   move to the composition seam: either WO's `./live` ("operations-backed workspace")
   or the app's runtime module. Recommend WO `./live`, since the CLI already composes
   `runtime.ts` from there and tests need one canonical live loader.
5. `initialization.ts` is invoked from `loadWorkspace` today (setup-on-first-use).
   After the move, `loadWorkspace` (WO live/app) calls the CFG feature's
   initialization API — legal only at the app layer, so first-use initialization
   becomes app wiring (composition root passes an `onUninitialized` handler or the
   CLI runs setup before constructing the layer). This is the one behavioral seam in
   the facade move; it needs an explicit decision at implementation time.

Rejected alternative: splitting the facade into "typed accessors service (WS)" +
"transaction service (WO)" as two user-visible services — it would touch all ~198
consumer files and break the `ExtensionManager.runTransaction` field for no
architectural gain; capability injection achieves the same edge direction.

---

## 6. Slice ordering (each slice leaves the repo green)

| #   | Slice            | Content                                                                                                                                                                                                                                    | Blast radius                              | Risk                                                                                                                                                                                                                                                       |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Contract descent | V1 (release-age → registry-protocol), V4 (AGENTS/constants/universal-skills-dir → extension-model), `schema/format-issues` + `utils/path-types` homing                                                                                     | ~31 + ~22 files, import-path churn only   | Low (type-only; watch extension-model's "no filesystem/terminal behavior" budget — V4 path helpers use `Path` service: keep the _data_ in the contract and leave the effectful `agents/constants.ts` helpers with agent-integration if the budget objects) |
| S2  | Ref vocabulary   | V2 (refs layer, extension-paths, rendered-files, package-hash, materialized-tree, discovery-walk, constants, utils subset, skills/packs paths, pack manifest identity) + V5 (`ConfiguredAgentOutcome`, `ArtifactChange`) + §3.4 predicates | ~100–120 files, mechanical                | Medium-low; do V2 as one slice — partial moves create bounce imports                                                                                                                                                                                       |
| S3  | Sources split    | V3: syntax core → contract; lock-entry mapping → WS; K4 printer grammar lift                                                                                                                                                               | ~76 files                                 | Medium (printer grammar lift is real code motion, not renames)                                                                                                                                                                                             |
| S4  | Transaction seam | §4 split of `transaction.ts`/`transition-lock.ts`; `LockfileState` type to WS; facade capability injection + `loadWorkspace` relocation (§5); `ExtensionManager` → XW                                                                      | ~30 files edited, 198 type-check-affected | Medium-high (behavioral seam: first-use initialization wiring)                                                                                                                                                                                             |
| S5  | Read-model ports | §3.5 `AgentPresence` port; scanners take registry from contract (already parameterized)                                                                                                                                                    | ~6 files                                  | Low                                                                                                                                                                                                                                                        |
| S6  | Feature pulls    | `extension-list` + `version-currency` → INSP; `initialization`(+interaction split) + `agents/instructions` → CFG; `display-plan`, `resolve-plan-interaction`, `plan/resolve-plan` → CLI; plan core → WO                                    | ~25 files + CLI wiring                    | Medium (interaction inversion in `initialization.ts` is the only redesign)                                                                                                                                                                                 |
| S7  | Knots            | K1, K2, K3, K5 below                                                                                                                                                                                                                       | see knots                                 | High — schedule last, each independently shippable                                                                                                                                                                                                         |

Order rationale: S1–S3 are pure descent that every later slice's legality depends on;
S4 unlocks the kernel package boundaries; S5–S6 drain the feature/CLI files; the knots
are isolated redesigns that no earlier slice depends on.

---

## 7. Hard knots (deliverable 5 flags)

**K1 — `configured-entry-resolution/resolve.ts` (982 lines).** Resolves configured
settings entries to concrete refs via `resolveSource`/`SourceHostProviders`
(integration) + release-age evaluation + `WorkspaceMutations` + accepted-canonical
fallback. Consumers: hooks/knowledge/rules managers (lifecycle) — shared policy that
cannot go inward (kernel↛integration).

- _Option 1 (recommended):_ land it in **extension-lifecycle** as "configured-entry
  resolution policy"; sync re-resolves through lifecycle's published use-case API only
  if it ever needs to (today's consumers are all lifecycle-side managers).
- _Option 2:_ move into **extension-sources** with its WS needs passed as parameters
  (release-age evaluation, accepted-ref lookup as function arguments) — makes the
  integration stateless w.r.t. the kernel but pushes policy into an integration,
  against the doc's "integrations isolate change, features own policy".
- _Option 3:_ split: the per-type "entry → source-params" normalization → WS; the
  network resolution → extension-sources; the policy loop → lifecycle. Cleanest
  layering, most churn (~7 consumer files, 982 lines redistributed).

**K2 — `rendered-file-cleanup.ts` (561 lines).** Ownership scan + pruning of managed
rendered files across agent surfaces. Needs `CodingAgentRepository` (K3),
`pruneManagedMcpServersForAgent` (agents/mcp-sync → XW), `hooks/managed-groups` (XW),
`managed-file-banner` (V2/XW). Consumers: `subagents/manager.ts` (lifecycle),
`lint/workspace-context.ts` (type only: `WorkspaceOwnershipIssue`), `agents` tests.

- _Option 1 (recommended):_ split — managed-file _discovery_ (banner detection,
  `findManagedSubagentFiles`, `WorkspaceOwnershipIssue`) → **XW**; agent-surface
  _pruning orchestration_ → **SYNC**; lint and subagents/manager consume the XW half
  (legal), sync owns the destructive sweep.
- _Option 2:_ whole file → SYNC and give lint its `WorkspaceOwnershipIssue` type from
  WS — but `subagents/manager.ts` (lifecycle) calls `findManagedSubagentFiles`, and a
  feature may not import a feature ⇒ forces option 1's split anyway or an XW helper.
- _Option 3:_ whole file → XW; requires the K3 port so XW never sees agent-integration.
  Viable if K3 resolves port-in-kernel.

**K3 — `CodingAgent`/`CodingAgentRepository` port placement.** The contract
(`agents/coding-agent.ts`) references `WorkspaceScope`, `WorkspaceMutations`,
`ArtifactChange`, subagent render inputs, managed-file provenance — kernel vocabulary.
agent-integration must not import kernels, so the port cannot live there as-is.
Its concrete per-agent implementations live in the CLI package today (per the file's own
doc comment), with `agents/repository.ts` as the registry-backed default.

- _Option 1 (recommended):_ declare the port in **XW** (it is "extension-type workspace
  semantics projected onto agents"); implementations stay app-side (CLI) or in SYNC;
  agent-integration keeps only detection + native-surface primitives (paths, file
  formats) consumed by those implementations. Matches today's actual shape.
- _Option 2:_ narrow the port until it is kernel-free (primitive paths/strings instead
  of `WorkspaceScope`/`WorkspaceMutations`, move `ArtifactChange` out per V5) and put it
  in agent-integration. Honest agent-integration, but the interface currently has ~10
  methods leaning on workspace types — a large redesign with airtight-but-anemic types.
- _Option 3:_ keep the port in WS next to `service-interface.ts`. Cheapest, but bloats
  WS with projection semantics that belong a layer up; only take this if XW ends up too
  thin to justify.

**K4 — `sources/printer.ts` provider grammar.** Covered in V3: per-forge `print`
functions are pure grammar currently trapped in `source-resolution/providers/*`.
Lift grammar (parse+print pairs) contract-side; providers keep probe/acquire. Without
this, WS cannot print source strings (6 facade call sites + canonical-observation +
extension-list).

**K5 — `source-resolution` (extension-sources) imports the kernel.**
`resolve-source-pattern.ts` uses `read-model/discovery` + `read-model-record-rows`;
`resolve-identifier/resolve-source/service.ts` use `WorkspaceMutations`. An integration
may not import kernels.

- _Option 1 (recommended):_ the `workspace:` scheme is not an external source — extract
  the workspace-pattern provider out of extension-sources into **XW** (or lifecycle),
  registered into `SourceHostProviders` by the app; extension-sources keeps registry/git/
  local.
- _Option 2:_ a `WorkspaceCatalog` port declared inside extension-sources (rows +
  discovery as data), implemented by WS, wired by the app. Keeps one provider registry,
  but inverts through a fairly wide data surface.
- _Option 3:_ pass workspace lookups as request parameters from callers. Pushes
  plumbing into every feature call site; only attractive if provider registration turns
  out to be app-composed anyway.

---

## 8. Answers to the brief's direct questions, in one place

1. Partition table: §1.2/§1.3 (with the seven corrections in §1.1).
2. workspace→type-module edges: §3.1; overwhelmingly class b-move via V1–V5; the only
   b-port inversions are `AgentPresence` (§3.5) and `ConfiguredAgentOutcomesProvider`
   (§3.3); the only genuinely feature-bound files are `extension-list`,
   `version-currency`, `initialization*`, `configured-entry-resolution/resolve`,
   `rendered-file-cleanup` (split), and the CLI display/interaction trio.
3. agents↔workspace: §3.2 (instructions → CFG legal; mcp-sync/subagent-sync → XW;
   coding-agent port = K3; registry/constants/scope-refusal = V4/WS). plan→hooks/mcps/
   registry: §3.3 (registry = V1 type move; mcps = §3.4 predicate move; hooks =
   ConfiguredAgentOutcomesProvider port; resolve-plan itself is CLI).
4. WorkspaceMutations: stays whole in WS with WO-injected transaction capabilities;
   `ExtensionManager` moves to XW; `loadWorkspace` moves to WO `./live`; §5.
5. Slices S1–S7 with blast radii: §6; knots K1–K5 with options: §7.
