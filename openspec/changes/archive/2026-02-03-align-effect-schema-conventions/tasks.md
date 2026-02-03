## 1. Schema Definition Files - common.ts

- [x] 1.1 Update tests in `common.test.ts` to use new schema names (`AuthorSchema`, etc.)
- [x] 1.2 Rename schema constants in `common.ts`: `Author` → `AuthorSchema`, `FullyQualifiedName` → `FullyQualifiedNameSchema`, `ExtensionType` → `ExtensionTypeSchema`, `SourceType` → `SourceTypeSchema`, `AgentId` → `AgentIdSchema`
- [x] 1.3 Update type derivations to reference new schema names
- [x] 1.4 Run `pnpm typecheck && pnpm test packages/core/src/experimental/schemas/common.test.ts`
- [x] 1.5 Kill any runaway vitest worker processes

## 2. Schema Definition Files - settings.ts

- [x] 2.1 Update tests in `settings.test.ts` to use new schema names
- [x] 2.2 Rename schema constants in `settings.ts`: `UrlSource` → `UrlSourceSchema`, `PathSource` → `PathSourceSchema`, `RegistrySource` → `RegistrySourceSchema`, `EmptySource` → `EmptySourceSchema`, `SourcesConfig` → `SourcesConfigSchema`, `ExtensionMap` → `ExtensionMapSchema`, `Settings` → `SettingsSchema`
- [x] 2.3 Update type derivations to reference new schema names
- [x] 2.4 Run `pnpm typecheck && pnpm test packages/core/src/experimental/schemas/settings.test.ts`
- [x] 2.5 Kill any runaway vitest worker processes

## 3. Schema Definition Files - lockfile.ts

- [x] 3.1 Update tests in `lockfile.test.ts` to use new schema names
- [x] 3.2 Rename schema constants in `lockfile.ts`: `LockEntry` → `LockEntrySchema`, `ExtensionLockMap` → `ExtensionLockMapSchema`, `ExtensionsByType` → `ExtensionsByTypeSchema`, `Lockfile` → `LockfileSchema`
- [x] 3.3 Update type derivations to reference new schema names
- [x] 3.4 Run `pnpm typecheck && pnpm test packages/core/src/experimental/schemas/lockfile.test.ts`
- [x] 3.5 Kill any runaway vitest worker processes

## 4. Schema Definition Files - manifest-\*.ts

- [x] 4.1 Update tests in `manifest.test.ts` to use new schema names
- [x] 4.2 Rename schema constants: `SkillManifest` → `SkillManifestSchema`, `CommandManifest` → `CommandManifestSchema`, `PackManifest` → `PackManifestSchema`, `McpServerManifest` → `McpServerManifestSchema`
- [x] 4.3 Update type derivations to reference new schema names
- [x] 4.4 Run `pnpm typecheck && pnpm test packages/core/src/experimental/schemas/manifest.test.ts`
- [x] 4.5 Kill any runaway vitest worker processes

## 5. Barrel File - schemas/index.ts

- [x] 5.1 Update exports to use new schema names (`AuthorSchema`, `SettingsSchema`, etc.)
- [x] 5.2 Remove workaround type aliases (`AuthorType`, `AgentIdType`, etc.)
- [x] 5.3 Run `pnpm typecheck`

## 6. Consumer Files

- [x] 6.1 Update `skills/settings.ts` - remove alias workaround, import `SettingsSchema` directly
- [x] 6.2 Update `skills/types.ts` - update Settings re-export if needed
- [x] 6.3 Update `skills/index.ts` - update re-exports if needed
- [x] 6.4 Update `scripts/generate-schemas.ts` - use new schema names for JSON Schema generation
- [x] 6.5 Run `pnpm typecheck && pnpm test`
- [x] 6.6 Kill any runaway vitest worker processes

## 7. Final Verification

- [x] 7.1 Run `pnpm build` to ensure build succeeds
- [x] 7.2 Run `pnpm typecheck` for full type check
- [x] 7.3 Run `pnpm test` for full test suite
- [x] 7.4 Run `pnpm lint` to check for any lint issues
- [x] 7.5 Kill any runaway vitest worker processes
