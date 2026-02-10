## 1. InstallError and DiscoveryError cause convention (D4)

- [x] 1.1 Update `InstallError` in `handler.ts`: change `cause: Option.Option<unknown>` to `cause: unknown`
- [x] 1.2 Update all `InstallError` call sites in `handler.ts`: replace `Option.some(error)` with `error`, `Option.none()` with `undefined`
- [x] 1.3 Update all `InstallError` call sites in `discover-skills.ts`: same replacements
- [x] 1.4 Update all `InstallError` call sites in `select-skills.ts`: same replacements
- [x] 1.5 Update `DiscoveryError` in `discover-skills.ts`: change `cause: Option.Option<unknown>` to `cause: unknown`, `path: Option.Option<string>` to `path: unknown`
- [x] 1.6 Update all `DiscoveryError` call sites in `discover-skills.ts`: same replacements
- [x] 1.7 Update `select-skills.test.ts` if any test assertions reference the cause field shape
- [x] 1.8 Run `pnpm typecheck` and fix any errors
- [x] 1.9 Run `pnpm lint` and fix any errors
- [x] 1.10 Run `pnpm test` and fix any failures
- [x] 1.11 Run `pnpm test:e2e` and fix any failures
- [x] 1.12 Kill any vitest worker processes

## 2. Migrate `discover-skills.ts` to Path.Path (D2, D5)

- [x] 2.1 Add `import * as Path from "@effect/platform/Path"` to `discover-skills.ts`
- [x] 2.2 In `tryParseSkillInDir`: yield `Path.Path`, replace `nodePath.join` with `path.join`
- [x] 2.3 In `scanDirectory`: yield `Path.Path`, replace `nodePath.join` with `path.join`
- [x] 2.4 In `recursiveScan`: yield `Path.Path`, replace `nodePath.join` with `path.join`, update explicit return type annotation to include `Path.Path`
- [x] 2.5 In `discoverSkillsInDir`: yield `Path.Path`, replace `nodePath.join`/`nodePath.resolve` with `path.join`/`path.resolve`, update explicit return type annotation to include `Path.Path`
- [x] 2.6 In `discoverFromRemoteGitSource`: yield `Path.Path`, replace `nodePath.join`/`nodePath.relative` with `path.join`/`path.relative`
- [x] 2.7 Remove `import * as nodePath from "node:path"` from `discover-skills.ts`
- [x] 2.8 Replace `.flat()` with `Array.flatten` in `scanDirectory` result flattening (line ~174)
- [x] 2.9 Replace `.flat()` with `Array.flatten` in `recursiveScan` result flattening (line ~222)
- [x] 2.10 Update `discover-skills.test.ts` if layer setup needs `Path.Path` (tests use `NodeContext.layer` which already provides it)
- [x] 2.11 Run `pnpm typecheck` and fix any errors
- [x] 2.12 Run `pnpm lint` and fix any errors
- [x] 2.13 Run `pnpm test` and fix any failures
- [x] 2.14 Run `pnpm test:e2e` and fix any failures
- [x] 2.15 Kill any vitest worker processes

## 3. Migrate `parse-manifests.ts` to Path.Path (D3)

- [x] 3.1 Add `import * as Path from "@effect/platform/Path"` to `parse-manifests.ts`
- [x] 3.2 Update `validatePath` signature: add `path: Path.Path` parameter, replace `nodePath.resolve`/`nodePath.dirname`/`nodePath.sep` with `path.resolve`/`path.dirname`/`path.sep`
- [x] 3.3 Update `validateDirPath` signature: add `path: Path.Path` parameter, replace `nodePath.resolve`/`nodePath.sep` with `path.resolve`/`path.sep`
- [x] 3.4 Update `resolvePluginBase` signature: add `path: Path.Path` parameter, replace `nodePath.resolve` with `path.resolve`
- [x] 3.5 In `parseMarketplaceJson`: yield `Path.Path`, replace `nodePath.join` with `path.join`, pass `path` to `validatePath`/`validateDirPath`/`resolvePluginBase` calls
- [x] 3.6 In `parsePluginJson`: yield `Path.Path`, replace `nodePath.join` with `path.join`, pass `path` to `validatePath` calls
- [x] 3.7 In `parseManifests`: update return type annotation to include `Path.Path` in the Effect's R channel
- [x] 3.8 Remove `import * as nodePath from "node:path"` from `parse-manifests.ts`
- [x] 3.9 Update `parse-manifests.test.ts` if layer setup needs `Path.Path` (tests use `NodeContext.layer` which already provides it)
- [x] 3.10 Run `pnpm typecheck` and fix any errors
- [x] 3.11 Run `pnpm lint` and fix any errors
- [x] 3.12 Run `pnpm test` and fix any failures
- [x] 3.13 Run `pnpm test:e2e` and fix any failures
- [x] 3.14 Kill any vitest worker processes

## 4. Boundary exception comment for `skill-utils.ts` (D1)

- [x] 4.1 Add a comment above the `node:path` import in `skill-utils.ts` explaining the boundary exception (pure string utility, not I/O)
- [x] 4.2 Run `pnpm typecheck` and fix any errors
- [x] 4.3 Run `pnpm lint` and fix any errors
- [x] 4.4 Run `pnpm test` and fix any failures
- [x] 4.5 Kill any vitest worker processes

## 5. Remove `as const` assertions in `build-plan.ts` (D6)

- [x] 5.1 Remove `as const` from `"PlannedJobStep"`, `"no-op"`, `"success"` string literals in `build-plan.ts`
- [x] 5.2 If removing `as const` causes type widening, add a `satisfies` on the enclosing object or explicit return type to preserve narrowing
- [x] 5.3 Run `pnpm typecheck` and fix any errors
- [x] 5.4 Run `pnpm lint` and fix any errors
- [x] 5.5 Run `pnpm test` and fix any failures
- [x] 5.6 Run `pnpm test:e2e` and fix any failures
- [x] 5.7 Kill any vitest worker processes
