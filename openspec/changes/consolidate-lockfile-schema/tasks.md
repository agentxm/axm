## 1. Schema Updates (schemas/lockfile.ts)

- [ ] 1.1 Add RegistryLocationSchema (Remote | FileSystem discriminated union)
- [ ] 1.2 Update SkillSourceSchema: keep Local, GitHub, Git; remove WellKnown; update Registry to include location and scope
- [ ] 1.3 Update SkillLockEntrySchema: add name field, change agents to regular array, add DateFromString transforms for installedAt/updatedAt
- [ ] 1.4 Remove all deprecated exports from schemas/lockfile.ts
- [ ] 1.5 Typecheck verification
- [ ] 1.6 Lint verification
- [ ] 1.7 Test verification
- [ ] 1.8 Kill runaway vitest workers

## 2. Lockfile I/O Updates (skills/lockfile.ts)

- [ ] 2.1 Update tests for skills/lockfile.ts to use new schema types (red phase)
- [ ] 2.2 Rewrite skills/lockfile.ts to use LockfileSchema from schemas/lockfile.ts
- [ ] 2.3 Remove internal LockEntrySchema and LockfileSchemaLegacy
- [ ] 2.4 Update decodeLockfile to use typed LockfileParseError instead of silent fallback
- [ ] 2.5 Typecheck verification
- [ ] 2.6 Lint verification
- [ ] 2.7 Test verification
- [ ] 2.8 Kill runaway vitest workers

## 3. Remove Duplicate Types (skills/types.ts)

- [ ] 3.1 Remove LockEntry, Lockfile, LockfileExtensions from skills/types.ts
- [ ] 3.2 Update any imports in skills/types.ts consumers
- [ ] 3.3 Typecheck verification
- [ ] 3.4 Lint verification
- [ ] 3.5 Test verification
- [ ] 3.6 Kill runaway vitest workers

## 4. Remove Duplicate Types (skills/state/types.ts)

- [ ] 4.1 Remove SkillSource, SkillSourceV2, LockedSkill, LockedSkillV2 from skills/state/types.ts
- [ ] 4.2 Remove related schemas (SkillSourceSchema, LockedSkillSchema variants)
- [ ] 4.3 Update imports to use schemas/lockfile.ts
- [ ] 4.4 Typecheck verification
- [ ] 4.5 Lint verification
- [ ] 4.6 Test verification
- [ ] 4.7 Kill runaway vitest workers

## 5. Remove Duplicate Types (skills/state/pure-functions.ts)

- [ ] 5.1 Remove local SkillSource and LockedSkillNew type definitions
- [ ] 5.2 Update to use canonical types from schemas/lockfile.ts
- [ ] 5.3 Typecheck verification
- [ ] 5.4 Lint verification
- [ ] 5.5 Test verification
- [ ] 5.6 Kill runaway vitest workers

## 6. Update Consumers

- [ ] 6.1 Update skills/state/load.ts imports and type usage
- [ ] 6.2 Update skills/state/apply.ts imports and conversion functions
- [ ] 6.3 Update skills/state/ideal.ts imports
- [ ] 6.4 Update workspace/load-state.ts imports
- [ ] 6.5 Update cli/commands/skills/install/handler.ts imports
- [ ] 6.6 Typecheck verification
- [ ] 6.7 Lint verification
- [ ] 6.8 Test verification
- [ ] 6.9 Kill runaway vitest workers

## 7. Test Updates

- [ ] 7.1 Update skills/lockfile.test.ts to use new types
- [ ] 7.2 Update skills/state/load.test.ts to use new types
- [ ] 7.3 Update skills/state/apply.test.ts to use new types
- [ ] 7.4 Update schemas/lockfile.test.ts to cover new schema variants
- [ ] 7.5 Typecheck verification
- [ ] 7.6 Lint verification
- [ ] 7.7 Test verification
- [ ] 7.8 Kill runaway vitest workers

## 8. Final Verification

- [ ] 8.1 Run full test suite (pnpm test)
- [ ] 8.2 Run E2E tests (pnpm test:e2e)
- [ ] 8.3 Verify no remaining references to removed types (grep for V2, Legacy, WellKnown)
- [ ] 8.4 Kill runaway vitest workers
