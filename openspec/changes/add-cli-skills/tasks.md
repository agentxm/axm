# Tasks: Add CLI Skills Command

**Plan Epic:** axm-2

## Phase 1: Core Domain Types and Services [AUTO]

**Epic:** axm-2.1

### TASK-1.1: Create types module [AUTO]

**Bead:** axm-2.1.1 **Implements:** cli-skills-add

**Description:** Define core domain types for skills management.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/types.ts`
- [x] Exports `Skill`, `AgentConfig`, `ParsedSource`, `Settings`, `LockEntry` types
- [x] Types align with design.md specifications

**Dependencies:** None

### TASK-1.2: Create source-parser module [AUTO]

**Bead:** axm-2.1.2 **Implements:** cli-skills-add

**Description:** Parse source strings (github, gitlab, git, local, direct-url, well-known).

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/source-parser.ts`
- [x] Parses GitHub shorthand (`owner/repo`, `owner/repo@ref`)
- [x] Parses GitHub/GitLab URLs with branch and path extraction
- [x] Parses local paths (relative and absolute, POSIX and Windows)
- [x] Normalizes to canonical notation per design.md

**Dependencies:** TASK-1.1

### TASK-1.3: Create agent-detection module [AUTO]

**Bead:** axm-2.1.3 **Implements:** cli-init, cli-skills-add

**Description:** Detect installed AI coding agents by checking configuration directories.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/agent-detection.ts`
- [x] Detects Claude Code, Cursor, Codex, and 30+ other supported agents
- [x] Returns list of detected agents with their config paths
- [x] Runs detection concurrently for speed

**Dependencies:** TASK-1.1

### TASK-1.4: Create skill-discovery module [AUTO]

**Bead:** axm-2.1.4 **Implements:** cli-skills-add

**Description:** Find SKILL.md files in directories.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/skill-discovery.ts`
- [x] Discovers all SKILL.md files (case-insensitive) in a directory tree
- [x] Returns skill metadata including name and path

**Dependencies:** TASK-1.1

### TASK-1.5: Create installer module [AUTO]

**Bead:** axm-2.1.5 **Implements:** cli-skills-add

**Description:** Install skills to agent directories using symlinks with copy fallback.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/installer.ts`
- [x] Creates symlinks from agent skill directories to canonical `.axm/skills/`
- [x] Falls back to copy when symlink fails
- [x] Uses `path.relative()` for portable symlink targets

**Dependencies:** TASK-1.1

### TASK-1.6: Create settings module [AUTO]

**Bead:** axm-2.1.6 **Implements:** cli-init, cli-skills-add

**Description:** Read/write `.axm/settings.json` for user preferences and installed skills.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/settings.ts`
- [x] Reads and writes JSON with version, agents, and skills fields
- [x] Merges new skills without losing existing entries
- [x] Stores canonical source notation
- [x] Exports `ensureInitialized()` for implicit initialization

**Dependencies:** TASK-1.1

### TASK-1.7: Create lockfile module [AUTO]

**Bead:** axm-2.1.7 **Implements:** cli-skills-add

**Description:** Read/write `.axm/axm.lock` (YAML) for version tracking.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/lockfile.ts`
- [x] Reads and writes YAML with version and skills fields
- [x] Stores source, skillPath, commitSha, contentHash, installedAt, updatedAt
- [x] Partial updates preserve existing entries

**Dependencies:** TASK-1.1

### TASK-1.8: Create content-hash module [AUTO]

**Bead:** axm-2.1.8 **Implements:** cli-skills-add

**Description:** Compute deterministic content hashes for skill directories.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/content-hash.ts`
- [x] Computes SHA-256 hash from sorted file paths and contents
- [x] Hash is deterministic for same content
- [x] Hash is independent of file system metadata (timestamps, permissions)

**Dependencies:** TASK-1.1

### TASK-1.9: Create git module [AUTO]

**Bead:** axm-2.1.9 **Implements:** cli-skills-add

