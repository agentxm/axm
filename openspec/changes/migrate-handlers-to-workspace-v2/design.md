## Context

CLI handlers (`install`, `uninstall`) currently use the legacy pipeline from `skills/state/`:

- `loadSkillsState` → `buildIdealFor*` → `computeDiff` → `applyDiff`
- Types: `SkillsState`, `IdealSkillsState`, `SkillsDiff`

The authoritative V2 pipeline exists in `workspace/`:

- `loadCurrentState` → `buildIdealState` → `buildPlan` → `applyPlan`
- Types: `CurrentState`, `IdealState`, `Plan`

The `buildPlan` function exists in `skills/state/pure-functions.ts` but uses incomplete placeholder types (`CurrentStateNew`, `IdealStateNew`) that were never integrated with the V2 pipeline. This function is tested but not used in production.

### Code Audit Findings

**Dead code in skills/state/ideal.ts** (only have tests, never called from CLI):

- `buildIdealForSync()` - repair drift between actual and locked
- `buildIdealForUpdate()` - V2 version exists in workspace
- `buildIdealForUninstallV2()` - V2 replacement exists

**Duplicated functions** (workspace has V2 versions):
| Legacy (skills/state/ideal.ts) | V2 (workspace/ideal-state.ts) |
|-------------------------------|-------------------------------|
| `buildIdealForInstall` | `buildIdealForInstall` |
| `buildIdealForUninstall` | `buildIdealForUninstall` |
| `buildIdealForUpdate` | `buildIdealForUpdate` |

**Anti-pattern in uninstall handler** (`handler.ts:362-364`):

```typescript
const { readLockfile, updateLockEntry } =
  yield *
  Effect.promise(async () => import("@agentxm/core/experimental/skills"));
```

Dynamic import should be replaced with static imports.

**WellKnown source handling** - NOT a migration blocker:

- WellKnown is a _discovery_ mechanism (RFC 8615), not a storage format
- When stored in lockfile, WellKnown sources are converted to Git sources (`skills/state/apply.ts:244-253`)
- V2 type system correctly omits WellKnown variant

**Incomplete placeholder types in pure-functions.ts**:

The `*New` types in `pure-functions.ts` are incomplete duplicates of the V2 types in `types.ts`:

| pure-functions.ts                       | types.ts                                     | Issue                            |
| --------------------------------------- | -------------------------------------------- | -------------------------------- |
| `SkillStateNew.locked: Option<unknown>` | `SkillStateV2.locked: Option<LockedSkillV2>` | `unknown` placeholder            |
| `SkillSourceNew.Registry`               | `SkillSourceV2.Registry`                     | Missing `location`, `scope`      |
| `IdealSkillNew`                         | `IdealSkillV2`                               | Uses incomplete `SkillSourceNew` |

These types were created before V2 types were finalized and never updated. The `buildPlan` function uses them but is not imported anywhere in production code.

**Module dependencies after migration**:

- **Keep**: `pure-functions.ts` (utilities only: `computeInstallPath`, `versionsEqual`), `types.ts` (V2 types)
- **Delete**: `apply.ts`, `load.ts`, `ideal.ts`, `diff.ts`
- **Move to workspace**: `buildPlan` (rewritten to use V2 types)
- **Delete from pure-functions.ts**: `*New` types, old `buildPlan`, `toSettingsEntry`, `collectIssues`

## Goals / Non-Goals

**Goals:**

- Migrate install/uninstall handlers to V2 pipeline
- Delete legacy modules: `apply.ts`, `load.ts`, `ideal.ts`, `diff.ts`
- Preserve `pure-functions.ts` and `types.ts` (used by V2 pipeline)
- All existing E2E tests pass unchanged

**Non-Goals:**

- Changing user-facing behavior (internal refactor only)
- Migrating `skills-update` command (keep using legacy if needed, or migrate opportunistically)

## Decisions

### Decision 1: Move buildPlan to workspace, use V2 types directly

**Approach**: Rewrite `buildPlan` in `workspace/plan.ts` using the V2 types (`CurrentState`, `IdealState`) from `types.ts`. Delete the incomplete `*New` types from `pure-functions.ts`.

**Rationale**:

- The `*New` types in `pure-functions.ts` are incomplete placeholders (e.g., `locked: Option<unknown>`)
- The V2 types in `types.ts` are complete and already used throughout `workspace/`
- Creating adapters between incomplete and complete types adds complexity for no benefit
- `buildPlan` logically belongs in `workspace/` alongside `buildIdealState` and `applyPlan`

