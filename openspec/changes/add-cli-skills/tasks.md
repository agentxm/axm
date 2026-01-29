# Tasks: Add CLI Skills Command

## Phase 1: Core Domain Types and Services [AUTO]

### TASK-1.1: Create types module [AUTO]

**Implements:** cli-skills-add

**Description:** Define core domain types for skills management.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/types.ts`
- [ ] Exports `Skill`, `AgentConfig`, `ParsedSource`, `Settings`, `LockEntry` types
- [ ] Types align with design.md specifications

**Dependencies:** None

### TASK-1.2: Create source-parser module [AUTO]

**Implements:** cli-skills-add

**Description:** Parse source strings (github, gitlab, git, local, direct-url, well-known).

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/source-parser.ts`
- [ ] Parses GitHub shorthand (`owner/repo`, `owner/repo@ref`)
- [ ] Parses GitHub/GitLab URLs with branch and path extraction
- [ ] Parses local paths (relative and absolute, POSIX and Windows)
- [ ] Normalizes to canonical notation per design.md

**Dependencies:** TASK-1.1

### TASK-1.3: Create agent-detection module [AUTO]

**Implements:** cli-init, cli-skills-add

**Description:** Detect installed AI coding agents by checking configuration directories.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/agent-detection.ts`
- [ ] Detects Claude Code, Cursor, Codex, and 30+ other supported agents
- [ ] Returns list of detected agents with their config paths
- [ ] Runs detection concurrently for speed

**Dependencies:** TASK-1.1

### TASK-1.4: Create skill-discovery module [AUTO]

**Implements:** cli-skills-add

**Description:** Find SKILL.md files in directories.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/skill-discovery.ts`
- [ ] Discovers all SKILL.md files (case-insensitive) in a directory tree
- [ ] Returns skill metadata including name and path

**Dependencies:** TASK-1.1

### TASK-1.5: Create installer module [AUTO]

**Implements:** cli-skills-add

**Description:** Install skills to agent directories using symlinks with copy fallback.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/installer.ts`
- [ ] Creates symlinks from agent skill directories to canonical `.axm/skills/`
- [ ] Falls back to copy when symlink fails
- [ ] Uses `path.relative()` for portable symlink targets

**Dependencies:** TASK-1.1

### TASK-1.6: Create settings module [AUTO]

**Implements:** cli-init, cli-skills-add

**Description:** Read/write `.axm/settings.json` for user preferences and installed skills.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/settings.ts`
- [ ] Reads and writes JSON with version, agents, and skills fields
- [ ] Merges new skills without losing existing entries
- [ ] Stores canonical source notation
- [ ] Exports `ensureInitialized()` for implicit initialization

**Dependencies:** TASK-1.1

### TASK-1.7: Create lockfile module [AUTO]

**Implements:** cli-skills-add

**Description:** Read/write `.axm/axm.lock` (YAML) for version tracking.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/lockfile.ts`
- [ ] Reads and writes YAML with version and skills fields
- [ ] Stores source, skillPath, commitSha, contentHash, installedAt, updatedAt
- [ ] Partial updates preserve existing entries

**Dependencies:** TASK-1.1

### TASK-1.8: Create content-hash module [AUTO]

**Implements:** cli-skills-add

**Description:** Compute deterministic content hashes for skill directories.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/content-hash.ts`
- [ ] Computes SHA-256 hash from sorted file paths and contents
- [ ] Hash is deterministic for same content
- [ ] Hash is independent of file system metadata (timestamps, permissions)

**Dependencies:** TASK-1.1

### TASK-1.9: Create git module [AUTO]

**Implements:** cli-skills-add

