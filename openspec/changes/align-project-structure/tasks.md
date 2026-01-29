# Tasks: Align Project Structure

## Phase 1: Reorganize CLI Commands

### TASK-1.1 [AUTO] Move init command files to init/ directory

**Implements:** proposal.md - CLI commands reorganization

**Description:**

Move init command files into the `init/` subdirectory following the CLAUDE.md structure:

- `packages/cli/src/commands/init.ts` → `packages/cli/src/commands/init/command.ts`
- `packages/cli/src/commands/init.handler.ts` → `packages/cli/src/commands/init/handler.ts`
- `packages/cli/src/commands/__tests__/init.handler.test.ts` → `packages/cli/src/commands/init/handler.test.ts`

Use `git mv` to preserve history. Update import paths within moved files.

**Acceptance Criteria:**

- [ ] `packages/cli/src/commands/init/command.ts` exists with yargs command definition
- [ ] `packages/cli/src/commands/init/handler.ts` exists with Effect handler
- [ ] `packages/cli/src/commands/init/handler.test.ts` exists with handler tests
- [ ] Old files no longer exist at previous locations
- [ ] Empty `packages/cli/src/commands/__tests__/` directory removed (if empty after moves)

**Dependencies:** None

### TASK-1.2 [AUTO] Move skills command files to proper structure

**Implements:** proposal.md - CLI commands reorganization

**Description:**

Move skills command files to follow the CLAUDE.md structure:

- `packages/cli/src/commands/skills.ts` → `packages/cli/src/commands/skills/command.ts`
- `packages/cli/src/commands/skills.test.ts` → `packages/cli/src/commands/skills/command.test.ts`
- `packages/cli/src/commands/skills/add.ts` → `packages/cli/src/commands/skills/add/command.ts`
- `packages/cli/src/commands/skills/add.handler.ts` → `packages/cli/src/commands/skills/add/handler.ts`
- `packages/cli/src/commands/skills/__tests__/add.handler.test.ts` → `packages/cli/src/commands/skills/add/handler.test.ts`

Use `git mv` to preserve history. Update import paths within moved files.

**Acceptance Criteria:**

- [ ] `packages/cli/src/commands/skills/command.ts` exists with yargs command definition
- [ ] `packages/cli/src/commands/skills/command.test.ts` exists with command tests
- [ ] `packages/cli/src/commands/skills/add/command.ts` exists with add subcommand definition
- [ ] `packages/cli/src/commands/skills/add/handler.ts` exists with Effect handler
- [ ] `packages/cli/src/commands/skills/add/handler.test.ts` exists with handler tests
- [ ] Old files no longer exist at previous locations
- [ ] Empty `packages/cli/src/commands/skills/__tests__/` directory removed

**Dependencies:** None (can run parallel with TASK-1.1)

### TASK-1.3 [AUTO] Update imports in main.ts and other files

**Implements:** proposal.md - CLI commands reorganization

**Description:**

Update all import statements in files that reference the moved modules:

- `packages/cli/src/main.ts` - update imports for init and skills commands
- Any other files that import from the old paths

**Acceptance Criteria:**

- [ ] `main.ts` imports from `./commands/init/command` and `./commands/skills/command`
- [ ] No import errors when running `pnpm build`
- [ ] No runtime errors when running `pnpm test`

**Dependencies:** TASK-1.1, TASK-1.2

### TASK-1.4 [AUTO] Clean up empty directories

**Implements:** proposal.md - Remove empty directories

**Description:**

Remove any empty directories left after file moves:

- `packages/cli/src/commands/__tests__/` (if empty)
- `packages/cli/src/commands/skills/__tests__/` (if empty)
- `packages/cli/src/commands/init/` (the pre-existing empty one, before our moves)
- `packages/cli/src/commands/skills/add/` (the pre-existing empty one, before our moves)

**Acceptance Criteria:**

- [ ] No empty `__tests__/` directories under `packages/cli/src/commands/`
- [ ] All directories contain at least one file

**Dependencies:** TASK-1.1, TASK-1.2, TASK-1.3

## Phase 2: Verification

### TASK-2.1 [VERIFY] Build and test pass

**Implements:** design.md - Migration Plan

**Description:**

Verify the refactoring is complete and correct by running the full build and test suite.

**Acceptance Criteria:**

- [ ] `pnpm build` completes without errors
- [ ] `pnpm test` completes without failures
- [ ] `pnpm typecheck` completes without errors
- [ ] `pnpm lint` completes without errors (or only pre-existing issues)

**Dependencies:** TASK-1.4