**Description:** Git operations for cloning repositories at specific refs.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/git.ts`
- [x] Clones repositories at specified refs (tags, branches, SHAs)
- [x] Uses `stdio: 'inherit'` to allow SSH passphrase prompts
- [x] Resolves refs to commit SHAs for lockfile

**Dependencies:** TASK-1.1

### TASK-1.9a: Create wellknown module [AUTO]

**Bead:** axm-2.1.10 **Implements:** cli-skills-add

**Description:** Well-known skills discovery per RFC 8615.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/wellknown.ts`
- [x] Fetches `/.well-known/skills/index.json` from HTTP(S) hosts
- [x] Validates index structure (skills array with name, description, files)
- [x] Fetches all files listed in index entry, not just SKILL.md
- [x] Excludes GitHub/GitLab hosts (handled separately)

**Dependencies:** TASK-1.1

### TASK-1.10: Create index module with exports [AUTO]

**Bead:** axm-2.1.11 **Implements:** cli-skills-add

**Description:** Public exports for the skills subpath.

**Acceptance Criteria:**

- [x] File exists at `packages/core/src/experimental/skills/index.ts`
- [x] Exports all public functions and types from submodules

**Dependencies:** TASK-1.2, TASK-1.3, TASK-1.4, TASK-1.5, TASK-1.6, TASK-1.7, TASK-1.8, TASK-1.9, TASK-1.9a

### TASK-1.11: Add subpath export to package.json [AUTO]

**Bead:** axm-2.1.12 **Implements:** cli-skills-add

**Description:** Configure `./experimental/skills` subpath export in core package.

**Acceptance Criteria:**

- [x] `packages/core/package.json` exports `./experimental/skills`
- [x] Types and import paths resolve correctly
- [x] `pnpm build` succeeds

**Dependencies:** TASK-1.10

## Phase 2: Unit Tests [AUTO]

**Epic:** axm-2.2

### TASK-2.1: Add source-parser tests [AUTO]

**Bead:** axm-2.2.1 **Implements:** cli-skills-add

**Description:** Unit tests for source parsing (all source types).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/source-parser.test.ts`
- [x] Tests GitHub shorthand parsing
- [x] Tests URL parsing with refs and paths
- [x] Tests local path detection (POSIX and Windows)
- [x] Tests canonical notation output
- [x] `pnpm test source-parser` passes

**Dependencies:** TASK-1.2

### TASK-2.2: Add agent-detection tests [AUTO]

**Bead:** axm-2.2.2 **Implements:** cli-init, cli-skills-add

**Description:** Unit tests for agent detection (mock filesystem).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/agent-detection.test.ts`
- [x] Tests detection of various agent config directories
- [x] Tests behavior when no agents detected
- [x] `pnpm test agent-detection` passes

**Dependencies:** TASK-1.3

### TASK-2.3: Add skill-discovery tests [AUTO]

**Bead:** axm-2.2.3 **Implements:** cli-skills-add

**Description:** Unit tests for skill discovery (mock filesystem).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/skill-discovery.test.ts`
- [x] Tests discovery of SKILL.md files
- [x] Tests case-insensitivity
- [x] Tests nested directory traversal
- [x] `pnpm test skill-discovery` passes

**Dependencies:** TASK-1.4

### TASK-2.4: Add installer tests [AUTO]

**Bead:** axm-2.2.4 **Implements:** cli-skills-add

**Description:** Unit tests for installation logic (mock filesystem).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/installer.test.ts`
- [x] Tests symlink creation with relative paths
- [x] Tests copy fallback on symlink failure
- [x] Tests path construction correctness
- [x] `pnpm test installer` passes

**Dependencies:** TASK-1.5

### TASK-2.5: Add settings tests [AUTO]

**Bead:** axm-2.2.5 **Implements:** cli-init, cli-skills-add

**Description:** Unit tests for settings read/write (mock filesystem).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/settings.test.ts`
- [x] Tests JSON round-trip
- [x] Tests merge behavior
- [x] Tests default values
- [x] `pnpm test settings` passes

**Dependencies:** TASK-1.6

### TASK-2.6: Add lockfile tests [AUTO]

**Bead:** axm-2.2.6 **Implements:** cli-skills-add

**Description:** Unit tests for lockfile read/write (mock filesystem).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/lockfile.test.ts`
- [x] Tests YAML round-trip
- [x] Tests partial updates
- [x] Tests timestamp formatting (ISO 8601)
- [x] `pnpm test lockfile` passes

