## Context

CLI handlers (`install`, `uninstall`) currently use the legacy pipeline from `skills/state/`:

- `loadSkillsState` → `buildIdealFor*` → `computeDiff` → `applyDiff`
- Types: `SkillsState`, `IdealSkillsState`, `SkillsDiff`

The authoritative V2 pipeline exists in `workspace/`:

- `loadCurrentState` → `buildIdealState` → `buildPlan` → `applyPlan`
- Types: `CurrentState`, `IdealState`, `Plan`

The `buildPlan` function exists in `skills/state/pure-functions.ts` but uses local types (`CurrentStateNew`, `IdealStateNew`) that closely mirror the V2 types. This function is tested but not exported.

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

**Module dependencies after migration**:

- **Keep**: `pure-functions.ts` (has `computeInstallPath`, `buildPlan`), `types.ts` (V2 types)
- **Delete**: `apply.ts`, `load.ts`, `ideal.ts`, `diff.ts`

## Goals / Non-Goals

**Goals:**

- Migrate install/uninstall handlers to V2 pipeline
- Delete legacy modules: `apply.ts`, `load.ts`, `ideal.ts`, `diff.ts`
- Preserve `pure-functions.ts` and `types.ts` (used by V2 pipeline)
- All existing E2E tests pass unchanged

**Non-Goals:**

- Changing user-facing behavior (internal refactor only)
- Migrating `skills-update` command (keep using legacy if needed, or migrate opportunistically)
- Creating a workspace module barrel file
- Refactoring type naming conventions

## Decisions

### Decision 1: Wire buildPlan through workspace module

**Approach**: Export `buildPlan` from `pure-functions.ts` via `skills/state/index.ts`, then re-export from workspace.

**Alternative considered**: Move `buildPlan` to workspace module. Rejected because it's a pure function that belongs with the type definitions, and moving would require updating test imports.

### Decision 2: Adapt handler types at call site

The V2 types (`CurrentState`, `IdealState`) and pure-functions types (`CurrentStateNew`, `IdealStateNew`) are structurally compatible but not identical.

**Approach**: Create thin adapter functions in handlers that map between types. These are temporary until types are unified.

**Key type mappings:**
| Legacy | V2 | Notes |
|--------|-----|-------|
| `SkillsState` | `CurrentState` | Different field structure |
| `IdealSkillsState` | `IdealState` | Array vs Record |
| `SkillsDiff` | `Plan` | Entirely different shape |
| `diff.summary.add` | `plan.steps.filter(...)` | Summary computed from steps |

**Alternative considered**: Unify all type aliases in `types.ts`. Rejected as scope creep - type cleanup is a separate concern.

### Decision 5: Create workspace barrel file

The workspace module has no `index.ts`. Create one for clean handler imports.

**Exports**: `WorkspaceContext`, `loadCurrentState`, `buildIdealState`, `applyPlan`, `displayPlan`, `buildPlanFromState`, `planToJson`, `getPlanSummary`

### Decision 6: Add JSON output support to V2 pipeline

Handlers use `--json` flag with `skillsDiffToJson()`. V2 pipeline needs equivalent.

**New functions:**

- `planToJson(plan: Plan): PlanJson` - serialize plan for JSON output
- `getPlanSummary(plan: Plan): PlanSummary` - expose install/update/uninstall counts

`formatSummary` in apply.ts already computes counts internally - extract and export.

### Decision 3: Sequential handler migration

Migrate install handler first, verify E2E, then uninstall. This isolates failures.

**Alternative considered**: Parallel migration. Rejected because handlers share testing infrastructure and simultaneous changes complicate debugging.

### Decision 4: Keep partial uninstall bypass

The uninstall handler has a special path for removing skills from specific agents without full uninstall. This uses `applyDiff` internally.

**Approach**: Refactor partial uninstall to construct a `Plan` with targeted steps and use `applyPlan`.

## Risks / Trade-offs

**Risk**: Type adapter complexity could introduce subtle bugs
→ Mitigation: E2E tests provide behavioral verification; add integration tests for adapters

**Risk**: Handler tests coupled to legacy mock structure may break
→ Mitigation: Update mocks incrementally; handler tests are primarily about orchestration, not apply logic

**Risk**: Partial uninstall refactor is more complex than anticipated
→ Mitigation: If blocked, keep partial uninstall on legacy apply temporarily (partial migration)

## Migration Plan

1. Export `buildPlan` from `skills/state/index.ts`
2. Create workspace adapter: `buildPlanFromState(current: CurrentState, ideal: IdealState): Plan`
3. Migrate install handler
4. Run E2E: `pnpm test:e2e -- --grep install`
5. Migrate uninstall handler (including partial uninstall)
6. Run E2E: `pnpm test:e2e -- --grep uninstall`
7. Delete legacy modules
8. Update index exports
9. Full verification: `pnpm test && pnpm test:e2e`
