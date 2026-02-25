## Context

Install commands can currently recover from a missing lockfile, but typically only for the extension type being installed. Because `axm-lock.yaml` is a single cross-extension snapshot, this behavior can leave partial state after recovery.

In many workspaces, settings already declare managed extensions across multiple types, and many are already materialized on disk. Missing-lockfile recovery should reconcile to settings intent first, using disk only as a fast-path when local materialization matches declarations.

Constraints:

- Preserve current UX/success path for the explicit install request.
- Keep behavior deterministic and reproducible.
- Reuse existing workspace/extension services and Effect patterns.
- Do not mix project and user scopes during reconciliation.

## Goals / Non-Goals

**Goals:**

- When lockfile is missing, rebuild a complete cross-extension lock snapshot before normal install execution.
- Support all managed extension types covered by lockfile/settings (skills, commands, packs, mcp servers).
- Reconcile to settings-authoritative intent, using local disk as a fast path when declaration-compatible.
- Ensure planning/execution uses the same bootstrapped lock view.

**Non-Goals:**

- Changing install behavior when lockfile already exists.
- Reinstalling or rewriting valid already-materialized extension content.
- Expanding this change to uninstall/update flows.

## Decisions

### 1) Shared bootstrap trigger across install entrypoints

Any install command (`skills`, `commands`, `packs`, `mcp servers`) checks for missing lockfile and invokes one shared bootstrap routine before continuing normal plan/execute flow.

Reconciliation scope is the active scope only (`project` or `user`). The routine MUST NOT read declarations from the other scope.

Why:

- Keeps lockfile policy consistent across extension types.
- Matches user expectation for a single authoritative lock snapshot.

Alternative considered:

- Keep bootstrap only in `skills install`. Rejected: policy mismatch and continued partial snapshots.

### 2) Cross-extension reconstruction adapters

Bootstrap orchestration is shared, but each extension type provides an adapter that knows how to:

- enumerate managed declarations from settings
- locate canonical installed path(s)
- validate minimal on-disk metadata (manifest/schema)
- construct lock entry from validated disk state

Why:

- Common flow with type-specific path/manifest rules.
- Avoids one monolithic, brittle type-switch in command handlers.

Alternative considered:

- One generic resolver for all types. Rejected: path/manifest differences are real and will leak complexity.

### 3) Source-of-truth precedence and reconciliation scope (per extension)

For each managed declaration in active settings:

1. **Settings-authoritative declaration:** settings define the target source/version for reconciliation.
2. **Disk-assisted reconstruction:** if canonical materialization + metadata are valid AND match declaration, reconstruct lock entry without network calls.
3. **Mismatch/invalid fallback:** if disk is missing, invalid, or declaration-mismatched, mark unresolved and resolve/install that declaration in the same run.

Reconciliation includes all managed declarations in active settings across all extension types, not only the currently invoked command type. This mirrors npm/pnpm behavior when lockfile is missing: regenerate lock state for full manifest.

Why:

- Fast and stable for already-installed state.
- Preserves correctness when local state is incomplete.

Alternative considered:

- Re-resolve all declarations unconditionally. Rejected: unnecessary network/downloads and possible drift from local state.

### 4) Bootstrap result contract

Shared routine returns:

- `bootstrapped`: reconstructed lock entries grouped by extension type
- `unresolved`: unresolved declarations grouped by extension type (to be resolved in this same run)
- `unresolvedReason`: per declaration reason in `{ missing, invalid, declaration-mismatch }`
- `warnings`: recoverable issues for user logs (including settings/disk mismatches)

Rules:

- One bad entry does not fail bootstrap discovery; it moves to unresolved resolution.
- Final lockfile write is from merged state: reconstructed + resolved unresolved + explicit requested install entries.
- Final lockfile MUST represent active-scope settings intent; reconstruction never overrides declaration intent.

Bootstrap uses a strict two-phase model:

1. **Augment phase (read-only):** inspect lockfile/settings/disk and augment the incoming plan with reconciliation/materialization operations as needed; no filesystem/network mutations.
2. **Apply phase (side-effectful):** resolve/install unresolved declarations by delegating to existing per-type install planners/handlers.

The augment phase runs inside `resolvePlan` before preview/confirmation. The apply phase runs only after confirmation so `--preview` remains a true dry-run.

### 5) Plan/execution integration