**Dependencies:** TASK-1.7

### TASK-2.7: Add content-hash tests [AUTO]

**Bead:** axm-2.2.7 **Implements:** cli-skills-add

**Description:** Unit tests for content hash computation.

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/content-hash.test.ts`
- [x] Tests deterministic output for same content
- [x] Tests hash changes when content changes
- [x] Tests hash ignores metadata (timestamps)
- [x] `pnpm test content-hash` passes

**Dependencies:** TASK-1.8

### TASK-2.8: Add git tests [AUTO]

**Bead:** axm-2.2.8 **Implements:** cli-skills-add

**Description:** Unit tests for git operations.

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/git.test.ts`
- [x] Tests ref resolution (tags, branches, SHAs)
- [x] Tests error handling for invalid refs
- [x] `pnpm test git` passes

**Dependencies:** TASK-1.9

### TASK-2.9: Add wellknown tests [AUTO]

**Bead:** axm-2.2.9 **Implements:** cli-skills-add

**Description:** Unit tests for well-known discovery (mock HTTP).

**Acceptance Criteria:**

- [x] Test file exists at `packages/core/src/experimental/skills/__tests__/wellknown.test.ts`
- [x] Tests index fetching and validation
- [x] Tests multi-file skill fetching
- [x] Tests error handling (404, invalid index)
- [x] `pnpm test wellknown` passes

**Dependencies:** TASK-1.9a

## Phase 3: CLI Init Command [AUTO]

**Epic:** axm-2.3

### TASK-3.1: Create init command definition [AUTO]

**Bead:** axm-2.3.1 **Implements:** cli-init

**Description:** Yargs command definition for `axm init`.

**Acceptance Criteria:**

- [x] File exists at `packages/cli/src/commands/init.ts`
- [x] Registers as `axm init` command
- [x] Defines `--global`, `--agent`, `--yes` flags

**Dependencies:** TASK-1.11

### TASK-3.2: Create init handler [AUTO]

**Bead:** axm-2.3.2 **Implements:** cli-init

**Description:** Effect-based handler orchestrating the init flow.

**Acceptance Criteria:**

- [x] File exists at `packages/cli/src/commands/init.handler.ts`
- [x] Detects installed agents
- [x] Prompts for agent selection (interactive mode)
- [x] Creates `.axm/settings.json` with selected agents
- [x] Handles already-initialized case gracefully

**Dependencies:** TASK-3.1, TASK-1.3, TASK-1.6

### TASK-3.3: Add init handler unit tests [AUTO]

**Bead:** axm-2.3.3 **Implements:** cli-init

