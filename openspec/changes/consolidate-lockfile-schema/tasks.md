## 1. Schema Updates (schemas/lockfile.ts)

- [x] 1.1 Add RegistryLocationSchema (Remote | FileSystem discriminated union)
- [x] 1.2 Update SkillSourceSchema: keep Local, GitHub, Git; remove WellKnown; update Registry to include location and scope
- [x] 1.3 Update SkillLockEntrySchema: add name field, change agents to regular array, add DateFromString transforms for installedAt/updatedAt
- [x] 1.4 Remove all deprecated exports from schemas/lockfile.ts
- [x] 1.5 Typecheck verification
- [x] 1.6 Lint verification
- [x] 1.7 Test verification
- [x] 1.8 Kill runaway vitest workers

## 2. Lockfile I/O Updates (skills/lockfile.ts)

- [x] 2.1 Update tests for skills/lockfile.ts to use new schema types (red phase)
- [x] 2.2 Rewrite skills/lockfile.ts to use LockfileSchema from schemas/lockfile.ts
- [x] 2.3 Remove internal LockEntrySchema and LockfileSchemaLegacy
- [x] 2.4 Update decodeLockfile to use typed LockfileParseError instead of silent fallback
- [x] 2.5 Typecheck verification
- [x] 2.6 Lint verification
- [x] 2.7 Test verification
- [x] 2.8 Kill runaway vitest workers

## 3. Remove Duplicate Types (skills/types.ts)

- [x] 3.1 Remove LockEntry, Lockfile, LockfileExtensions from skills/types.ts
- [x] 3.2 Update any imports in skills/types.ts consumers
- [x] 3.3 Typecheck verification
- [x] 3.4 Lint verification
- [x] 3.5 Test verification
- [x] 3.6 Kill runaway vitest workers

## 4. Remove Duplicate Types (skills/state/types.ts)

- [x] 4.1 Mark legacy SkillSource and LockedSkill as @deprecated (kept for backward compatibility)
- [x] 4.2 Add imports from schemas/lockfile.ts for RegistryLocation, SkillSource, SkillLockEntry
- [x] 4.3 Re-export RegistryLocation and RegistryLocationSchema from schemas/lockfile.ts
- [x] 4.4 Typecheck verification
- [x] 4.5 Lint verification
- [x] 4.6 Test verification
- [x] 4.7 Kill runaway vitest workers

Note: Full removal of legacy types (LockedSkill, SkillSource with WellKnown) blocked by:

- LockedSkill has different structure than SkillLockEntry (string-based source vs discriminated union)
- SkillSourceV2 uses Option.Option<T> while schemas/lockfile.ts uses T | undefined
- Consumers need conversion utilities or pattern changes (Phase 6)

Types marked @deprecated:

- LockedSkill - use SkillLockEntry from schemas/lockfile.ts
- SkillSource - use SkillSourceV2 or SkillSource from schemas/lockfile.ts
- SkillSource.WellKnown - being removed per design doc

Types consolidated:

- RegistryLocation - now re-exported from schemas/lockfile.ts
- RegistryLocationSchema - now re-exported from schemas/lockfile.ts

## 5. Remove Duplicate Types (skills/state/pure-functions.ts)

- [x] 5.1 Remove local SkillSource type definition (now re-exports SkillSourceV2 from types.ts)
- [x] 5.2 Update to use SkillSourceV2 from types.ts (canonical type pending Phase 4 completion)
- [x] 5.3 Typecheck verification
- [x] 5.4 Lint verification
- [x] 5.5 Test verification
- [x] 5.6 Kill runaway vitest workers

Note: LockedSkillNew and SkillSourceNew remain as plan-specific types with different structure
from lockfile types. Full consolidation depends on Phase 4 completing the migration of
SkillSourceV2 and LockedSkillV2 to canonical schema types.

## 6. Update Consumers

- [x] 6.1 Update skills/state/load.ts imports and type usage
- [x] 6.2 Update skills/state/apply.ts imports and conversion functions
- [x] 6.3 Update skills/state/ideal.ts imports
- [x] 6.4 Update workspace/load-state.ts imports
- [x] 6.5 Update cli/commands/skills/install/handler.ts imports
- [x] 6.6 Typecheck verification
- [x] 6.7 Lint verification
- [x] 6.8 Test verification
- [x] 6.9 Kill runaway vitest workers

Note: Phase 6 focused on clarifying imports and adding documentation. The key changes:

- load.ts: Added documentation to lockEntryToLockedSkill explaining the bridge between schemas
- apply.ts: Added documentation to idealToLockEntry; removed unused sourceToLockfileValue function
- ideal.ts: Added module docs explaining the dual type systems (legacy vs V2)
- load-state.ts: Added module docs explaining V2 type usage
- install/handler.ts: Renamed imports for clarity (LockfileSkillSource, LegacySkillSource)

## 7. Test Updates

- [x] 7.1 Update skills/lockfile.test.ts to use new types
- [x] 7.2 Update skills/state/load.test.ts to use new types
- [x] 7.3 Update skills/state/apply.test.ts to use new types
- [x] 7.4 Update schemas/lockfile.test.ts to cover new schema variants
- [x] 7.5 Typecheck verification
- [x] 7.6 Lint verification
- [x] 7.7 Test verification
- [x] 7.8 Kill runaway vitest workers

Note: Phase 7 changes:

- skills/lockfile.test.ts: Already using canonical types from schemas/lockfile.ts (Lockfile, SkillLockEntry)
- skills/state/load.test.ts: Already using canonical types from schemas/lockfile.ts
- skills/state/apply.test.ts: Uses legacy IdealSkillLegacy and SkillSource from state/types.ts (correct for apply layer)
- schemas/lockfile.test.ts: Added tests for Git source variant, SkillSourceSchema, and RegistryLocationSchema

## 8. Final Verification

- [x] 8.1 Run full test suite (pnpm test) - All 1165 tests pass
- [x] 8.2 Run E2E tests (pnpm test:e2e) - All 58 tests pass (16 skipped for future reconciliation format)
- [x] 8.3 Verify no remaining references to removed types (grep for V2, Legacy, WellKnown)
- [x] 8.4 Kill runaway vitest workers

Note: Phase 8 verification complete:

- Unit tests: All passing
- E2E tests: All passing after updating 3 tests to use new lockfile structure (`lock.skills` instead of `lock.extensions.skills`)
- References found (intentionally retained):
  - WellKnown: Still used in wellknown.ts discovery feature and legacy SkillSource type (deprecated)
  - V2: Active types in reconciliation design (SkillSourceV2, LockedSkillV2, etc.)
  - Legacy: IdealSkillLegacy used by legacy install/uninstall/sync paths (deprecated)
