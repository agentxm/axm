## 1. Fix build-breaking dead code in handler

- [x] 1.1 Remove the `yield* Console.log(...)` call on line 205 of handler.ts
- [x] 1.2 Remove the empty "V2 Dependencies" section header (lines 77-80) in handler.ts
- [x] 1.3 Replace the misleading "Loading agents..." spinner block (lines 140-142) with a TODO-commented placeholder that doesn't print misleading output
- [x] 1.4 Mark incomplete steps 11, 14, and outro (lines 207-213) with explicit TODO comments; replace partial `"Successfully installed "` string with a TODO placeholder
- [x] 1.5 Run `pnpm typecheck` and fix any errors

## 2. Fix yargs/Option boundary for --dry-run and --non-interactive

- [x] 2.1 Update command.test.ts: add tests for `--non-interactive` option definition (boolean type, no default) and `--dry-run` having no default; update the parser test that asserts `--dry-run` defaults to `false` to instead assert `undefined`
- [x] 2.2 Add `--non-interactive` option to yargs builder in command.ts (type: boolean, describe, no default)
- [x] 2.3 Remove `default: false` from `--dry-run` option in command.ts yargs builder
- [x] 2.4 Update `InstallCommandArgs` type in command.ts: change `"dry-run"` and `"non-interactive"` to optional (`?: boolean`)
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. Replace native array methods with Effect Array

- [x] 3.1 In handler.ts, replace `selectedSkills.map(...)` (line 195) with `Array.map(selectedSkills, ...)`
- [x] 3.2 In discover-skills.ts, replace `getAllAgents().map(...)` (line 112) with `Array.map(getAllAgents(), ...)`
- [x] 3.3 In skill-utils.ts, add `import * as Array from "effect/Array"` and replace `inputNames.map(...)` and `skills.filter(...)` in `filterSkills` with Effect `Array.map` / `Array.filter`
- [x] 3.4 Run `pnpm typecheck` and fix any errors
- [x] 3.5 Run `pnpm test` and fix any failures
- [x] 3.6 Kill any vitest worker processes

## 4. Deduplicate test helper in command.test.ts

- [x] 4.1 Extract the duplicated `createCapturingMock` function to module-level (above the first describe block), removing the two inline copies
- [x] 4.2 Run `pnpm test` and fix any failures
- [x] 4.3 Kill any vitest worker processes

## 5. Final verification

- [x] 5.1 Run `pnpm typecheck` for all packages
- [x] 5.2 Run `pnpm lint` for all packages, fix any errors
- [x] 5.3 Run `pnpm test` for all packages, fix any failures
- [x] 5.4 Run `pnpm test:e2e` for relevant e2e tests, fix any failures
- [x] 5.5 Kill any vitest worker processes
