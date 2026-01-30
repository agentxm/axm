# Tasks: Add skills remove sub-command

## Phase 1: Implementation

### TASK-1.1: Create remove command handler [AUTO]

**Implements:** DES-1, DES-2

**Description:** Create the Effect handler for the remove command that prints "Hello Alex" to the console.

**Acceptance Criteria:**

- [ ] `packages/cli/src/commands/skills/remove/handler.ts` exists
- [ ] Handler exports `handleRemove` function returning Effect
- [ ] Handler prints "Hello Alex" to console
- [ ] Unit test in `handler.test.ts` verifies output

**Dependencies:** None

### TASK-1.2: Create remove command yargs definition [AUTO]

**Implements:** DES-1, DES-3

**Description:** Create the yargs command definition that wires the handler to `axm skills remove`.

**Acceptance Criteria:**

- [ ] `packages/cli/src/commands/skills/remove/command.ts` exists
- [ ] Command exports `removeCommand` as CommandModule
- [ ] Command uses `"remove"` as command string
- [ ] Command has describe text for help
- [ ] Unit test in `command.test.ts` verifies command structure

**Dependencies:** TASK-1.1

### TASK-1.3: Wire remove command to skills parent [AUTO]

**Implements:** DES-1

**Description:** Register the remove command with the skills parent command.

**Acceptance Criteria:**

- [ ] `packages/cli/src/commands/skills/command.ts` imports and registers `removeCommand`
- [ ] `axm skills --help` shows remove in sub-commands list

**Dependencies:** TASK-1.2

## Phase 2: Verification

### TASK-2.1: Add E2E test for remove command [AUTO]

**Implements:** REQ-1 (Remove Command Basic Invocation)

**Description:** Create E2E test verifying the remove command works end-to-end.

**Acceptance Criteria:**

- [ ] `packages/cli/e2e/skills-remove.test.ts` exists
- [ ] Test verifies `axm skills remove` outputs "Hello Alex"
- [ ] Test verifies exit code 0
- [ ] `pnpm test:e2e` passes

**Dependencies:** TASK-1.3

### TASK-2.2: Verify all tests pass [VERIFY]

**Implements:** REQ-1

**Description:** Run full test suite to ensure no regressions.

**Acceptance Criteria:**

- [ ] `pnpm test` exits 0
- [ ] `pnpm test:e2e` exits 0
- [ ] `pnpm typecheck` exits 0

**Dependencies:** TASK-2.1