`resolvePlan` augments plans in a read-only pre-apply stage so expected results (`already installed` vs `install`) match apply behavior.

No side effects are allowed before `resolvePlan`. The augmented plan must include:

1. reconciliation operations for unresolved declarations (cross-extension)
2. user-requested install operations
3. final lockfile materialization operation

`--preview` renders this full augmented plan without applying it.

Preview invariant: `--preview` is always dry-run and MUST NOT apply changes, even with `--yes`.

Augmentation is encapsulated in `resolvePlan` via an internal `augmentPlan` stage driven by operation metadata policies. Command handlers and plan builders should not call reconciliation discovery directly.

`augmentPlan` contract:

- Signature: `augmentPlan(plan, context) -> { plan: augmentedPlan, diagnostics }`
- Purity: read-only (can read lockfile/settings/disk), no writes/network mutations.
- Idempotence: running `augmentPlan` twice with the same input/context yields the same augmented plan.
- Single-pass rule: `resolvePlan` runs `augmentPlan` once per invocation.

### 6) User-visible messaging

On missing lockfile:

- emit one bootstrap notice
- report reconstructed/unresolved/resolved counts per extension type
- warn per unresolved item with actionable hint

### 7) Prompting and non-interactive behavior

Because unresolved declarations across all extension types are resolved in the same run, interactive prompts may occur outside the explicitly requested type (for example env input for unresolved MCP servers).

- Interactive mode: prompts are allowed as needed during reconciliation.
- `--non-interactive`: if any unresolved declaration requires prompt-only input, the command fails with actionable errors.

Prompt order is deterministic:

1. extension type order: `skills`, `commands`, `packs`, `mcp-servers`
2. within each type: lexicographic by extension name

### 8) Disabled managed entries

Bootstrap includes all managed declarations in active settings, including disabled entries, because lockfile represents resolved state, not enabled runtime state.

### 9) Atomic lockfile persistence

After reconciliation + requested install execution, lockfile is written atomically:

1. serialize full merged lock state
2. write to temp path in same directory
3. replace target lockfile path in one move

If atomic write fails, command fails with a typed `CliError` and does not leave a partially written lockfile.

Backup/atomic details:

- Backup filename for invalid lockfile: `axm-lock.yaml.bak.<YYYYMMDDHHmmss>` in the same directory.
- Backup is created only when replacing an `invalid` lockfile.
- If backup creation fails, materialization aborts (do not overwrite existing invalid file).
- Atomic write is temp-file-in-same-dir then rename-replace.

### 10) Concurrency and ordering guardrails

- Adapter reconstruction/validation runs with `Effect.forEach` and explicit concurrency (`"unbounded"` unless a type requires sequential ordering).
- Final lock merge and lockfile write are sequential and single-writer.
- Prompt-producing operations run in deterministic order to avoid interleaved interactive UX.

### 12) Handler integration example

```ts
// packages/cli/src/commands/skills/install/handler.ts
import { Effect, Option } from "effect";
import { Workspace } from "@/workspace";
import { buildSkillsInstallPlan } from "@/extensions/skills/operations/build-plan";

interface InstallSkillsHandlerArgs {
  readonly source: string;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option.Option<boolean>;
}

export const handleSkillsInstall = (args: InstallSkillsHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // 1) Build requested install plan only
    const plan = yield* buildSkillsInstallPlan({
      source: args.source,
      nonInteractive: args.nonInteractive,
      name: "Install skill(s)",
      description: Option.none(),
    });

    // 2) resolvePlan performs read-only augmentPlan (policy-based reconciliation)
    //    then applies the augmented plan
    yield* ws.resolvePlan(plan);
  });
```

`resolvePlan` should own both read-only `augmentPlan` and handler dispatch internally via a registered operation registry, so command handlers do not compose handler maps. Handlers stay declarative: build plan, resolve plan.

Type safety requirement: `resolvePlan` MUST remain compile-time safe by accepting only plans whose operation union is fully covered by its internal handler registry. If a plan includes an operation without a registered handler, TypeScript should fail compilation (mirroring the existing exhaustive handler constraint in plan-apply typing).

### 11) Specs mapping completeness

Spec deltas for this change MUST cover all lock-view consumers in install flows:

- `cli-skills-install`
- `cli-packs-install`
- `commands-install-execute`
- `mcp-servers-install-execute`
- `skills-install-build-plan`
- `skills-install-execute`
- new `lockfile-bootstrap-from-workspace`

### 13) Operation metadata: lockfile policy

Add lockfile reconciliation policy to operation metadata so behavior is defined by operation class, not ad-hoc command logic.

Storage/encapsulation:

- Metadata is authored and exported in the same module as each operation definition/handler (co-located with feature logic).
- A central registry module (same layer as handler registry) aggregates operations into a single typed registry.
- `resolvePlan` uses this registry for both `augmentPlan` policy evaluation and handler dispatch.

Example shape:

```ts
// LockfilePolicy controls behavior when lockfile state is missing/invalid.
// - Policy is evaluated during resolvePlan's read-only augmentPlan stage.
// - Policy is scoped to the active scope only (project OR user, never both).
// - Any side effects implied by policy must be expressed as augmented plan operations,
//   so --preview remains dry-run.
type LockfilePolicy =
  | "materialize_if_missing" // Use for install/update operations: if lockfile is missing, fully reconcile active-scope declarations, resolve unresolved entries, then write lockfile.
  | "read_recover_if_missing" // Use for mutating operations that need accurate state (e.g. uninstall/remove): recover missing-lockfile state read-only for planning/decisioning, but do not auto-materialize full lockfile.
  | "ignore_if_missing"; // Use for operations that do not require lock state (e.g. list/read-only, enable/disable flows that can operate from settings/disk) and should not trigger reconciliation.

interface OperationMetadata {
  readonly name: string;
  readonly lockfilePolicy: LockfilePolicy;
}

interface OperationSpec<Op extends { readonly name: string }> {
  readonly metadata: OperationMetadata;
  readonly handler: (op: Op) => Effect.Effect<OperationResult, CliError>;
}
```

Co-located operation module example:

```ts
// packages/cli/src/extensions/skills/operations/install.ts
export const installSkillOperation = {
  metadata: {
    name: "install-skill",
    lockfilePolicy: "materialize_if_missing",
  },
  handler: installSkill,
} satisfies OperationSpec<InstallSkillOperation>;
```

Central aggregated registry example:

```ts
// packages/cli/src/workspace/operation-registry.ts
export const operationRegistry = {
  "install-skill": installSkillOperation,
  "uninstall-skill": uninstallSkillOperation,
  "install-command": installCommandOperation,
  "install-pack": installPackOperation,
  "install-mcp-server": installMcpServerOperation,
} as const;

export type RegisteredOperationName = keyof typeof operationRegistry;

export type RegisteredOperation =
  | InstallSkillOperation
  | UninstallSkillOperation
  | InstallCommandOperation
  | InstallPackOperation
  | InstallMcpServerOperation
  | ReadRecoverLockfileOperation
  | MaterializeLockfileOperation;
```

augmentPlan metadata lookup example:

```ts
const policy = operationRegistry[op.name].metadata.lockfilePolicy;
```

Default mapping by operation class:

- install/update: `materialize_if_missing`
- uninstall/remove: `read_recover_if_missing`
- enable/disable/list/read-only operations: `ignore_if_missing`

Policy aggregation for mixed-operation plans:

- Determine one effective policy per plan from input operations.
- Precedence: `materialize_if_missing` > `read_recover_if_missing` > `ignore_if_missing`.
- `augmentPlan` executes one reconciliation strategy per plan using the effective policy.

`resolvePlan` reads operation metadata during `augmentPlan` and injects reconciliation steps accordingly before apply.

Type model for augmentation:

- `resolvePlan` accepts `Plan<RegisteredOperation>`.
- `augmentPlan` may inject only operations from `RegisteredOperation`.
- Handler coverage remains compile-time exhaustive over `RegisteredOperation`.

`read_recover_if_missing` semantics:

- May read settings/lockfile/disk to synthesize an in-memory recovered state for planning.
- Must NOT install/resolve unresolved declarations.
- Must NOT write lockfile.
- Typical use: uninstall/remove operations needing accurate state when lockfile is missing/invalid.

Injected reconciliation failure behavior:

- Under `materialize_if_missing`, injected reconciliation steps run before user-requested steps.
- If any injected reconciliation step results in `error`, user-requested steps are not applied.
- Failures are surfaced in plan output as reconciliation errors.
- If reconciliation needs remote resolution and a required source is unreachable, the command fails (no best-effort partial apply), while preserving already reported reconstructed counts in diagnostics.