**Description:** Unit tests for the init handler Effect function with mock services.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/src/commands/__tests__/init.handler.test.ts`
- [x] Tests first-time initialization flow
- [x] Tests already-initialized case
- [x] Tests non-interactive mode (--yes flag)
- [x] Tests --agent flag with explicit agents
- [x] `pnpm test init.handler` passes

**Dependencies:** TASK-3.2

## Phase 4: CLI Skills Parent Command [AUTO]

**Epic:** axm-2.4

### TASK-4.1: Create skills parent command [AUTO]

**Bead:** axm-2.4.1 **Implements:** cli-skills

**Description:** Parent command with help and sub-command routing.

**Acceptance Criteria:**

- [x] File exists at `packages/cli/src/commands/skills.ts`
- [x] Registers as `axm skills` command
- [x] Shows available sub-commands when invoked without arguments
- [x] `axm skills --help` displays usage

**Dependencies:** TASK-1.11

## Phase 5: CLI Skills Add Subcommand [AUTO]

**Epic:** axm-2.5

### TASK-5.1: Create add command definition [AUTO]

**Bead:** axm-2.5.1 **Implements:** cli-skills-add

**Description:** Yargs command definition for `axm skills add`.

**Acceptance Criteria:**

- [x] File exists at `packages/cli/src/commands/skills/add.ts`
- [x] Defines `source` positional argument
- [x] Defines `--global`, `--agent`, `--skill`, `--yes`, `--list`, `--all` flags

**Dependencies:** TASK-4.1

### TASK-5.2: Create add handler [AUTO]

**Bead:** axm-2.5.2 **Implements:** cli-skills-add

**Description:** Effect-based handler orchestrating the add flow.

**Acceptance Criteria:**

- [x] File exists at `packages/cli/src/commands/skills/add.handler.ts`
- [x] Uses Effect services for all I/O
- [x] Implements full flow: parse source, detect agents, discover skills, prompt, install

**Dependencies:** TASK-5.1, TASK-1.11

### TASK-5.3: Implement interactive prompts [AUTO]

**Bead:** axm-2.5.3 **Implements:** cli-skills-add

**Description:** Interactive multi-select UI using @clack/prompts.

**Acceptance Criteria:**

- [x] Agent selection prompt when multiple agents detected
- [x] Skill selection prompt when multiple skills available
- [x] Spinner during async operations
- [x] Confirmation before installation

**Dependencies:** TASK-5.2, TASK-6.1

### TASK-5.4: Add handler unit tests [AUTO]

**Bead:** axm-2.5.4 **Implements:** cli-skills-add

**Description:** Unit tests for the add handler Effect function with mock services.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/src/commands/skills/__tests__/add.handler.test.ts`
- [x] Tests full flow with mock services (SourceParser, SkillDiscovery, AgentDetection, Installer, etc.)
- [x] Tests error handling scenarios (invalid source, no skills found, no agents detected)
- [x] Tests non-interactive mode (--yes, --all flags)
- [x] `pnpm test add.handler` passes

**Dependencies:** TASK-5.2

## Phase 6: Dependencies [AUTO]

**Epic:** axm-2.6

### TASK-6.1: Add @clack/prompts dependency [AUTO]

**Bead:** axm-2.6.1 **Implements:** cli-skills-add, cli-init

**Description:** Add interactive UI library to CLI package.

**Acceptance Criteria:**

- [x] `@clack/prompts` in `packages/cli/package.json` dependencies
- [x] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.2: Add picocolors dependency [AUTO]

**Bead:** axm-2.6.2 **Implements:** cli-skills-add, cli-init

**Description:** Add terminal colors library to CLI package.

**Acceptance Criteria:**

- [x] `picocolors` in `packages/cli/package.json` dependencies
- [x] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.3: Add simple-git dependency [AUTO]

**Bead:** axm-2.6.3 **Implements:** cli-skills-add

**Description:** Add git operations library to core package.

**Acceptance Criteria:**

- [x] `simple-git` in `packages/core/package.json` dependencies
- [x] `pnpm install` succeeds

**Dependencies:** None

### TASK-6.4: Add yaml dependency [AUTO]

**Bead:** axm-2.6.4 **Implements:** cli-skills-add

**Description:** Add YAML library to core package.

**Acceptance Criteria:**

- [x] `yaml` in `packages/core/package.json` dependencies
- [x] `pnpm install` succeeds

**Dependencies:** None

## Phase 7: E2E Tests [AUTO]

**Epic:** axm-2.7

### TASK-7.1: Set up E2E test infrastructure [AUTO]

**Bead:** axm-2.7.1 **Implements:** cli-init, cli-skills, cli-skills-add

**Description:** Set up E2E test infrastructure with execa and test utilities.

**Acceptance Criteria:**

- [x] `execa` added to `packages/cli` devDependencies
- [x] `packages/cli/e2e/` directory created
- [x] Test utility for running CLI and capturing result
- [x] Test utility for creating/cleaning temp directories
- [x] Local path fixture with mock SKILL.md files

**Dependencies:** TASK-5.2

### TASK-7.2: Add init and skills command E2E tests [AUTO]

**Bead:** axm-2.7.2 **Implements:** cli-init, cli-skills

