# Tasks: Align CLI with cli-conventions skill

**Plan Epic:** axm-3

## Phase 1: Standard Flags Infrastructure

**Epic:** axm-3.1

### TASK-1.1: Add global standard flags to root CLI [AUTO]

**Bead:** axm-3.1.1
**Implements:** DES-1, REQ-Standard Flags

**Description:** Add `--verbose`, `--quiet`, `--json`, and `--non-interactive` flags to the root yargs configuration in `main.ts`. These flags should be available to all commands.

**Acceptance Criteria:**

- [x] `packages/cli/src/main.ts` defines `--verbose` (`-v`) boolean flag
- [x] `packages/cli/src/main.ts` defines `--quiet` (`-q`) boolean flag
- [x] `packages/cli/src/main.ts` defines `--json` boolean flag
- [x] `packages/cli/src/main.ts` defines `--non-interactive` boolean flag
- [x] Running `axm --help` shows all four standard flags
- [x] `pnpm typecheck` exits 0

**Dependencies:** None

### TASK-1.2: Wire standard flags to init command [AUTO]

**Bead:** axm-3.1.2
**Implements:** DES-1, REQ-Standard Flags

**Description:** Update the init command to accept and forward global standard flags to its handler. The handler interface should include these flags.

**Acceptance Criteria:**

- [x] `InitArgs` interface includes `verbose`, `quiet`, `json`, `nonInteractive` fields
- [x] `command.ts` passes standard flags to handler
- [x] `pnpm typecheck` exits 0

**Dependencies:** TASK-1.1

### TASK-1.3: Wire standard flags to skills add command [AUTO]

**Bead:** axm-3.1.3
**Implements:** DES-1, REQ-Standard Flags

**Description:** Update the skills add command to accept and forward global standard flags to its handler. The handler interface should include these flags.

**Acceptance Criteria:**

- [x] `AddArgs` interface includes `verbose`, `quiet`, `json`, `nonInteractive` fields
- [x] `command.ts` passes standard flags to handler
- [x] `pnpm typecheck` exits 0

**Dependencies:** TASK-1.1

## Phase 2: TTY Detection

**Epic:** axm-3.2

### TASK-2.1: Add TTY detection utility [AUTO]

**Bead:** axm-3.2.1
**Implements:** DES-2, REQ-TTY Detection

**Description:** Create a utility module with functions for TTY detection that handlers can use. Include `isInteractive()` for stdin and `isFancyOutput()` for stdout.

**Acceptance Criteria:**

- [x] `packages/cli/src/utils/tty.ts` exports `isInteractive(): boolean`
- [x] `packages/cli/src/utils/tty.ts` exports `isFancyOutput(): boolean`
- [x] `isInteractive()` returns `process.stdin.isTTY === true`
- [x] `isFancyOutput()` returns `process.stdout.isTTY === true`
- [x] Unit test `packages/cli/src/utils/tty.test.ts` covers both functions
- [x] `pnpm test packages/cli/src/utils/tty.test.ts` exits 0

**Dependencies:** None

### TASK-2.2: Add TTY detection to init handler [AUTO]

**Bead:** axm-3.2.2
**Implements:** DES-2, REQ-TTY Detection

**Description:** Update the init handler to check TTY before prompting. If stdin is not a TTY and `--yes` is not provided, fail with a helpful error message.

**Acceptance Criteria:**

- [x] Handler checks `isInteractive()` before calling prompt functions
- [x] When not interactive and `--yes` not set, returns `InitError` with message suggesting `--yes` or `--non-interactive`
- [x] Handler checks `isFancyOutput()` before using spinner
- [x] When not fancy output, logs plain text instead of spinner
- [x] Handler tests cover non-TTY scenarios
- [x] `pnpm test packages/cli/src/commands/init/handler.test.ts` exits 0

**Dependencies:** TASK-2.1, TASK-1.2

### TASK-2.3: Add TTY detection to skills add handler [AUTO]

**Bead:** axm-3.2.3
**Implements:** DES-2, REQ-TTY Detection

**Description:** Update the skills add handler to check TTY before prompting. If stdin is not a TTY and appropriate flags are not provided, fail with a helpful error message.

**Acceptance Criteria:**

- [x] Handler checks `isInteractive()` before calling prompt functions
- [x] When not interactive and `--yes`/`--all` not set, returns `AddError` with message suggesting `--yes`, `--all`, or `--non-interactive`
- [x] Handler checks `isFancyOutput()` before using spinner
- [x] When not fancy output, logs plain text instead of spinner
- [x] Handler tests cover non-TTY scenarios
- [x] `pnpm test packages/cli/src/commands/skills/add/handler.test.ts` exits 0

**Dependencies:** TASK-2.1, TASK-1.3

## Phase 3: Error Message Improvements