Lockfile read/parse failure handling:

- Treat `missing` and `invalid` lockfile states as distinct inputs to the same policy system.
- `invalid` means file exists but cannot be read/parsed/validated.
- For `materialize_if_missing`, both `missing` and `invalid` trigger reconciliation planning; `invalid` additionally emits a warning with parse details.
- For `read_recover_if_missing`, both `missing` and `invalid` trigger read-recovery planning (no full materialization).
- For `ignore_if_missing`, lockfile read/parse errors do not trigger reconciliation, but MUST emit a warning (`LOCKFILE_INVALID_IGNORED`) when state is `invalid`.
- Before writing a regenerated lockfile over an `invalid` one, move the existing file to a timestamped backup path (same directory) for debugging/rollback.

Lockfile state probe ownership:

- Add `Workspace.getLockfileState(): Effect<"ok" | "missing" | "invalid", CliError>`.
- `augmentPlan` MUST use `getLockfileState()` for policy decisions and not infer state from parsed lockfile content.

Policy x lockfile-state decision table:

| Policy                    | lockfile: ok    | lockfile: missing                  | lockfile: invalid                            |
| ------------------------- | --------------- | ---------------------------------- | -------------------------------------------- |
| `materialize_if_missing`  | no augmentation | augment with reconcile+materialize | augment with reconcile+materialize + warning |
| `read_recover_if_missing` | no augmentation | augment with read-recover          | augment with read-recover + warning          |
| `ignore_if_missing`       | no augmentation | no augmentation                    | no augmentation + `LOCKFILE_INVALID_IGNORED` |

Preview labeling for augmented operations:

- Mark injected steps as `[auto]`.
- Include reason where applicable: `missing`, `invalid`, or `declaration-mismatch`.
- Include one summary line of augmentation counts by extension type.

Recursion guard:

- `augmentPlan` tags injected operations with `origin: "augmentPlan"` metadata.
- Already-tagged operations are not re-augmented.
- `resolvePlan` performs one augmentation pass only.

Dedupe rules for injected operations:

- Dedupe key: `extensionType + namespace + name + declarationSourceOrConstraint`.
- Direct declaration and pack-derived declaration that resolve to the same key produce one injected install operation.
- Same `extensionType/namespace/name` with conflicting source/constraint emits a warning and picks deterministic winner by active settings declaration order.

Timestamp semantics:

- Reconstructed entries use recoverable on-disk timestamps when available.
- If unavailable, set `installedAt` and `updatedAt` to augmentation time (`now`).
- Re-resolved/reinstalled entries use installer-produced timestamps.

Non-install compatibility invariant:

- If effective plan policy is `ignore_if_missing`, `augmentPlan` is a no-op on operations and ordering.
- Add tests asserting non-install plans are unchanged by augmentation.

## Implementation Inventory

### 1) Architectural additions/modifications

- `resolvePlan` pipeline gains a read-only `augmentPlan` phase before preview/apply.
- Operation registry becomes the single typed source for both handler dispatch and lockfile-policy metadata.
- Operation metadata gains `lockfilePolicy` (operation-class driven behavior).
- Shared lockfile reconciliation engine is added behind `augmentPlan` for missing/invalid lockfile states.
- `augmentPlan(plan, context)` contract is added (pure, idempotent, single-pass).
- Reconciliation remains active-scope only and settings-authoritative.
- Atomic lockfile materialization is formalized as a first-class plan operation.
- Per-extension adapter contract added for reconstruction and unresolved classification:
  - enumerate declarations
  - validate declaration compatibility with disk materialization
  - reconstruct lock entries when compatible
  - classify unresolved reason (`missing`, `invalid`, `declaration-mismatch`)

### 2) Downstream changes required

