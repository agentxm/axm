# Tasks: Align Project Structure

## 1. CLI Commands Restructure

- [ ] 1.1 Create `packages/cli/src/commands/init/` directory
- [ ] 1.2 Move `init.ts` → `init/index.ts` (update to re-export handler)
- [ ] 1.3 Move `init.handler.ts` → `init/handler.ts`
- [ ] 1.4 Move `__tests__/init.handler.test.ts` → `init/handler.test.ts`
- [ ] 1.5 Create `packages/cli/src/commands/skills/add/` directory
- [ ] 1.6 Move `skills/add.ts` → `skills/add/index.ts`
- [ ] 1.7 Move `skills/add.handler.ts` → `skills/add/handler.ts`
- [ ] 1.8 Move `skills/__tests__/add.handler.test.ts` → `skills/add/handler.test.ts`
- [ ] 1.9 Update `skills/index.ts` (formerly `skills.ts`) to import from new paths
- [ ] 1.10 Remove empty `__tests__/` directories in CLI

## 2. Core Package Test Colocation

- [ ] 2.1 Move `__tests__/agent-detection.test.ts` → `agent-detection.test.ts`
- [ ] 2.2 Move `__tests__/content-hash.test.ts` → `content-hash.test.ts`
- [ ] 2.3 Move `__tests__/git.test.ts` → `git.test.ts`
- [ ] 2.4 Move `__tests__/installer.test.ts` → `installer.test.ts`
- [ ] 2.5 Move `__tests__/lockfile.test.ts` → `lockfile.test.ts`
- [ ] 2.6 Move `__tests__/settings.test.ts` → `settings.test.ts`
- [ ] 2.7 Move `__tests__/skill-discovery.test.ts` → `skill-discovery.test.ts`
- [ ] 2.8 Move `__tests__/source-parser.test.ts` → `source-parser.test.ts`
- [ ] 2.9 Move `__tests__/wellknown.test.ts` → `wellknown.test.ts`
- [ ] 2.10 Remove empty `__tests__/` directory in core

## 3. Update Imports

- [ ] 3.1 Update imports in `packages/cli/src/main.ts` for new command paths
- [ ] 3.2 Update any cross-file imports in CLI commands
- [ ] 3.3 Update imports in core test files (if any reference other files)

## 4. Verification

- [ ] 4.1 Run `pnpm build` to verify no broken imports
- [ ] 4.2 Run `pnpm test` to verify all tests still pass
- [ ] 4.3 Run `pnpm typecheck` to verify type correctness
- [ ] 4.4 Run `pnpm lint` to verify code style
