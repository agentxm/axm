## 1. Update Canonical Source

- [x] 1.1 Add `azuredevops` to `SourceSchema` in `extensions/sources.ts`
- [x] 1.2 Rename `SourceType` to `Source` (type export)
- [x] 1.3 Run typecheck to verify changes compile

## 2. Update Skills Extension

- [x] 2.1 Update `extensions/skills/types.ts` to import `Source as BaseSource` from `../sources.js`
- [x] 2.2 Rename local `SourceType` to `Source` extending `BaseSource | "wellknown"`
- [x] 2.3 Update all usages within skills module to use new `Source` type name
- [x] 2.4 Run typecheck to verify changes compile

## 3. Update Resolution Module

- [x] 3.1 Remove local `SourceType` definition from `resolution/types.ts`
- [x] 3.2 Re-export `Source` from `../extensions/sources.js`
- [x] 3.3 Update all usages within resolution module to use new import
- [x] 3.4 Run typecheck to verify changes compile

## 4. Clean Up Common Module

- [x] 4.1 Find all usages of `SourceTypeSchema`/`SourceSchema` from `extensions/common.ts`
- [x] 4.2 Migrate consumers to import from `extensions/sources.ts`
- [x] 4.3 Map any `url` usages to `git`, `path` usages to `local`
- [x] 4.4 Remove `SourceTypeSchema` and `SourceType` from `extensions/common.ts`
- [x] 4.5 Run typecheck to verify changes compile

## 5. Update Remaining Consumers

- [x] 5.1 Search for all remaining `SourceType` imports across codebase
- [x] 5.2 Update import paths to canonical location (`extensions/sources.ts`)
- [x] 5.3 Rename type references from `SourceType` to `Source`
- [x] 5.4 Run typecheck to verify changes compile

## 6. Verification

- [x] 6.1 Run `pnpm typecheck` for all packages
- [ ] 6.2 Run `pnpm lint` for all packages, fix any errors
- [ ] 6.3 Run `pnpm test` for all packages, fix any failures
- [ ] 6.4 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 6.5 Kill any vitest worker processes