- Update install plan builders to emit requested operations only; rely on `augmentPlan` for reconciliation injection.
- Update `resolvePlan` typings to accept `Plan<RegisteredOperation>` and enforce exhaustive handler coverage.
- Add/adjust operation definitions to include `lockfilePolicy` metadata.
- Add operation registry composition module(s) that co-locate metadata with handlers and aggregate centrally.
- Add reconciliation operations and handlers (read-recover/materialize lockfile) to the registry.
- Update lockfile read/write flows for invalid-file backup naming, failure handling, and atomic replace.
- Add adapter implementations for each extension type (skills, commands, packs, mcp servers).
- Update preview output to reflect augmented operations clearly (`[auto]`, counts + reasons by type).
- Update error taxonomy/messages for lockfile states (`missing`, `invalid`) and unresolved reasons.
- Add tests:
  - unit: `augmentPlan` policy behavior by operation class
  - unit: reconciliation adapter behavior per extension type
  - unit: invalid lockfile backup + atomic write behavior
  - integration: install handlers remain thin (`build -> resolve`) while augmented plans include reconciliation
  - e2e: missing/invalid lockfile + single install regenerates full active-scope snapshot

## Codebase De-risk Notes

- `resolvePlan` API change impact is broad: current code passes per-command handler maps at many callsites. Migration should be staged (compat shim or overloaded signature) to avoid a flag-day refactor.
- Current preview behavior allows apply in some branches (`--preview` + `--yes`); implementation must intentionally tighten this to strict dry-run.
- Global workspace init currently auto-creates missing lockfile (`ensureGlobalWorkspaceInitialized`). This can hide `missing` state before `augmentPlan` runs; reconciliation logic needs a pre-init lockfile-state probe or adjusted init behavior.
- `readLockfile` currently returns an empty lockfile when missing. `augmentPlan` needs an explicit lockfile state probe (`ok`/`missing`/`invalid`) instead of inferring from lockfile contents.
- Existing install handlers (`install-skill`, `install-command`, `install-mcp-server`, `install-pack`) write lockfile/settings directly and may swallow write failures as warnings. This conflicts with single final materialization semantics; reconciliation mode needs explicit write strategy (for example `skipLockfileWrite` in install ops, then one materialize step).
- Pack install resolution currently happens in pack handler before plan execution (dependency refs resolved there). Cross-extension augmentation for missing lockfile should avoid duplicating this logic; use shared resolver utilities for settings-declared refs.
- Disk detection parity is uneven: skills have on-disk discovery/classification helpers, while commands/mcp/packs rely more on lock/settings today. Per-type adapters must define canonical-path validation for non-skill types explicitly.
- Central operation registry in workspace layer can create import cycles because operation handlers already import `Workspace`. Use an injected registry layer/module boundary to avoid circular dependencies.
- If `resolvePlan` uses a global registry union, Effect requirement typing can balloon. Keep handler coverage exhaustive while avoiding forcing unrelated command environments (for example by resolving through registered handlers already provided by runtime layer).
- Reconciliation must dedupe across overlapping declarations (for example pack-managed dependencies also declared directly) to avoid duplicate install operations and conflicting readiness output.

## Risks / Trade-offs

- **[Type divergence]** -> enforce adapter interface + per-type tests to keep behavior aligned.
- **[Path ambiguity]** -> use existing canonical-path helpers; avoid ad-hoc directory scanning except where already defined.
- **[Invalid local metadata]** -> strict schema validation before reconstructing; invalid entries move to unresolved.
- **[Large workspace cost]** -> parallelize safe adapter operations with Effect concurrency.
- **[Unexpected cross-type prompts]** -> document full-reconciliation semantics and provide strict `--non-interactive` failure behavior.

## Migration Plan

1. Add `augmentPlan` stage to `resolvePlan` with pure/idempotent contract.
2. Add/extend operation registry so metadata + handlers are co-registered and typed as `RegisteredOperation`.
3. Add per-type adapters for skills, commands, packs, mcp servers.
4. Implement lockfile-policy logic + decision table behavior in `augmentPlan`.
5. Implement read-recover/materialize operations, recursion guard metadata, and preview `[auto]` labeling.
6. Add invalid-lockfile backup + atomic materialization behavior.
7. Add tests:
   - unit: adapter reconstruction success/failure per type
   - unit: unresolved fallback behavior per type
   - handler: each install command resolves requested plan, then `resolvePlan` augments correctly by policy
   - e2e: deleted lockfile + single install command regenerates full cross-extension snapshot
8. Run `pnpm lint` and targeted tests.

Rollback:

- Remove `augmentPlan` integration from `resolvePlan` and registry policy evaluation; revert to existing plan-as-authored execution path.

## Open Questions

- Should we expose a dedicated `axm lockfile rebuild` command later using the same shared orchestrator?