**Alternative rejected**: Wire `buildPlan` through adapters. This perpetuates legacy patterns and adds unnecessary complexity.

### Decision 2: Clean up pure-functions.ts

**Keep** (genuine utilities):

- `computeInstallPath` - used by `workspace/apply.ts`
- `versionsEqual` - semver-aware comparison (will be used by new `buildPlan` in workspace)

**Delete** (dead code):

- `toSettingsEntry` - never imported; `workspace/apply.ts` has its own `sourceV2ToSettingsValue`
- `collectIssues` - only has tests, never imported in production
- `SkillSettingsEntry` type - only used by `toSettingsEntry`

**Delete** (incomplete placeholders):

- `CurrentStateNew`, `SkillStateNew`, `ActualSkillNew`
- `IdealStateNew`, `IdealSkillNew`, `LockedSkillNew`
- `SkillSourceNew`, `PlanStep`, `Plan` (duplicates of types.ts)
- `buildPlan` (replaced by workspace version)

### Decision 3: Create workspace barrel file

The workspace module has no `index.ts`. Create one for clean handler imports.

**Exports**: `WorkspaceContext`, `loadCurrentState`, `buildIdealState`, `buildPlan`, `planHasChanges`, `applyPlan`, `displayPlan`, `planToJson`, `getPlanSummary`

### Decision 4: Add plan utilities to V2 pipeline

Handlers use `--json` flag with `skillsDiffToJson()` and `hasChanges()`. V2 pipeline needs equivalents.

**New functions in `workspace/plan.ts`:**

- `planToJson(plan: Plan): PlanJson` - serialize plan for JSON output
- `getPlanSummary(plan: Plan): PlanSummary` - expose install/update/uninstall counts
- `planHasChanges(plan: Plan): boolean` - check if plan has steps (replaces `hasChanges`)

`formatSummary` in apply.ts already computes counts internally - extract and export.

**Handler import mapping:**

| Legacy (`skills/state`)  | V2 (`workspace`)         |
| ------------------------ | ------------------------ |
| `loadSkillsState`        | `loadCurrentState`       |
| `buildIdealForInstall`   | `buildIdealForInstall`   |
| `buildIdealForUninstall` | `buildIdealForUninstall` |
| `computeDiff`            | `buildPlan`              |
| `hasChanges`             | `planHasChanges`         |
| `applyDiff`              | `applyPlan`              |
| `skillsDiffToJson`       | `planToJson`             |

### Decision 5: Sequential handler migration

Migrate install handler first, verify E2E, then uninstall. This isolates failures.

**Alternative considered**: Parallel migration. Rejected because handlers share testing infrastructure and simultaneous changes complicate debugging.

### Decision 6: Keep partial uninstall bypass

The uninstall handler has a special path for removing skills from specific agents without full uninstall. This currently uses `applyDiff` internally.

**Approach**: Refactor partial uninstall to construct a `Plan` with targeted steps and use `applyPlan`.

## Risks / Trade-offs

**Risk**: Rewriting `buildPlan` may introduce behavioral differences
→ Mitigation: Port existing `pure-functions.test.ts` tests to workspace; E2E tests verify end-to-end behavior

**Risk**: Handler tests coupled to legacy mock structure may break
→ Mitigation: Update mocks incrementally; handler tests are primarily about orchestration, not apply logic

**Risk**: Partial uninstall refactor is more complex than anticipated
→ Mitigation: If blocked, keep partial uninstall on legacy apply temporarily (partial migration)

## Migration Plan

1. Create `workspace/plan.ts` with `buildPlan` using V2 types
2. Port `buildPlan` tests from `pure-functions.test.ts` to `workspace/plan.test.ts`
3. Add `planToJson`, `getPlanSummary`, and `planHasChanges` to `workspace/plan.ts`
4. Create workspace barrel file (`workspace/index.ts`)
5. Migrate install handler to V2 pipeline
6. Run E2E: `pnpm test:e2e -- --grep install`
7. Migrate uninstall handler (including partial uninstall)
8. Run E2E: `pnpm test:e2e -- --grep uninstall`
9. Delete from `pure-functions.ts`: `*New` types, old `buildPlan`, `toSettingsEntry`, `collectIssues`
10. Delete legacy modules: `apply.ts`, `load.ts`, `ideal.ts`, `diff.ts`
11. Update index exports
12. Full verification: `pnpm test && pnpm test:e2e`
