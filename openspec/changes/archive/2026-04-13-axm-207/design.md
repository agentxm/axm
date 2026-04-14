## Context

Three features need version-currency awareness: the `extensions-current` doctor check (are installed extensions up to date?), `axm outdated` (show me what's outdated), and `axm update` (bring everything current). Today these capabilities don't exist at the root level — per-type update commands exist for skills, commands, and subagents, but there's no cross-type aggregation, no read-only outdated report, and no doctor coverage.

The root `axm install` command established the pattern for cross-type aggregation: a workspace-level collector per extension type, parallel plan building, fragment deduplication, and a shared preview/apply flow. The doctor check graph (from AXM-202) established the pattern for cross-type diagnostics: `defineCheck` with `prepareContext` + diagnostics, dependency cascade, and finding rollup.

All three features share the same core question: "given an installed registry extension and its available versions, what's the update status?" The design centers on extracting that question into shared domain logic while keeping extension-type-specific concerns isolated behind per-type seams.

## Goals / Non-Goals

**Goals:**

- Extract a shared version-currency assessment module that doctor, outdated, and update can all consume
- Follow the root install pattern for `axm update` (two-mode dispatch: workspace aggregation + FQN single-extension)
- Keep per-type update logic in per-type modules — the root command aggregates, it doesn't replace
- Make `axm outdated` a read-only command that shares the assessment logic but never mutates

**Non-Goals:**

- Replacing or refactoring existing per-type update commands — they continue to work as-is
- Graceful degradation for unreachable registries (AXM-219)
- Update support for non-registry sources (local, git)
- Pack constraint resolution in the shared module — that stays in the skills update handler where it belongs

## Decisions

### 1. Shared version-currency module in client-core

**Decision:** Create `packages/core/src/unstable/workspace/version-currency/` with a `checkCurrency` function that takes an installed version, a version constraint, and an `ExtensionIndex`, and returns a `CurrencyResult`.

```ts
interface CurrencyResult {
  readonly status: "current" | "update-available" | "major-update-available";
  readonly installedVersion: ExactSemverVersion;
  readonly latestMatching: Option.Option<ExactSemverVersion>; // latest satisfying declared constraint
  readonly latestAvailable: ExactSemverVersion; // absolute latest in index
}
```

The function is type-agnostic — it operates on version strings and registry index data, not on skill/command/subagent-specific types. Each consumer (doctor check, outdated command, update command) maps its per-type data into these inputs.

**Why not put this in the version-constraints module?** Version-constraints is a pure utility module that operates on semver strings. Currency assessment requires `ExtensionIndex` (a registry concept) and the notion of "installed version" (a workspace concept). It lives at the intersection of registry + workspace, which is a higher-level concern.

**Why not inline it in each consumer?** The logic is identical across all three features. Divergence would be a bug.

### 2. Per-type currency collectors

**Decision:** Each extension type gets a currency collector function that:

1. Reads configured entries from settings (filtered to enabled, registry-sourced)
2. Reads lock entries to get installed versions
3. Fetches `ExtensionIndex` from the registry for each entry (parallel, unbounded concurrency)
4. Calls `checkCurrency` for each entry
5. Returns a `ReadonlyArray<ExtensionCurrencyEntry>` with the assessment results

```ts
interface ExtensionCurrencyEntry {
  readonly ref: string; // FQN: @owner/type/name
  readonly type: ExtensionType;
  readonly installedVersion: ExactSemverVersion;
  readonly constraint: Option.Option<VersionConstraint>;
  readonly currency: CurrencyResult;
}
```

These collectors live in `packages/core/src/unstable/workspace/version-currency/` alongside the shared `checkCurrency` function. They are parameterized by extension type and consume `Workspace` + `RegistryClient` services.

**Why per-type collectors instead of one generic collector?** Each type has a different configured-entry shape, lock-entry shape, and source-parsing path. A generic collector would need type-level polymorphism that obscures rather than clarifies. The seam is: each collector produces the same `ExtensionCurrencyEntry` output, which downstream consumers handle uniformly.

### 3. Root `axm update` follows the install aggregation pattern

**Decision:** `packages/cli/src/root/update/` mirrors the `install/` directory structure:

- `command.ts` — command definition with `source` (optional arg), `--scope`, `--yes`, `--force`, `--preview`
- `handler.ts` — two-path dispatch: `Option.match(source, { onNone: handleWorkspaceUpdate, onSome: runUpdateIntent })`
- `resolve-root-update-intent.ts` — FQN parsing, reusing `parseRegistryInstallTarget` from `root/shared/`
- `workspace-update.ts` — per-type collectors aggregating plans, same fragment-merge and section-merge pattern as workspace-install
- `workspace-update-handler.ts` — orchestrates plan building → preview/apply

The FQN dispatch routes to existing per-type update handlers via their workflow mechanisms. Each type already has update logic (skills, commands, subagents); the root command reuses that logic, it doesn't duplicate it.

**Packs and MCP servers:** Per-type update commands don't exist for packs or MCP servers today. The workspace update collector should include them if their update workflow is straightforward (re-resolve + reinstall), or skip them with an info-level message if not. This aligns with the install command, which includes all five types in its workspace collector.

### 4. Root `axm outdated` as a read-only consumer of currency collectors

**Decision:** `packages/cli/src/root/outdated/` is a minimal command:

- `command.ts` — command definition with `--scope`, `--type` (filter), `--json`
- `handler.ts` — calls currency collectors for all types (or filtered), formats output

No plan building, no preview/apply, no mutations. The handler calls the same per-type currency collectors from the shared module, filters to non-current entries, and renders a table (human) or structured list (JSON).

**Human output shape:**

```
Extension                        Installed  Constraint  Latest
@acme/skills/code-review         1.2.3      ^1.0.0      1.4.0
@acme/commands/deploy            2.0.1      ^2.0.0      2.1.0
@acme/skills/security-audit      1.0.0      *           3.0.0  (major)

3 extensions have updates available.
```

**Why a separate command instead of a flag on doctor?** Doctor is a health assessment — it answers "is anything wrong?" Outdated is an inventory query — it answers "what can I update?" Different questions, different output shapes, different exit-code semantics. Doctor emits `info`-severity findings that don't break health; outdated provides a detailed version table. They share domain logic but serve distinct user intents.

### 5. Doctor check consumes currency collectors, emits findings

**Decision:** The `extensions-current` check calls the same per-type currency collectors and maps each non-current `ExtensionCurrencyEntry` to a `Finding`:

- `update-available` (info) — when `latestMatching` is newer than installed
- `major-update-available` (info) — when `latestAvailable` has a higher major version than installed

The check depends on `extensions-installed` (if extensions aren't properly installed, currency is meaningless). All findings are `info` severity — they never affect `healthy` or exit code.

The check's `prepareContext` fetches currency data; a single diagnostic emits the findings. This follows the pattern established by `extensions-installed`.

**Action field:** Findings include `action: { label: "Update", command: "axm update <ref>" }` pointing to the new root update command.

### 6. Registry client usage: `getExtensionIndex` per extension

**Decision:** Currency assessment fetches `ExtensionIndex` for each installed registry extension. This is an N+0 query pattern (one HTTP request per extension, no batch endpoint).

**Why not batch?** The registry client doesn't have a batch-index endpoint. Adding one is out of scope. The per-extension approach is correct for the expected scale (tens of extensions, not thousands), and the calls run with unbounded concurrency.

**Caching:** No request-level caching in this change. If the same extension appears in multiple checks (e.g., `extensions-installed` already resolved it), we accept the redundant fetch. A shared request cache is a future optimization, not a correctness concern.

## Risks / Trade-offs

**[N requests per doctor run]** Each registry extension triggers a `getExtensionIndex` call. For workspaces with many extensions, this adds latency to `axm doctor`. Mitigated by unbounded concurrency — requests are parallel. Graceful degradation for failures is deferred to AXM-219.

**[Per-type update gaps]** Packs and MCP servers don't have per-type update commands today. The root `axm update` workspace collector will need update logic for these types. If that logic is non-trivial, we can skip those types in the initial implementation and add them as follow-up work. The outdated command and doctor check can still report currency for all types since they're read-only.

**[Constraint divergence between update and outdated]** The skills update handler has pack-constraint resolution logic that affects which version is "latest matching." The shared currency module doesn't include pack constraints — it only considers the declared user constraint. This means outdated might report a version as available that update would hold back due to pack constraints. Acceptable: outdated shows what the registry offers; update applies the full constraint set during execution. The user sees the full picture across both commands.