**Description:** Git operations for cloning repositories at specific refs.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/git.ts`
- [ ] Clones repositories at specified refs (tags, branches, SHAs)
- [ ] Uses `stdio: 'inherit'` to allow SSH passphrase prompts
- [ ] Resolves refs to commit SHAs for lockfile

**Dependencies:** TASK-1.1

### TASK-1.10: Create index module with exports [AUTO]

**Implements:** cli-skills-add

**Description:** Public exports for the skills subpath.

**Acceptance Criteria:**

- [ ] File exists at `packages/core/src/experimental/skills/index.ts`
- [ ] Exports all public functions and types from submodules

**Dependencies:** TASK-1.2, TASK-1.3, TASK-1.4, TASK-1.5, TASK-1.6, TASK-1.7, TASK-1.8, TASK-1.9

### TASK-1.11: Add subpath export to package.json [AUTO]

**Implements:** cli-skills-add

**Description:** Configure `./experimental/skills` subpath export in core package.

**Acceptance Criteria:**

- [ ] `packages/core/package.json` exports `./experimental/skills`
- [ ] Types and import paths resolve correctly
- [ ] `pnpm build` succeeds

**Dependencies:** TASK-1.10

## Phase 2: Unit Tests [AUTO]

### TASK-2.1: Add source-parser tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for source parsing (all source types).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/source-parser.test.ts`
- [ ] Tests GitHub shorthand parsing
- [ ] Tests URL parsing with refs and paths
- [ ] Tests local path detection (POSIX and Windows)
- [ ] Tests canonical notation output
- [ ] `pnpm test source-parser` passes

**Dependencies:** TASK-1.2

### TASK-2.2: Add agent-detection tests [AUTO]

**Implements:** cli-init, cli-skills-add

**Description:** Unit tests for agent detection (mock filesystem).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/agent-detection.test.ts`
- [ ] Tests detection of various agent config directories
- [ ] Tests behavior when no agents detected
- [ ] `pnpm test agent-detection` passes

**Dependencies:** TASK-1.3

### TASK-2.3: Add skill-discovery tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for skill discovery (mock filesystem).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/skill-discovery.test.ts`
- [ ] Tests discovery of SKILL.md files
- [ ] Tests case-insensitivity
- [ ] Tests nested directory traversal
- [ ] `pnpm test skill-discovery` passes

**Dependencies:** TASK-1.4

### TASK-2.4: Add installer tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for installation logic (mock filesystem).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/installer.test.ts`
- [ ] Tests symlink creation with relative paths
- [ ] Tests copy fallback on symlink failure
- [ ] Tests path construction correctness
- [ ] `pnpm test installer` passes

**Dependencies:** TASK-1.5

### TASK-2.5: Add settings tests [AUTO]

**Implements:** cli-init, cli-skills-add

**Description:** Unit tests for settings read/write (mock filesystem).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/settings.test.ts`
- [ ] Tests JSON round-trip
- [ ] Tests merge behavior
- [ ] Tests default values
- [ ] `pnpm test settings` passes

**Dependencies:** TASK-1.6

### TASK-2.6: Add lockfile tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for lockfile read/write (mock filesystem).

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/lockfile.test.ts`
- [ ] Tests YAML round-trip
- [ ] Tests partial updates
- [ ] Tests timestamp formatting (ISO 8601)
- [ ] `pnpm test lockfile` passes

**Dependencies:** TASK-1.7

### TASK-2.7: Add content-hash tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for content hash computation.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/content-hash.test.ts`
- [ ] Tests deterministic output for same content
- [ ] Tests hash changes when content changes
- [ ] Tests hash ignores metadata (timestamps)
- [ ] `pnpm test content-hash` passes

**Dependencies:** TASK-1.8

### TASK-2.8: Add git tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for git operations.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/core/src/experimental/skills/__tests__/git.test.ts`
- [ ] Tests ref resolution (tags, branches, SHAs)
- [ ] Tests error handling for invalid refs
- [ ] `pnpm test git` passes

**Dependencies:** TASK-1.9

## Phase 3: CLI Init Command [AUTO]

### TASK-3.1: Create init command definition [AUTO]

**Implements:** cli-init

**Description:** Yargs command definition for `axm init`.

**Acceptance Criteria:**

- [ ] File exists at `packages/cli/src/commands/init.ts`
- [ ] Registers as `axm init` command
- [ ] Defines `--global`, `--agent`, `--yes` flags

**Dependencies:** TASK-1.11

