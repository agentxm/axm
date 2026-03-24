## Context

The plan system (`workspace/plan.ts`) currently has no way to express pre-execution diagnostics on individual steps. A `PlannedJobStep` carries `expectedResult`, which conflates "what will happen" with "should this happen at all." No-op detection, error conditions, and execution gating are all encoded in a single `OperationResult`.

The skill uninstall plan builder is a pure function that checks lockfile presence. Pack-dependency validation currently happens at operation execution time (in `uninstall.ts`), where it silently degrades to a settings-only removal. The user gets no upfront feedback that a skill is pack-owned.

The `resolvePlan` flow is: display → confirm (if preview) → apply → display (if not preview). Neither display nor apply inspect step-level diagnostics because none exist.

## Goals / Non-Goals

**Goals:**

- Replace `expectedResult` on `PlannedJobStep` with a `readiness` property expressing step-level readiness
- Simplify `JobStepResult` to a single `result` property (drop `expectedResult`, rename `actualResult`)
- Display step readiness and messages in `displayPlan`
- Block plan execution in `resolvePlan` when any step has `error` readiness
- Require confirmation in `resolvePlan` when any step has `warn` readiness
- Use the new readiness mechanism in the skill uninstall plan builder to flag pack-dependent skills as errors with guidance to use `axm skills disable`

**Non-Goals:**

- Adding readiness logic to install plan builders (they can adopt it later — they just use `ready`/`skip` defaults)
- Modifying the operation-level `uninstallSkill` handler's pack-ownership check (it remains as a safety net)

## Decisions

### 1. Replace `expectedResult` with `readiness` on `PlannedJobStep`

Remove `expectedResult` from `PlannedJobStep`. Add a `readiness` property:

```typescript
type Readiness =
  | { readonly status: "ready"; readonly message: Option<string> }
  | { readonly status: "skip"; readonly message: string }
  | { readonly status: "warn"; readonly message: string }
  | { readonly status: "error"; readonly message: string };
```

Status meanings:

- **`ready`** — step will be executed. Optional message for informational notes.
- **`skip`** — step won't be executed (e.g., "already installed", "not installed"). Displayed as no-op.
- **`warn`** — step will be executed, but only after user confirms warnings.
- **`error`** — step cannot be executed. Blocks the entire plan.

This replaces `expectedResult` on `PlannedJobStep`. The plan builder no longer predicts outcomes — it assesses readiness.

**Rationale:** `expectedResult` conflated three concerns: display categorization, execution gating, and outcome prediction. `readiness` cleanly separates "should this run?" from "what happened?" (which is `result` on `JobStepResult`).

### 2. Simplify `JobStepResult` to a single `result`

Remove `expectedResult` and rename `actualResult` to `result`:

```typescript
interface JobStepResult<TOperation> {
  readonly _tag: "JobStepResult";
  readonly operation: TOperation;
  readonly result: OperationResult;
  readonly label: string;
}
```

Post-execution, there's only one truth: what actually happened. No need to carry the pre-execution prediction.

### 3. `displayPlan` renders readiness for planned steps, result for applied steps

The display logic branches on `_tag`:

- **`PlannedJobStep`**: render based on `readiness.status`
  - `ready` (no message): `+ label` via `log.success`
  - `ready` (with message): `+ label (message)` via `log.success`
  - `skip`: `- label (message)` via `log.warn`
  - `warn`: `⚠ label (message)` via `log.warn`
  - `error`: `✗ label (message)` via `log.error`

- **`JobStepResult`**: render based on `result.result` (unchanged from current `actualResult` rendering)
  - `success`: `✓ label` via `log.success`
  - `no-op`: `- label (message)` via `log.warn`
  - `error`: `✗ label (message)` via `log.error`

**Summary line** updated to reflect readiness counts:

- Pre-apply: `"X to apply, Y to skip, Z errors, W warnings"` (omit zero counts)
- Post-apply: `"X applied, Y skipped, Z failed"` (same as current but using `result`)

Note: current summary hardcodes "installed"/"to install" for all commands (even uninstall). Changing to generic "applied"/"to apply" is more accurate across all plan types.

