# Tasks: Rename cli-skills-add to cli-skills-install

## Phase 1: Code Rename

### TASK-1.1: Rename add directory to install [AUTO]

**Implements:** DES-1, DES-3

**Description:** Rename the `packages/cli/src/commands/skills/add/` directory to
`packages/cli/src/commands/skills/install/` using git mv for proper tracking.

**Acceptance Criteria:**

- [x] `packages/cli/src/commands/skills/install/` exists with all files from add/
- [x] `packages/cli/src/commands/skills/add/` no longer exists
- [x] Git shows rename (not delete+add) in status

**Dependencies:** None

### TASK-1.2: Update command registration [AUTO]

**Implements:** DES-1

**Description:** Update the skills command.ts to register "install" instead of
"add" as the sub-command name. Update main.ts if it references the add command.

**Acceptance Criteria:**

- [x] `packages/cli/src/commands/skills/command.ts` registers "install" sub-command
- [x] No references to "add" remain in command registration
- [x] `pnpm typecheck` passes

**Dependencies:** TASK-1.1

### TASK-1.3: Update internal references [AUTO]

**Implements:** DES-1

**Description:** Update all internal code references from "add" to "install"
within the renamed directory. This includes function names, variable names,
comments, and string literals in handler.ts, command.ts, and any utils.

**Acceptance Criteria:**

- [x] All function/variable names using "add" updated to "install" where appropriate
- [x] All user-facing strings say "install" instead of "add"
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes

**Dependencies:** TASK-1.1

### TASK-1.4: Rename E2E test file [AUTO]

**Implements:** DES-3

**Description:** Rename `packages/cli/e2e/skills-add.test.ts` to
`packages/cli/e2e/skills-install.test.ts` and update test descriptions and
commands to use "install" terminology.

**Acceptance Criteria:**

- [x] `packages/cli/e2e/skills-install.test.ts` exists
- [x] `packages/cli/e2e/skills-add.test.ts` no longer exists
- [x] Test descriptions reference "install" not "add"
- [x] Test commands use `axm skills install` not `axm skills add`
- [x] `pnpm test:e2e` passes

**Dependencies:** TASK-1.2, TASK-1.3

### TASK-1.5: Update unit tests [AUTO]

**Implements:** DES-1

**Description:** Update unit test files in the install directory to use
"install" terminology in descriptions and assertions.

**Acceptance Criteria:**

- [x] All test descriptions reference "install" not "add"
- [x] `pnpm test` passes

**Dependencies:** TASK-1.3

## Phase 2: Validation

### TASK-2.1: Run full test suite [AUTO]

**Implements:** DES-1

**Description:** Run the complete test suite to verify all tests pass after the
rename.

**Acceptance Criteria:**

- [x] `pnpm test` exits 0
- [x] `pnpm test:e2e` exits 0
- [x] `pnpm typecheck` exits 0
- [x] `pnpm lint` exits 0

**Dependencies:** TASK-1.4, TASK-1.5

### TASK-2.2: Verify CLI command works [AUTO]

**Implements:** DES-1

**Description:** Build the CLI and verify `axm skills install --help` works
correctly.

**Acceptance Criteria:**

- [x] `pnpm build` succeeds
- [x] `axm skills install --help` displays help for install command
- [x] `axm skills add` shows error or unknown command (not silently accepted)

**Dependencies:** TASK-2.1
