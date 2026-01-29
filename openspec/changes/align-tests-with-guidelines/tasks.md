# Tasks: Align Tests with Guidelines

Plan Epic: (created by `/beads-plan`)

---

## Phase 1: Add Missing Command Tests [AUTO]

Phase Epic: (created by `/beads-plan`)

### TASK-1.1: Add init command test [AUTO]

**Implements:** DES-1

**Description:** Create `command.test.ts` for the init command to verify yargs command definition, options, and description.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/src/commands/init/command.test.ts`
- [ ] Tests verify command description matches expected text
- [ ] Tests verify `--yes`, `--global`, `--agent` options are defined
- [ ] Tests verify option types and defaults
- [ ] `pnpm test packages/cli/src/commands/init/command.test.ts` exits 0

**Dependencies:** None

---

### TASK-1.2: Add skills add command test [AUTO]

**Implements:** DES-1

**Description:** Create `command.test.ts` for the skills add command to verify yargs command definition, positional source argument, and all options.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/src/commands/skills/add/command.test.ts`
- [ ] Tests verify command description
- [ ] Tests verify `source` positional argument
- [ ] Tests verify options: `--global`, `--agent`, `--skill`, `--yes`, `--list`, `--all`
- [ ] Tests verify option types (string, array, boolean)
- [ ] `pnpm test packages/cli/src/commands/skills/add/command.test.ts` exits 0

**Dependencies:** None

---

## Phase 2: Add E2E Root Command Test [AUTO]

Phase Epic: (created by `/beads-plan`)

### TASK-2.1: Add root command E2E test [AUTO]

**Implements:** DES-3

**Description:** Add E2E test verifying `axm` (no arguments) displays help and exits with code 0, per CLI spec requirement for "Root Command Behavior."

**Acceptance Criteria:**

- [ ] Test added to `packages/cli/e2e/root.test.ts` (new file)
- [ ] Test verifies exit code 0 when running `axm` without arguments
- [ ] Test verifies output contains available commands (`init`, `skills`)
- [ ] Test verifies output contains examples
- [ ] `pnpm test:e2e packages/cli/e2e/root.test.ts` exits 0

**Dependencies:** None

---

## Phase 3: Relocate Core Tests [AUTO]

Phase Epic: (created by `/beads-plan`)

### TASK-3.1: Relocate source-parser test [AUTO]

**Implements:** DES-2

**Description:** Move `source-parser.test.ts` from `__tests__/` to colocate with `source-parser.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/source-parser.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/source-parser.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.2: Relocate content-hash test [AUTO]

**Implements:** DES-2

**Description:** Move `content-hash.test.ts` from `__tests__/` to colocate with `content-hash.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/content-hash.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/content-hash.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.3: Relocate settings test [AUTO]

**Implements:** DES-2

**Description:** Move `settings.test.ts` from `__tests__/` to colocate with `settings.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/settings.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/settings.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.4: Relocate skill-discovery test [AUTO]

**Implements:** DES-2

**Description:** Move `skill-discovery.test.ts` from `__tests__/` to colocate with `skill-discovery.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/skill-discovery.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/skill-discovery.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.5: Relocate lockfile test [AUTO]

**Implements:** DES-2

**Description:** Move `lockfile.test.ts` from `__tests__/` to colocate with `lockfile.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/lockfile.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/lockfile.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.6: Relocate git test [AUTO]

**Implements:** DES-2

**Description:** Move `git.test.ts` from `__tests__/` to colocate with `git.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/git.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/git.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.7: Relocate wellknown test [AUTO]

**Implements:** DES-2

**Description:** Move `wellknown.test.ts` from `__tests__/` to colocate with `wellknown.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/wellknown.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/wellknown.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.8: Relocate agent-detection test [AUTO]

**Implements:** DES-2

**Description:** Move `agent-detection.test.ts` from `__tests__/` to colocate with `agent-detection.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/agent-detection.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/agent-detection.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.9: Relocate installer test [AUTO]

**Implements:** DES-2

**Description:** Move `installer.test.ts` from `__tests__/` to colocate with `installer.ts`.

**Acceptance Criteria:**

- [ ] Test file moved using `git mv`
- [ ] New location: `packages/core/src/experimental/skills/installer.test.ts`
- [ ] All imports updated if needed
- [ ] `pnpm test packages/core/src/experimental/skills/installer.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.10: Remove empty **tests** directory [AUTO]

**Implements:** DES-2

**Description:** After all test relocations, remove the now-empty `__tests__/` directory.

**Acceptance Criteria:**

- [ ] Directory `packages/core/src/experimental/skills/__tests__/` removed
- [ ] No test files remain in `__tests__/` directories under `packages/core/`
- [ ] `pnpm test` passes (all tests still run)

**Dependencies:** TASK-3.1, TASK-3.2, TASK-3.3, TASK-3.4, TASK-3.5, TASK-3.6, TASK-3.7, TASK-3.8, TASK-3.9

---

## Phase 4: Verification [VERIFY]

Phase Epic: (created by `/beads-plan`)

### TASK-4.1: Run full test suite [VERIFY]

**Implements:** All

**Description:** Run complete test suite to verify all changes work together.

**Acceptance Criteria:**

- [ ] `pnpm test` exits 0
- [ ] `pnpm test:e2e` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] No test files remain in `__tests__/` directories

**Dependencies:** TASK-1.1, TASK-1.2, TASK-2.1, TASK-3.10

---

─── Human Gate: Final Review ───

**Blocked tasks:** None

**Required actions:**

- [ ] Review new command tests for completeness
- [ ] Verify git history preserved after test moves
- [ ] Confirm test patterns align with skills

**Resumes at:** Complete