### 4. `resolvePlan` gates on readiness

Before applying, `resolvePlan` scans all `PlannedJobStep` entries for readiness:

- **Any `error`**: Display the plan, then fail with `AppError`. The plan is not applied. The error message aggregates all error-readiness step messages.
- **Any `warn` (no errors)**: Display the plan and force a confirmation prompt. This applies regardless of `--preview`/`--yes` — warnings always require acknowledgment. In non-interactive mode without `--yes`, fail with `AppError`.
- **All `ready`/`skip`**: Current behavior unchanged.

When warnings or errors force the plan to be displayed in non-preview mode, this effectively opts the user into preview behavior for that invocation. The plan is shown before apply, and the post-apply display still happens after execution.

**`resolvePlan` pseudocode:**

```
resolvePlan(plan, handlers):
  allSteps = flatMap(plan.jobs, job => job.steps)
  plannedSteps = filter(allSteps, s => s._tag === "PlannedJobStep")
  hasErrors = any(plannedSteps, s => s.readiness.status === "error")
  hasWarnings = any(plannedSteps, s => s.readiness.status === "warn")

  if preview:
    log.info("Previewing changes...")
    displayPlan(plan)

    if hasErrors:
      fail AppError { code: "PLAN_HAS_ERRORS", ... }

    if yes:
      if hasWarnings:
        if nonInteractive:
          fail AppError { code: "PLAN_HAS_WARNINGS", ... }
        confirmed = confirm.prompt("Plan has warnings. Continue anyway?")
        if !confirmed: return empty plan
      log.info("Pre-approved via --yes, applying changes...")
      return applyPlan(plan, handlers)

    else if nonInteractive:
      log.warn("Cannot prompt in non-interactive mode...")
      return empty plan

    else:
      if hasWarnings:
        confirmed = confirm.prompt("Plan has warnings. Continue anyway?")
      else:
        confirmed = confirm.prompt("Apply changes?")
      if !confirmed: return empty plan
      return applyPlan(plan, handlers)

  else:  // no preview — apply first, display after
    if hasErrors:
      displayPlan(plan)
      fail AppError { code: "PLAN_HAS_ERRORS", ... }

    if hasWarnings:
      displayPlan(plan)
      if nonInteractive:
        fail AppError { code: "PLAN_HAS_WARNINGS", ... }
      confirmed = confirm.prompt("Plan has warnings. Continue anyway?")
      if !confirmed: return empty plan

    applied = applyPlan(plan, handlers)
    displayPlan(applied)
    return applied
```

Key behavioral changes:

- **Errors** — always display the plan, then fail. Never reach `applyPlan`.
- **Warnings without preview** — the plan is displayed before apply (opting into preview behavior), and confirmation is injected.
- **Warnings with `--yes`** — `--yes` skips normal confirmation but _not_ warning confirmation. In non-interactive mode (CI), warnings fail rather than silently proceeding.
- **All ready/skip, no preview** — unchanged (apply then display).

### 5. `applyPlan` dispatches based on readiness

`applyStep` changes from checking `expectedResult.result` to checking `readiness.status`:

- `ready` or `warn` → dispatch to handler, get `OperationResult`
- `skip` → promote to `{ result: "no-op", message: readiness.message }`
- `error` → promote to `{ result: "error", message: readiness.message }` (defensive — `resolvePlan` should have blocked)

### 6. Skill uninstall plan builder takes a pre-computed lookup

The plan builder should have zero knowledge of lockfiles, pack lock entries, or FQN derivation. The handler encapsulates all of that into a simple lookup.

**Lookup type** (co-located with plan builder in `cli-commands/skills/uninstall/plan.ts`):

```typescript
/** Keyed by skill name. Presence = installed. */
type InstalledSkills = ReadonlyRecord<
  string,
  {
    readonly referencingPacks: ReadonlyArray<string>;
  }
>;
```

**Simplified signature:**

```typescript
export const buildSkillUninstallPlan = (
  ops: ReadonlyArray<UninstallSkillOperation>,
  installed: InstalledSkills,
  name: string,
  description: Option<string>,
): Plan<UninstallSkillOperation>
```

