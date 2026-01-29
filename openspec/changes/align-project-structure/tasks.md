# Tasks: Align Project Structure

**Plan Epic:** axm-1

## Phase 1: Reorganize CLI Commands

**Epic:** axm-1.1

### TASK-1.1 [AUTO] Move init command files to init/ directory

**Bead:** axm-1.1.1
**Implements:** proposal.md - CLI commands reorganization

**Description:**

Move init command files into the `init/` subdirectory following the CLAUDE.md structure:

- `packages/cli/src/commands/init.ts` → `packages/cli/src/commands/init/command.ts`
- `packages/cli/src/commands/init.handler.ts` → `packages/cli/src/commands/init/handler.ts`
- `packages/cli/src/commands/__tests__/init.handler.test.ts` → `packages/cli/src/commands/init/handler.test.ts`

Use `git mv` to preserve history. Update import paths within moved files.

**Acceptance Criteria:**

- [x] `packages/cli/src/commands/init/command.ts` exists with yargs command definition
- [x] `packages/cli/src/commands/init/handler.ts` exists with Effect handler
- [x] `packages/cli/src/commands/init/handler.test.ts` exists with handler tests
- [x] Old files no longer exist at previous locations
- [x] Empty `packages/cli/src/commands/__tests__/` directory removed (if empty after moves)

**Dependencies:** None

### TASK-1.2 [AUTO] Move skills command files to proper structure

**Bead:** axm-1.1.2
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

- [x] `packages/cli/src/commands/skills/command.ts` exists with yargs command definition
- [x] `packages/cli/src/commands/skills/command.test.ts` exists with command tests
- [x] `packages/cli/src/commands/skills/add/command.ts` exists with add subcommand definition
- [x] `packages/cli/src/commands/skills/add/handler.ts` exists with Effect handler
- [x] `packages/cli/src/commands/skills/add/handler.test.ts` exists with handler tests
- [x] Old files no longer exist at previous locations
- [x] Empty `packages/cli/src/commands/skills/__tests__/` directory removed

**Dependencies:** None (can run parallel with TASK-1.1)

### TASK-1.3 [AUTO] Update imports in main.ts and other files

**Bead:** axm-1.1.3
**Implements:** proposal.md - CLI commands reorganization

**Description:**

Update all import statements in files that reference the moved modules:

- `packages/cli/src/main.ts` - update imports for init and skills commands
- Any other files that import from the old paths

**Acceptance Criteria:**

- [x] `main.ts` imports from `./commands/init/command` and `./commands/skills/command`
- [x] No import errors when running `pnpm build`
- [x] No runtime errors when running `pnpm test`

**Dependencies:** TASK-1.1, TASK-1.2

### TASK-1.4 [AUTO] Clean up empty directories

**Bead:** axm-1.1.4
**Implements:** proposal.md - Remove empty directories

**Description:**

Remove any empty directories left after file moves:

- `packages/cli/src/commands/__tests__/` (if empty)
- `packages/cli/src/commands/skills/__tests__/` (if empty)
- `packages/cli/src/commands/init/` (the pre-existing empty one, before our moves)
- `packages/cli/src/commands/skills/add/` (the pre-existing empty one, before our moves)

**Acceptance Criteria:**

- [x] No empty `__tests__/` directories under `packages/cli/src/commands/`
- [x] All directories contain at least one file

**Dependencies:** TASK-1.1, TASK-1.2, TASK-1.3

## Phase 2: Verification

**Epic:** axm-1.2

### TASK-2.1 [VERIFY] Build and test pass

**Bead:** axm-1.2.1
**Implements:** design.md - Migration Plan

**Description:**

Verify the refactoring is complete and correct by running the full build and test suite.

**Acceptance Criteria:**

- [ ] `pnpm build` completes without errors
- [ ] `pnpm test` completes without failures
- [ ] `pnpm typecheck` completes without errors
- [ ] `pnpm lint` completes without errors (or only pre-existing issues)

**Dependencies:** TASK-1.4
