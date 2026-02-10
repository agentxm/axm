# Tasks: Align Tests with Guidelines

**Plan Epic:** axm-2

---

## Phase 1: Add Missing Command Tests [AUTO]

**Epic:** axm-2.1

### TASK-1.1: Add init command test [AUTO]

**Bead:** axm-2.1.1

**Implements:** DES-1

**Description:** Create `command.test.ts` for the init command to verify yargs command definition, options, and description.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/src/commands/init/command.test.ts`
- [x] Tests verify command description matches expected text
- [x] Tests verify `--yes`, `--global`, `--agent` options are defined
- [x] Tests verify option types and defaults
- [x] `pnpm test packages/cli/src/commands/init/command.test.ts` exits 0

**Dependencies:** None

---

### TASK-1.2: Add skills add command test [AUTO]

**Bead:** axm-2.1.2

**Implements:** DES-1

**Description:** Create `command.test.ts` for the skills add command to verify yargs command definition, positional source argument, and all options.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/src/commands/skills/add/command.test.ts`
- [x] Tests verify command description
- [x] Tests verify `source` positional argument
- [x] Tests verify options: `--global`, `--agent`, `--skill`, `--yes`, `--list`, `--all`
- [x] Tests verify option types (string, array, boolean)
- [x] `pnpm test packages/cli/src/commands/skills/add/command.test.ts` exits 0

**Dependencies:** None

---

## Phase 2: Add E2E Root Command Test [AUTO]

**Epic:** axm-2.2

### TASK-2.1: Add root command E2E test [AUTO]

**Bead:** axm-2.2.1

**Implements:** DES-3

**Description:** Add E2E test verifying `axm` (no arguments) displays help and exits with code 0, per CLI spec requirement for "Root Command Behavior."

**Acceptance Criteria:**

- [x] Test added to `packages/cli/e2e/root.test.ts` (new file)
- [x] Test verifies exit code 0 when running `axm` without arguments
- [x] Test verifies output contains available commands (`init`, `skills`)
- [x] Test verifies output contains examples
- [x] `pnpm test:e2e packages/cli/e2e/root.test.ts` exits 0

**Dependencies:** None

---

## Phase 3: Relocate Core Tests [AUTO]

**Epic:** axm-2.3

### TASK-3.1: Relocate source-parser test [AUTO]

**Bead:** axm-2.3.1

**Implements:** DES-2

**Description:** Move `source-parser.test.ts` from `__tests__/` to colocate with `source-parser.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/source-parser.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/source-parser.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.2: Relocate content-hash test [AUTO]

**Bead:** axm-2.3.2

**Implements:** DES-2

**Description:** Move `content-hash.test.ts` from `__tests__/` to colocate with `content-hash.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/content-hash.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/content-hash.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.3: Relocate settings test [AUTO]

**Bead:** axm-2.3.3

**Implements:** DES-2

**Description:** Move `settings.test.ts` from `__tests__/` to colocate with `settings.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/settings.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/settings.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.4: Relocate skill-discovery test [AUTO]

**Bead:** axm-2.3.4

**Implements:** DES-2

**Description:** Move `skill-discovery.test.ts` from `__tests__/` to colocate with `skill-discovery.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/skill-discovery.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/skill-discovery.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.5: Relocate lockfile test [AUTO]

**Bead:** axm-2.3.5

**Implements:** DES-2

**Description:** Move `lockfile.test.ts` from `__tests__/` to colocate with `lockfile.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/lockfile.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/lockfile.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.6: Relocate git test [AUTO]

**Bead:** axm-2.3.6

**Implements:** DES-2

**Description:** Move `git.test.ts` from `__tests__/` to colocate with `git.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/git.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/git.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.7: Relocate wellknown test [AUTO]

**Bead:** axm-2.3.7

**Implements:** DES-2

**Description:** Move `wellknown.test.ts` from `__tests__/` to colocate with `wellknown.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/wellknown.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/wellknown.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.8: Relocate agent-detection test [AUTO]

**Bead:** axm-2.3.8

**Implements:** DES-2

**Description:** Move `agent-detection.test.ts` from `__tests__/` to colocate with `agent-detection.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/agent-detection.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/agent-detection.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.9: Relocate installer test [AUTO]

**Bead:** axm-2.3.9

**Implements:** DES-2

**Description:** Move `installer.test.ts` from `__tests__/` to colocate with `installer.ts`.

**Acceptance Criteria:**

- [x] Test file moved using `git mv`
- [x] New location: `packages/core/src/experimental/skills/installer.test.ts`
- [x] All imports updated if needed
- [x] `pnpm test packages/core/src/experimental/skills/installer.test.ts` exits 0

**Dependencies:** None

---

### TASK-3.10: Remove empty **tests** directory [AUTO]

**Bead:** axm-2.3.10

**Implements:** DES-2

**Description:** After all test relocations, remove the now-empty `__tests__/` directory.

**Acceptance Criteria:**

- [x] Directory `packages/core/src/experimental/skills/__tests__/` removed
- [x] No test files remain in `__tests__/` directories under `packages/core/`
- [x] `pnpm test` passes (all tests still run)

**Dependencies:** TASK-3.1, TASK-3.2, TASK-3.3, TASK-3.4, TASK-3.5, TASK-3.6, TASK-3.7, TASK-3.8, TASK-3.9

---

## Phase 4: Verification [VERIFY]

**Epic:** axm-2.4

### TASK-4.1: Run full test suite [VERIFY]

**Bead:** axm-2.4.1

**Implements:** All

**Description:** Run complete test suite to verify all changes work together.

**Acceptance Criteria:**

- [x] `pnpm test` exits 0
- [x] `pnpm test:e2e` exits 0
- [x] `pnpm typecheck` exits 0
- [x] No test files remain in `__tests__/` directories

**Dependencies:** TASK-1.1, TASK-1.2, TASK-2.1, TASK-3.10

---

─── Human Gate: Final Review ───

**Blocked tasks:** None

**Required actions:**

- [ ] Review new command tests for completeness
- [ ] Verify git history preserved after test moves
- [ ] Confirm test patterns align with skills

**Resumes at:** Complete