### TASK-3.2: Create init handler [AUTO]

**Implements:** cli-init

**Description:** Effect-based handler orchestrating the init flow.

**Acceptance Criteria:**

- [ ] File exists at `packages/cli/src/commands/init.handler.ts`
- [ ] Detects installed agents
- [ ] Prompts for agent selection (interactive mode)
- [ ] Creates `.axm/settings.json` with selected agents
- [ ] Handles already-initialized case gracefully

**Dependencies:** TASK-3.1, TASK-1.3, TASK-1.6

### TASK-3.3: Add init handler unit tests [AUTO]

**Implements:** cli-init

**Description:** Unit tests for the init handler Effect function with mock services.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/src/commands/__tests__/init.handler.test.ts`
- [ ] Tests first-time initialization flow
- [ ] Tests already-initialized case
- [ ] Tests non-interactive mode (--yes flag)
- [ ] Tests --agent flag with explicit agents
- [ ] `pnpm test init.handler` passes

**Dependencies:** TASK-3.2

## Phase 4: CLI Skills Parent Command [AUTO]

### TASK-4.1: Create skills parent command [AUTO]

**Implements:** cli-skills

**Description:** Parent command with help and sub-command routing.

**Acceptance Criteria:**

- [ ] File exists at `packages/cli/src/commands/skills.ts`
- [ ] Registers as `axm skills` command
- [ ] Shows available sub-commands when invoked without arguments
- [ ] `axm skills --help` displays usage

**Dependencies:** TASK-1.11

## Phase 5: CLI Skills Add Subcommand [AUTO]

### TASK-5.1: Create add command definition [AUTO]

**Implements:** cli-skills-add

**Description:** Yargs command definition for `axm skills add`.

**Acceptance Criteria:**

- [ ] File exists at `packages/cli/src/commands/skills/add.ts`
- [ ] Defines `source` positional argument
- [ ] Defines `--global`, `--agent`, `--skill`, `--yes`, `--list`, `--all` flags

**Dependencies:** TASK-4.1

### TASK-5.2: Create add handler [AUTO]

**Implements:** cli-skills-add

**Description:** Effect-based handler orchestrating the add flow.

**Acceptance Criteria:**

- [ ] File exists at `packages/cli/src/commands/skills/add.handler.ts`
- [ ] Uses Effect services for all I/O
- [ ] Implements full flow: parse source, detect agents, discover skills, prompt, install

**Dependencies:** TASK-5.1, TASK-1.11

### TASK-5.3: Implement interactive prompts [AUTO]

**Implements:** cli-skills-add

**Description:** Interactive multi-select UI using @clack/prompts.

**Acceptance Criteria:**

- [ ] Agent selection prompt when multiple agents detected
- [ ] Skill selection prompt when multiple skills available
- [ ] Spinner during async operations
- [ ] Confirmation before installation

**Dependencies:** TASK-5.2, TASK-6.1

### TASK-5.4: Add handler unit tests [AUTO]

**Implements:** cli-skills-add

**Description:** Unit tests for the add handler Effect function with mock services.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/src/commands/skills/__tests__/add.handler.test.ts`
- [ ] Tests full flow with mock services (SourceParser, SkillDiscovery, AgentDetection, Installer, etc.)
- [ ] Tests error handling scenarios (invalid source, no skills found, no agents detected)
- [ ] Tests non-interactive mode (--yes, --all flags)
- [ ] `pnpm test add.handler` passes

**Dependencies:** TASK-5.2

## Phase 6: Dependencies [AUTO]

### TASK-6.1: Add @clack/prompts dependency [AUTO]

**Implements:** cli-skills-add, cli-init

**Description:** Add interactive UI library to CLI package.

**Acceptance Criteria:**

- [ ] `@clack/prompts` in `packages/cli/package.json` dependencies
- [ ] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.2: Add picocolors dependency [AUTO]

**Implements:** cli-skills-add, cli-init

**Description:** Add terminal colors library to CLI package.

**Acceptance Criteria:**

