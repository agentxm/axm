## 1. Create lockfile folder

- [x] 1.1 Create `cli/src/lockfile/` folder
- [x] 1.2 Move `schemas/lockfile.ts` to `lockfile/schema.ts`
- [x] 1.3 Move `schemas/lockfile.test.ts` to `lockfile/schema.test.ts`
- [x] 1.4 Update imports in files that reference lockfile schema
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint:fix` and fix any errors
- [x] 1.7 Run `pnpm test` and fix any failures
- [x] 1.8 Kill any vitest worker processes

## 2. Create settings folder

- [x] 2.1 Create `cli/src/settings/` folder
- [x] 2.2 Move `schemas/settings.ts` to `settings/schema.ts`
- [x] 2.3 Move `schemas/settings.test.ts` to `settings/schema.test.ts`
- [x] 2.4 Update imports in files that reference settings schema
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint:fix` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Create extensions folder structure

- [x] 3.1 Create `cli/src/extensions/` folder
- [x] 3.2 Move `schemas/common.ts` to `extensions/common.ts`
- [x] 3.3 Move `schemas/common.test.ts` to `extensions/common.test.ts`
- [x] 3.4 Move `schemas/extension-sources.ts` to `extensions/sources.ts`
- [x] 3.5 Move `schemas/extension-sources.test.ts` to `extensions/sources.test.ts`
- [x] 3.6 Update imports in files that reference common and extension-sources
- [x] 3.7 Run `pnpm typecheck` and fix any errors
- [x] 3.8 Run `pnpm lint:fix` and fix any errors
- [x] 3.9 Run `pnpm test` and fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. Move skills into extensions

- [x] 4.1 Move `cli/src/skills/` folder to `cli/src/extensions/skills/`
- [x] 4.2 Move `schemas/manifest-skill.ts` to `extensions/skills/manifest-schema.ts`
- [x] 4.3 Move `schemas/manifest.test.ts` to `extensions/skills/manifest-schema.test.ts` (skill-related tests only)
- [x] 4.4 Update imports in files that reference skills folder or manifest-skill
- [x] 4.5 Run `pnpm typecheck` and fix any errors
- [x] 4.6 Run `pnpm lint:fix` and fix any errors
- [x] 4.7 Run `pnpm test` and fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Create other extension type folders

- [x] 5.1 Create `extensions/commands/` folder with `manifest-schema.ts` (move from schemas/manifest-command.ts)
- [x] 5.2 Create `extensions/mcp-servers/` folder with `manifest-schema.ts` (move from schemas/manifest-mcp-server.ts)
- [x] 5.3 Create `extensions/packs/` folder with `manifest-schema.ts` (move from schemas/manifest-pack.ts)
- [x] 5.4 Update imports in files that reference manifest-command, manifest-mcp-server, manifest-pack
- [x] 5.5 Run `pnpm typecheck` and fix any errors
- [x] 5.6 Run `pnpm lint:fix` and fix any errors
- [x] 5.7 Run `pnpm test` and fix any failures
- [x] 5.8 Kill any vitest worker processes

## 6. Update JSON schema generation

- [x] 6.1 Move `core/scripts/generate-schemas.ts` to `cli/scripts/generate-schemas.ts`
- [x] 6.2 Update script imports to reference new schema locations
- [x] 6.3 Update script to output each JSON schema to `__generated__/` folder next to its source:
  - `lockfile/__generated__/axm-lock.schema.json`
  - `settings/__generated__/settings.schema.json`
  - `extensions/skills/__generated__/axm-skill.schema.json`
  - `extensions/commands/__generated__/axm-command.schema.json`
  - `extensions/mcp-servers/__generated__/axm-mcp-server.schema.json`
  - `extensions/packs/__generated__/axm-pack.schema.json`
- [x] 6.4 Update `cli/package.json` to add `generate:schemas` script
- [x] 6.5 Remove `generate:schemas` script from `core/package.json`
- [x] 6.6 Run generation script and verify JSON schemas are created in correct locations
- [x] 6.7 Run `pnpm typecheck` and fix any errors
- [x] 6.8 Run `pnpm lint:fix` and fix any errors
- [x] 6.9 Run `pnpm test` and fix any failures
- [x] 6.10 Kill any vitest worker processes

## 7. Remove schemas folder

- [x] 7.1 Delete `schemas/index.ts`
- [x] 7.2 Delete old `schemas/__generated__/` folder
- [x] 7.3 Remove `cli/src/schemas/` folder (should be empty)
- [x] 7.4 Run `pnpm typecheck` and fix any errors
- [x] 7.5 Run `pnpm lint:fix` and fix any errors
- [x] 7.6 Run `pnpm test` and fix any failures
- [x] 7.7 Run `pnpm test:e2e` and fix any failures
- [x] 7.8 Kill any vitest worker processes