**Epic:** axm-3.3

### TASK-3.1: Create error formatting utility [AUTO]

**Bead:** axm-3.3.1
**Implements:** DES-3, REQ-Error Message Format

**Description:** Create a utility function that formats errors with what happened and how to fix. Use a consistent format across the CLI.

**Acceptance Criteria:**

- [x] `packages/cli/src/utils/errors.ts` exports `formatError(what: string, details?: string[], howToFix?: string): string`
- [x] Output format includes the error, optional details, and optional recovery guidance
- [x] Unit test `packages/cli/src/utils/errors.test.ts` verifies format
- [x] `pnpm test packages/cli/src/utils/errors.test.ts` exits 0

**Dependencies:** None

### TASK-3.2: Improve init handler error messages [AUTO]

**Bead:** axm-3.3.2
**Implements:** DES-3, REQ-Error Message Format

**Description:** Update init handler error messages to include recovery guidance. Use the error formatting utility for consistency.

**Acceptance Criteria:**

- [x] Unknown agent error suggests valid agent IDs
- [x] Settings write error suggests checking permissions
- [x] Non-TTY error suggests using `--yes` or `--non-interactive`
- [x] `pnpm test packages/cli/src/commands/init/handler.test.ts` exits 0

**Dependencies:** TASK-3.1, TASK-2.2

### TASK-3.3: Improve skills add handler error messages [AUTO]

**Bead:** axm-3.3.3
**Implements:** DES-3, REQ-Error Message Format

**Description:** Update skills add handler error messages to include recovery guidance. Use the error formatting utility for consistency.

**Acceptance Criteria:**

- [x] Invalid source error suggests valid source formats
- [x] No skills found error suggests checking the source path
- [x] Clone failure error suggests checking network or credentials
- [x] Non-TTY error suggests using `--yes`, `--all`, or `--non-interactive`
- [x] `pnpm test packages/cli/src/commands/skills/add/handler.test.ts` exits 0

**Dependencies:** TASK-3.1, TASK-2.3

## Phase 4: Parser Unit Tests

**Epic:** axm-3.4

### TASK-4.1: Add parser tests for init command [AUTO]

**Bead:** axm-3.4.1
**Implements:** DES-4, REQ-Parser Unit Testing

**Description:** Add yargs parser unit tests for the init command. Tests should verify required arguments, defaults, aliases, and type coercion.

**Acceptance Criteria:**

- [x] `packages/cli/src/commands/init/command.test.ts` has parser test section
- [x] Tests use `yargs().command(initCommand).exitProcess(false).fail(false)` pattern
- [x] Tests verify `--global` defaults to false
- [x] Tests verify `--yes` alias `-y` works
- [x] Tests verify `--agent` accepts array of strings
- [x] `pnpm test packages/cli/src/commands/init/command.test.ts` exits 0

**Dependencies:** TASK-1.2

### TASK-4.2: Add parser tests for skills add command [AUTO]

**Bead:** axm-3.4.2
**Implements:** DES-4, REQ-Parser Unit Testing

**Description:** Add yargs parser unit tests for the skills add command. Tests should verify required arguments, defaults, aliases, and type coercion.

**Acceptance Criteria:**

- [x] `packages/cli/src/commands/skills/add/command.test.ts` has parser test section
- [x] Tests use `yargs().command(addCommand).exitProcess(false).fail(false)` pattern
- [x] Tests verify `source` positional is required
- [x] Tests verify `--yes` alias `-y` works
- [x] Tests verify `--list` alias `-l` works
- [x] Tests verify `--agent` and `--skill` accept arrays
- [x] `pnpm test packages/cli/src/commands/skills/add/command.test.ts` exits 0

**Dependencies:** TASK-1.3

## Phase 5: Validation

**Epic:** axm-3.5

### TASK-5.1: Run full test suite [AUTO]

**Bead:** axm-3.5.1
**Implements:** All requirements

**Description:** Run the full test suite to verify all changes work together. Fix any regressions.

**Acceptance Criteria:**

- [ ] `pnpm test` exits 0
- [ ] `pnpm test:e2e` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0

**Dependencies:** TASK-4.1, TASK-4.2, TASK-3.2, TASK-3.3

### TASK-5.2: Manual CLI verification [VERIFY]

**Bead:** axm-3.5.2
**Implements:** All requirements

**Description:** Manually verify CLI behavior matches the cli-conventions skill checklist.

**Acceptance Criteria:**

- [ ] `axm --help` shows standard flags
- [ ] `axm init --help` shows standard flags
- [ ] `axm skills add --help` shows standard flags
- [ ] Running with `--json` produces valid JSON output
- [ ] Running with `--quiet` suppresses progress output
- [ ] Running without TTY (piped input) fails gracefully with helpful message

**Dependencies:** TASK-5.1