- [ ] `picocolors` in `packages/cli/package.json` dependencies
- [ ] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.3: Add simple-git dependency [AUTO]

**Implements:** cli-skills-add

**Description:** Add git operations library to core package.

**Acceptance Criteria:**

- [ ] `simple-git` in `packages/core/package.json` dependencies
- [ ] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.4: Add yaml dependency [AUTO]

**Implements:** cli-skills-add

**Description:** Add YAML library to core package.

**Acceptance Criteria:**

- [ ] `yaml` in `packages/core/package.json` dependencies
- [ ] `pnpm install` succeeds

**Dependencies:** None

## Phase 7: E2E Tests [AUTO]

### TASK-7.1: Set up E2E test infrastructure [AUTO]

**Implements:** cli-init, cli-skills, cli-skills-add

**Description:** Set up E2E test infrastructure with execa and test utilities.

**Acceptance Criteria:**

- [ ] `execa` added to `packages/cli` devDependencies
- [ ] `packages/cli/e2e/` directory created
- [ ] Test utility for running CLI and capturing result
- [ ] Test utility for creating/cleaning temp directories
- [ ] Local path fixture with mock SKILL.md files

**Dependencies:** TASK-5.2

### TASK-7.2: Add init and skills command E2E tests [AUTO]

**Implements:** cli-init, cli-skills

**Description:** E2E tests for `axm init` and `axm skills` commands.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/e2e/init.test.ts`
- [ ] Tests `axm init --yes` creates settings file
- [ ] Test file exists at `packages/cli/e2e/skills.test.ts`
- [ ] Tests `axm skills` shows help and available subcommands
- [ ] Tests `axm skills --help` displays usage
- [ ] `pnpm test:e2e init skills` passes

**Dependencies:** TASK-7.1, TASK-3.2, TASK-4.1

### TASK-7.3: Add skills add E2E tests [AUTO]

**Implements:** cli-skills-add

**Description:** E2E tests for `axm skills add` command.

**Acceptance Criteria:**

- [ ] Test file exists at `packages/cli/e2e/skills-add.test.ts`
- [ ] Tests `axm skills add <local> --list` lists available skills
- [ ] Tests `axm skills add <local> --all --yes` installs skills, creates `.axm/` structure
- [ ] Tests `axm skills add <invalid>` shows error, exits non-zero
- [ ] Tests file system state after installation (settings.json, axm.lock, symlinks)
- [ ] `pnpm test:e2e skills-add` passes

**Dependencies:** TASK-7.1, TASK-5.3

## Phase 8: Documentation [AUTO]

### TASK-8.1: Update CLI help text [AUTO]

**Implements:** cli-init, cli-skills, cli-skills-add

**Description:** Ensure help text is clear and includes examples.

**Acceptance Criteria:**

- [ ] `axm init --help` shows clear descriptions
- [ ] `axm skills --help` shows clear descriptions
- [ ] `axm skills add --help` shows usage examples
- [ ] Help text matches spec scenarios

**Dependencies:** TASK-4.1, TASK-5.1

───── Human Gate: Final Verification ─────

**Blocked tasks:** None (final gate)

**Required actions:**

- [ ] Run `pnpm test` and verify all unit tests pass
- [ ] Run `pnpm test:e2e` and verify all E2E tests pass
- [ ] Run `pnpm typecheck` and verify no errors
- [ ] Run `pnpm lint` and verify no warnings
- [ ] Manual test: `axm skills add owner/repo --list` with a real GitHub repository

**Resumes at:** Implementation complete

## Traceability Matrix

| Spec           | Tasks                                                                | Status  |
| -------------- | -------------------------------------------------------------------- | ------- |
| cli-init       | TASK-3.1, TASK-3.2, TASK-3.3, TASK-7.2, TASK-8.1                     | Pending |
| cli-skills     | TASK-4.1, TASK-7.2, TASK-8.1                                         | Pending |
| cli-skills-add | TASK-1._, TASK-2._, TASK-5._, TASK-6._, TASK-7.1, TASK-7.3, TASK-8.1 | Pending |
