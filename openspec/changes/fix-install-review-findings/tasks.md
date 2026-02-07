## 1. Fix build-breaking dead code in handler

- [ ] 1.1 Remove the `yield* Console.log(...)` call on line 205 of handler.ts
- [ ] 1.2 Remove the empty "V2 Dependencies" section header (lines 77-80) in handler.ts
- [ ] 1.3 Replace the misleading "Loading agents..." spinner block (lines 140-142) with a TODO-commented placeholder that doesn't print misleading output
- [ ] 1.4 Mark incomplete steps 11, 14, and outro (lines 207-213) with explicit TODO comments; replace partial `"Successfully installed "` string with a TODO placeholder
- [ ] 1.5 Run `pnpm typecheck` and fix any errors

## 2. Fix yargs/Option boundary for --dry-run and --non-interactive

- [ ] 2.1 Update command.test.ts: add tests for `--non-interactive` option definition (boolean type, no default) and `--dry-run` having no default; update the parser test that asserts `--dry-run` defaults to `false` to instead assert `undefined`
- [ ] 2.2 Add `--non-interactive` option to yargs builder in command.ts (type: boolean, describe, no default)
- [ ] 2.3 Remove `default: false` from `--dry-run` option in command.ts yargs builder
- [ ] 2.4 Update `InstallCommandArgs` type in command.ts: change `"dry-run"` and `"non-interactive"` to optional (`?: boolean`)
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Replace native array methods with Effect Array

- [ ] 3.1 In handler.ts, replace `selectedSkills.map(...)` (line 195) with `Array.map(selectedSkills, ...)`
- [ ] 3.2 In discover-skills.ts, replace `getAllAgents().map(...)` (line 112) with `Array.map(getAllAgents(), ...)`
- [ ] 3.3 In skill-utils.ts, add `import * as Array from "effect/Array"` and replace `inputNames.map(...)` and `skills.filter(...)` in `filterSkills` with Effect `Array.map` / `Array.filter`
- [ ] 3.4 Run `pnpm typecheck` and fix any errors
- [ ] 3.5 Run `pnpm test` and fix any failures
- [ ] 3.6 Kill any vitest worker processes

## 4. Deduplicate test helper in command.test.ts

- [ ] 4.1 Extract the duplicated `createCapturingMock` function to module-level (above the first describe block), removing the two inline copies
- [ ] 4.2 Run `pnpm test` and fix any failures
- [ ] 4.3 Kill any vitest worker processes

## 5. Final verification

- [ ] 5.1 Run `pnpm typecheck` for all packages
- [ ] 5.2 Run `pnpm lint` for all packages, fix any errors
- [ ] 5.3 Run `pnpm test` for all packages, fix any failures
- [ ] 5.4 Run `pnpm test:e2e` for relevant e2e tests, fix any failures
- [ ] 5.5 Kill any vitest worker processes
