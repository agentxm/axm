## Why

The install command module has accumulated code quality issues during active development: a compile error from a removed import still referenced in code, convention violations (native array methods where Effect `Array` is expected), misleading UX from stub code, and a yargs/Option mismatch that makes `--dry-run` and `--non-interactive` flags behave incorrectly at the boundary.

## What Changes

- Remove dead `Console.log` call in handler that references a removed import (compile error)
- Remove empty "V2 Dependencies" section header in handler
- Replace misleading "Loading agents..." spinner on hardcoded empty agents with a TODO-marked placeholder
- Replace native `.map()` calls with Effect `Array.map` in handler and discover-skills for convention consistency
- Mark incomplete handler steps (11, 14, outro) with explicit TODOs so they don't produce broken output
- Add missing `--non-interactive` option to yargs builder so users can actually set it
- Fix `Option.fromNullable` on yargs defaults that always produce `Some(false)` instead of `None` — remove yargs defaults for `dry-run` and `non-interactive` so `undefined` correctly maps to `Option.none()`
- Extract duplicated `createCapturingMock` helper in command tests to module-level
- Replace native array methods in `skill-utils.ts` with Effect `Array` for codebase consistency

## Capabilities

### New Capabilities

_(none — these are code quality fixes, not new capabilities)_

### Modified Capabilities

- `cli-skills-install`: The `--non-interactive` flag becomes a user-settable CLI option (currently missing from yargs builder). The boundary mapping for `--dry-run` and `--non-interactive` changes from always-Some to correct Option semantics.

## Impact

- **Code**: `packages/cli/src/cli-commands/skills/install/` — handler.ts, command.ts, command.test.ts, discover-skills.ts, skill-utils.ts
- **Build**: Fixes compile error from missing Console import
- **CLI behavior**: `--non-interactive` becomes available as a CLI flag; `--dry-run` and `--non-interactive` Option values change from `Some(false)` to `None` when not specified (downstream consumers must handle `None` correctly — review handler usage)
