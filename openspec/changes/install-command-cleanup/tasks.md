## 1. InstallError and DiscoveryError cause convention (D4)

- [ ] 1.1 Update `InstallError` in `handler.ts`: change `cause: Option.Option<unknown>` to `cause: unknown`
- [ ] 1.2 Update all `InstallError` call sites in `handler.ts`: replace `Option.some(error)` with `error`, `Option.none()` with `undefined`
- [ ] 1.3 Update all `InstallError` call sites in `discover-skills.ts`: same replacements
- [ ] 1.4 Update all `InstallError` call sites in `select-skills.ts`: same replacements
- [ ] 1.5 Update `DiscoveryError` in `discover-skills.ts`: change `cause: Option.Option<unknown>` to `cause: unknown`, `path: Option.Option<string>` to `path: unknown`
- [ ] 1.6 Update all `DiscoveryError` call sites in `discover-skills.ts`: same replacements
- [ ] 1.7 Update `select-skills.test.ts` if any test assertions reference the cause field shape
- [ ] 1.8 Run `pnpm typecheck` and fix any errors
- [ ] 1.9 Run `pnpm lint` and fix any errors
- [ ] 1.10 Run `pnpm test` and fix any failures
- [ ] 1.11 Run `pnpm test:e2e` and fix any failures
- [ ] 1.12 Kill any vitest worker processes

## 2. Migrate `discover-skills.ts` to Path.Path (D2, D5)

- [ ] 2.1 Add `import * as Path from "@effect/platform/Path"` to `discover-skills.ts`
- [ ] 2.2 In `tryParseSkillInDir`: yield `Path.Path`, replace `nodePath.join` with `path.join`
- [ ] 2.3 In `scanDirectory`: yield `Path.Path`, replace `nodePath.join` with `path.join`
- [ ] 2.4 In `recursiveScan`: yield `Path.Path`, replace `nodePath.join` with `path.join`, update explicit return type annotation to include `Path.Path`
- [ ] 2.5 In `discoverSkillsInDir`: yield `Path.Path`, replace `nodePath.join`/`nodePath.resolve` with `path.join`/`path.resolve`, update explicit return type annotation to include `Path.Path`
- [ ] 2.6 In `discoverFromRemoteGitSource`: yield `Path.Path`, replace `nodePath.join`/`nodePath.relative` with `path.join`/`path.relative`
- [ ] 2.7 Remove `import * as nodePath from "node:path"` from `discover-skills.ts`
- [ ] 2.8 Replace `.flat()` with `Array.flatten` in `scanDirectory` result flattening (line ~174)
- [ ] 2.9 Replace `.flat()` with `Array.flatten` in `recursiveScan` result flattening (line ~222)
- [ ] 2.10 Update `discover-skills.test.ts` if layer setup needs `Path.Path` (tests use `NodeContext.layer` which already provides it)
- [ ] 2.11 Run `pnpm typecheck` and fix any errors
- [ ] 2.12 Run `pnpm lint` and fix any errors
- [ ] 2.13 Run `pnpm test` and fix any failures
- [ ] 2.14 Run `pnpm test:e2e` and fix any failures
- [ ] 2.15 Kill any vitest worker processes

## 3. Migrate `parse-manifests.ts` to Path.Path (D3)

- [ ] 3.1 Add `import * as Path from "@effect/platform/Path"` to `parse-manifests.ts`
- [ ] 3.2 Update `validatePath` signature: add `path: Path.Path` parameter, replace `nodePath.resolve`/`nodePath.dirname`/`nodePath.sep` with `path.resolve`/`path.dirname`/`path.sep`
- [ ] 3.3 Update `validateDirPath` signature: add `path: Path.Path` parameter, replace `nodePath.resolve`/`nodePath.sep` with `path.resolve`/`path.sep`
- [ ] 3.4 Update `resolvePluginBase` signature: add `path: Path.Path` parameter, replace `nodePath.resolve` with `path.resolve`
- [ ] 3.5 In `parseMarketplaceJson`: yield `Path.Path`, replace `nodePath.join` with `path.join`, pass `path` to `validatePath`/`validateDirPath`/`resolvePluginBase` calls
- [ ] 3.6 In `parsePluginJson`: yield `Path.Path`, replace `nodePath.join` with `path.join`, pass `path` to `validatePath` calls
- [ ] 3.7 In `parseManifests`: update return type annotation to include `Path.Path` in the Effect's R channel
- [ ] 3.8 Remove `import * as nodePath from "node:path"` from `parse-manifests.ts`
- [ ] 3.9 Update `parse-manifests.test.ts` if layer setup needs `Path.Path` (tests use `NodeContext.layer` which already provides it)
- [ ] 3.10 Run `pnpm typecheck` and fix any errors
- [ ] 3.11 Run `pnpm lint` and fix any errors
- [ ] 3.12 Run `pnpm test` and fix any failures
- [ ] 3.13 Run `pnpm test:e2e` and fix any failures
- [ ] 3.14 Kill any vitest worker processes

## 4. Boundary exception comment for `skill-utils.ts` (D1)

- [ ] 4.1 Add a comment above the `node:path` import in `skill-utils.ts` explaining the boundary exception (pure string utility, not I/O)
- [ ] 4.2 Run `pnpm typecheck` and fix any errors
- [ ] 4.3 Run `pnpm lint` and fix any errors
- [ ] 4.4 Run `pnpm test` and fix any failures
- [ ] 4.5 Kill any vitest worker processes

## 5. Remove `as const` assertions in `build-plan.ts` (D6)

- [ ] 5.1 Remove `as const` from `"PlannedJobStep"`, `"no-op"`, `"success"` string literals in `build-plan.ts`
- [ ] 5.2 If removing `as const` causes type widening, add a `satisfies` on the enclosing object or explicit return type to preserve narrowing
- [ ] 5.3 Run `pnpm typecheck` and fix any errors
- [ ] 5.4 Run `pnpm lint` and fix any errors
- [ ] 5.5 Run `pnpm test` and fix any failures
- [ ] 5.6 Run `pnpm test:e2e` and fix any failures
- [ ] 5.7 Kill any vitest worker processes