**Plan builder logic per op:**

- Skill not in `installed` → `readiness: { status: "skip", message: "not installed" }`
- Skill in `installed`, `referencingPacks` is empty → `readiness: { status: "ready", message: Option.none() }`
- Skill in `installed`, `referencingPacks` is non-empty → `readiness: { status: "error", message: "required by pack <names>. Use 'axm skills disable <skill>' instead" }`

**Handler builds the lookup** by combining lockfile + pack data:

1. Load `lockedSkills` and `lockedPacks` from workspace
2. For each locked skill, derive FQN via `getSkillFqn`, find referencing packs via `getReferencingPacks`
3. Build `InstalledSkills` map keyed by skill name

**Rationale:** The plan builder stays pure and testable with trivial inputs — no need to construct lockfile or pack lock fixtures in tests. The FQN derivation and pack scanning complexity lives in the handler where the domain data originates.

### 7. Extract pack-reference helpers

Move `getSkillFqn` and `isReferencedByPack` from `extensions/skills/operations/uninstall.ts` to a shared location within the skills feature (e.g., `extensions/skills/utils.ts` or similar). Both the handler (for building the lookup) and the operation handler (defense-in-depth) need them. Add a `getReferencingPacks` variant that returns pack names instead of a boolean.

## Risks / Trade-offs

**All existing plan builders must be updated** → They need to replace `expectedResult` with `readiness` (mapping success → ready, no-op → skip). This is mechanical but touches multiple files and their tests. Mitigation: a single search-and-replace pass.

**`JobStepResult` loses `expectedResult`** → Any code comparing expected vs actual results loses that capability. Currently nothing uses this comparison, so the risk is low. If needed in the future, `readiness` can be preserved on the result type.

**`--yes` no longer bypasses warnings** → Warnings force confirmation even with `--yes`. This is intentional — warnings are advisory and the user should acknowledge them. However, this changes `--yes` semantics slightly. Mitigation: `--yes` still skips the _normal_ confirmation; it just doesn't skip the _warning_ confirmation. The warning prompt message will be distinct (e.g., "Plan has warnings. Continue anyway?").

**Operation-level pack check becomes redundant for uninstall** → The plan builder now catches pack dependencies upfront, but the operation handler still has its own check. This is acceptable as defense-in-depth. No removal needed.

## Change Audit

### Type definitions

| File                 | Change                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace/plan.ts`  | Add `Readiness` type; replace `expectedResult` with `readiness` on `PlannedJobStep`; remove `expectedResult` from `JobStepResult`, rename `actualResult` to `result` |
| `workspace/index.ts` | Re-export `Readiness` type from barrel                                                                                                                               |

### Plan infrastructure (display, apply, resolve)

| File                                   | Change                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace/display-plan.ts`            | Branch on `_tag`: render `readiness` for planned steps, `result` for applied steps. Update summary line with readiness counts.                                      |
| `workspace/apply-plan.ts`              | `applyStep` dispatches on `readiness.status` instead of `expectedResult.result`. Promote skip/error steps to `result`. Drop `expectedResult` from `promote` helper. |
| `workspace/service.ts` (`resolvePlan`) | Add readiness scanning + error/warn gates before `applyPlan`                                                                                                        |

### Plan builders (replace `expectedResult` with `readiness`)

| File                                    | Steps | Notes                                                  |
| --------------------------------------- | ----- | ------------------------------------------------------ |
| `cli-commands/skills/install/plan.ts`   | 2     | success→ready, no-op→skip                              |
| `cli-commands/skills/uninstall/plan.ts` | 2→3   | success→ready, no-op→skip, **new error for pack deps** |
| `cli-commands/skills/update/plan.ts`    | 2     | `buildInstallStep` + `buildUninstallStep` helpers      |
| `cli-commands/packs/install/plan.ts`    | 4     | pack ready/skip + skill ready/skip                     |
| `cli-commands/packs/uninstall/plan.ts`  | 3     | pack ready/skip + skill ready                          |
| `cli-commands/skills/plan-helpers.ts`   | 1     | `buildSingleStepPlan` (enable, disable, rename)        |

