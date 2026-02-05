## 1. Create lockfile folder

- [ ] 1.1 Create `cli/src/lockfile/` folder
- [ ] 1.2 Move `schemas/lockfile.ts` to `lockfile/schema.ts`
- [ ] 1.3 Move `schemas/lockfile.test.ts` to `lockfile/schema.test.ts`
- [ ] 1.4 Update imports in files that reference lockfile schema
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint:fix` and fix any errors
- [ ] 1.7 Run `pnpm test` and fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Create settings folder

- [ ] 2.1 Create `cli/src/settings/` folder
- [ ] 2.2 Move `schemas/settings.ts` to `settings/schema.ts`
- [ ] 2.3 Move `schemas/settings.test.ts` to `settings/schema.test.ts`
- [ ] 2.4 Update imports in files that reference settings schema
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm lint:fix` and fix any errors
- [ ] 2.7 Run `pnpm test` and fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Create extensions folder structure

- [ ] 3.1 Create `cli/src/extensions/` folder
- [ ] 3.2 Move `schemas/common.ts` to `extensions/common.ts`
- [ ] 3.3 Move `schemas/common.test.ts` to `extensions/common.test.ts`
- [ ] 3.4 Move `schemas/extension-sources.ts` to `extensions/sources.ts`
- [ ] 3.5 Move `schemas/extension-sources.test.ts` to `extensions/sources.test.ts`
- [ ] 3.6 Update imports in files that reference common and extension-sources
- [ ] 3.7 Run `pnpm typecheck` and fix any errors
- [ ] 3.8 Run `pnpm lint:fix` and fix any errors
- [ ] 3.9 Run `pnpm test` and fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Move skills into extensions

- [ ] 4.1 Move `cli/src/skills/` folder to `cli/src/extensions/skills/`
- [ ] 4.2 Move `schemas/manifest-skill.ts` to `extensions/skills/manifest-schema.ts`
- [ ] 4.3 Move `schemas/manifest.test.ts` to `extensions/skills/manifest-schema.test.ts` (skill-related tests only)
- [ ] 4.4 Update imports in files that reference skills folder or manifest-skill
- [ ] 4.5 Run `pnpm typecheck` and fix any errors
- [ ] 4.6 Run `pnpm lint:fix` and fix any errors
- [ ] 4.7 Run `pnpm test` and fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Create other extension type folders

- [ ] 5.1 Create `extensions/commands/` folder with `manifest-schema.ts` (move from schemas/manifest-command.ts)
- [ ] 5.2 Create `extensions/mcp-servers/` folder with `manifest-schema.ts` (move from schemas/manifest-mcp-server.ts)
- [ ] 5.3 Create `extensions/packs/` folder with `manifest-schema.ts` (move from schemas/manifest-pack.ts)
- [ ] 5.4 Update imports in files that reference manifest-command, manifest-mcp-server, manifest-pack
- [ ] 5.5 Run `pnpm typecheck` and fix any errors
- [ ] 5.6 Run `pnpm lint:fix` and fix any errors
- [ ] 5.7 Run `pnpm test` and fix any failures
- [ ] 5.8 Kill any vitest worker processes

## 6. Update JSON schema generation

- [ ] 6.1 Move `core/scripts/generate-schemas.ts` to `cli/scripts/generate-schemas.ts`
- [ ] 6.2 Update script imports to reference new schema locations
- [ ] 6.3 Update script to output each JSON schema to `__generated__/` folder next to its source:
  - `lockfile/__generated__/axm-lock.schema.json`
  - `settings/__generated__/settings.schema.json`
  - `extensions/skills/__generated__/axm-skill.schema.json`
  - `extensions/commands/__generated__/axm-command.schema.json`
  - `extensions/mcp-servers/__generated__/axm-mcp-server.schema.json`
  - `extensions/packs/__generated__/axm-pack.schema.json`
- [ ] 6.4 Update `cli/package.json` to add `generate:schemas` script
- [ ] 6.5 Remove `generate:schemas` script from `core/package.json`
- [ ] 6.6 Run generation script and verify JSON schemas are created in correct locations
- [ ] 6.7 Run `pnpm typecheck` and fix any errors
- [ ] 6.8 Run `pnpm lint:fix` and fix any errors
- [ ] 6.9 Run `pnpm test` and fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. Remove schemas folder

- [ ] 7.1 Delete `schemas/index.ts`
- [ ] 7.2 Delete old `schemas/__generated__/` folder
- [ ] 7.3 Remove `cli/src/schemas/` folder (should be empty)
- [ ] 7.4 Run `pnpm typecheck` and fix any errors
- [ ] 7.5 Run `pnpm lint:fix` and fix any errors
- [ ] 7.6 Run `pnpm test` and fix any failures
- [ ] 7.7 Run `pnpm test:e2e` and fix any failures
- [ ] 7.8 Kill any vitest worker processes