**Description:** E2E tests for `axm init` and `axm skills` commands.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/e2e/init.test.ts`
- [x] Tests `axm init --yes` creates settings file
- [x] Test file exists at `packages/cli/e2e/skills.test.ts`
- [x] Tests `axm skills` shows help and available subcommands
- [x] Tests `axm skills --help` displays usage
- [x] `pnpm test:e2e init skills` passes

**Dependencies:** TASK-7.1, TASK-3.2, TASK-4.1

### TASK-7.3: Add skills add E2E tests [AUTO]

**Bead:** axm-2.7.3 **Implements:** cli-skills-add

**Description:** E2E tests for `axm skills add` command.

**Acceptance Criteria:**

- [x] Test file exists at `packages/cli/e2e/skills-add.test.ts`
- [x] Tests `axm skills add <local> --list` lists available skills
- [x] Tests `axm skills add <local> --all --yes` installs skills, creates `.axm/` structure
- [x] Tests `axm skills add <invalid>` shows error, exits non-zero
- [x] Tests `axm skills add <well-known-url> --list` discovers skills from index.json
- [x] Tests file system state after installation (settings.json, axm.lock, symlinks)
- [x] `pnpm test:e2e skills-add` passes

**Dependencies:** TASK-7.1, TASK-5.3

## Phase 8: Documentation [AUTO]

**Epic:** axm-2.8

### TASK-8.1: Update CLI help text [AUTO]

**Bead:** axm-2.8.1 **Implements:** cli-init, cli-skills, cli-skills-add

**Description:** Ensure help text is clear and includes examples.

**Acceptance Criteria:**

- [x] `axm init --help` shows clear descriptions
- [x] `axm skills --help` shows clear descriptions
- [x] `axm skills add --help` shows usage examples
- [x] Help text matches spec scenarios

**Dependencies:** TASK-4.1, TASK-5.1

───── Human Gate: Final Verification ─────

**Bead:** axm-2.9

**Blocked tasks:** None (final gate)

**Required actions:**

- [ ] Run `pnpm test` and verify all unit tests pass
- [ ] Run `pnpm test:e2e` and verify all E2E tests pass
- [ ] Run `pnpm typecheck` and verify no errors
- [ ] Run `pnpm lint` and verify no warnings
- [ ] Manual test: `axm skills add owner/repo --list` with a real GitHub repository

**Resumes at:** Implementation complete

## Traceability Matrix

| Spec           | Tasks                                                                | Beads                                                                       | Status   |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| cli-init       | TASK-3.1, TASK-3.2, TASK-3.3, TASK-7.2, TASK-8.1                     | axm-2.3.1, axm-2.3.2, axm-2.3.3, axm-2.7.2, axm-2.8.1                       | Complete |
| cli-skills     | TASK-4.1, TASK-7.2, TASK-8.1                                         | axm-2.4.1, axm-2.7.2, axm-2.8.1                                             | Complete |
| cli-skills-add | TASK-1._, TASK-2._, TASK-5._, TASK-6._, TASK-7.1, TASK-7.3, TASK-8.1 | axm-2.1._, axm-2.2._, axm-2.5._, axm-2.6._, axm-2.7.1, axm-2.7.3, axm-2.8.1 | Complete |

---

## Beads Execution

Multi-session tracking via beads. See
[Creating Beads WBS from Markdown Task Plans](../../../docs/guides/creating-beads-wbs-from-markdown-task-plans.md).

**Plan Epic:** axm-2
**Phase Epics:** axm-2.1 (P1), axm-2.2 (P2), axm-2.3 (P3), axm-2.4 (P4), axm-2.5 (P5), axm-2.6 (P6), axm-2.7 (P7), axm-2.8 (P8)
**Human Gate:** axm-2.9

**Document update tasks:** Each phase includes a bead task to update this
document when the phase completes:

- axm-2.1.13 (Phase 1), axm-2.2.10 (Phase 2), axm-2.3.4 (Phase 3), axm-2.4.2 (Phase 4)
- axm-2.5.5 (Phase 5), axm-2.6.5 (Phase 6), axm-2.7.4 (Phase 7), axm-2.8.2 (Phase 8)