**Total: 14 existing constructions** migrated from `expectedResult` to `readiness`, plus 1 new error-readiness construction in the uninstall plan builder.

### Handlers

| File                                       | Change                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `cli-commands/skills/uninstall/handler.ts` | Build `InstalledSkills` lookup from lockedSkills + lockedPacks, pass to plan builder |
| `cli-commands/skills/install/handler.ts`   | No change                                                                            |
| `cli-commands/skills/update/handler.ts`    | No change                                                                            |
| `cli-commands/packs/install/handler.ts`    | No change                                                                            |
| `cli-commands/packs/uninstall/handler.ts`  | No change                                                                            |
| `cli-commands/skills/rename/handler.ts`    | No change (uses `plan-helpers.ts`)                                                   |

### Handler tests

| File                                            | Change                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `cli-commands/skills/uninstall/handler.test.ts` | Update plan builder call expectations (new `InstalledSkills` param); update result assertions (`actualResult` → `result`) |
| `cli-commands/skills/install/handler.test.ts`   | Update result assertions if tests inspect `expectedResult` or `actualResult`                                              |
| `cli-commands/skills/update/handler.test.ts`    | Update result assertions if tests inspect `expectedResult` or `actualResult`                                              |
| `cli-commands/packs/install/handler.test.ts`    | Update result assertions if tests inspect `expectedResult` or `actualResult`                                              |
| `cli-commands/packs/uninstall/handler.test.ts`  | Update result assertions if tests inspect `expectedResult` or `actualResult`                                              |

### Shared helpers

| File                                           | Change                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `extensions/skills/utils.ts` (new or existing) | Extract `getSkillFqn`, `isReferencedByPack`, add `getReferencingPacks` |
| `extensions/skills/operations/uninstall.ts`    | Import helpers from shared location instead of local definitions       |

### Test files

| File                                         | Change                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspace/display-plan.test.ts`             | Replace `expectedResult` with `readiness` in all fixtures; add test cases for skip/warn/error readiness display; update summary assertions       |
| `workspace/apply-plan.test.ts`               | Update `makeStep` helper: `expectedResult` → `readiness`; update promote assertions: `actualResult` → `result`; add skip/error readiness tests   |
| `workspace/service.test.ts`                  | Update `testStep`: `expectedResult` → `readiness`; add tests for error-blocks-execution and warn-requires-confirmation; update result assertions |
| `cli-commands/skills/install/plan.test.ts`   | Replace `expectedResult` assertions with `readiness` assertions                                                                                  |
| `cli-commands/skills/uninstall/plan.test.ts` | Replace `expectedResult` assertions with `readiness`; add pack-dependency error test cases                                                       |
| `cli-commands/skills/update/plan.test.ts`    | Replace `expectedResult` assertions with `readiness`                                                                                             |
| `cli-commands/packs/install/plan.test.ts`    | Replace `expectedResult` assertions with `readiness`                                                                                             |
| `cli-commands/packs/uninstall/plan.test.ts`  | Replace `expectedResult` assertions with `readiness`                                                                                             |
| `cli-commands/skills/plan-helpers.test.ts`   | Replace `expectedResult` assertion with `readiness`                                                                                              |

### E2E test files

| File                                                | Change                                                  |
| --------------------------------------------------- | ------------------------------------------------------- |
| `cli-commands/skills/uninstall/command.e2e.test.ts` | Update output assertions if plan display format changes |
| `cli-commands/skills/install/command.e2e.test.ts`   | Update output assertions if plan display format changes |
| `cli-commands/skills/update/command.e2e.test.ts`    | Update output assertions if plan display format changes |
| `cli-commands/packs/install/command.e2e.test.ts`    | Update output assertions if plan display format changes |
| `cli-commands/packs/uninstall/command.e2e.test.ts`  | Update output assertions if plan display format changes |
| `cli-commands/skills/enable/command.e2e.test.ts`    | Update output assertions if plan display format changes |
| `cli-commands/skills/disable/command.e2e.test.ts`   | Update output assertions if plan display format changes |
