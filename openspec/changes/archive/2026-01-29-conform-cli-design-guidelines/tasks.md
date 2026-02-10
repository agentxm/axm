# Tasks

## Phase 1: Remove Extensions Command

- [x] Delete `packages/cli/src/commands/extensions.ts`
- [x] Delete `packages/cli/src/commands/extensions.test.ts`
- [x] Remove `extensionsCommand` import and registration from `main.ts`

## Phase 2: Update Root CLI Behavior

- [x] Update `main.ts` to show help when invoked without arguments
- [x] Remove "AgentXM CLI ready" console output
- [x] Implement `.fail()` handler to exit 0 when no command provided
- [x] Add `.usage()` with description of CLI purpose
- [x] Update `main.test.ts` to verify new behavior

## Phase 3: Update Skills Parent Command

- [x] Update `skills.ts` to use friendly welcome pattern
- [x] Replace error message with `.fail()` handler that shows help and exits 0
- [x] Add tests for skills parent command welcome behavior

## Phase 4: Update Specs

- [x] Update `cli/spec.md` - remove "Startup Message" requirement, add "Root
      Command Behavior"
- [x] Update `cli/spec.md` - remove "Extensions Sub-command" requirement
- [x] Update `cli-skills/spec.md` - modify scenario for empty invocation to
      expect help and exit 0

## Phase 5: Validation

- [x] Run `pnpm test` - all tests pass
- [x] Run `pnpm typecheck` - no type errors
- [x] Manual verification: `axm` shows help, exits 0
- [x] Manual verification: `axm skills` shows help, exits 0
- [x] Manual verification: `axm extensions` fails (command not found)
