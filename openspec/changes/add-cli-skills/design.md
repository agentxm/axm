## Context

This feature enables axm to manage "skills"—reusable markdown instruction files (SKILL.md) that extend AI coding agents. The design uses axm's architecture (yargs + Effect) with a `.axm/` directory structure for state management.

### Stakeholders

- End users installing skills for their AI coding agents
- Teams sharing project-level skills
- Skill authors publishing to GitHub/GitLab

### Constraints

- Must use yargs for CLI parsing (project convention)
- Must use Effect for all business logic and I/O—no raw Promises or async/await (see CLAUDE.md Effect Guidelines)
- Must support common source formats (GitHub, GitLab, local paths) for broad compatibility
- Must be testable with unit tests at all layers

## Goals / Non-Goals

### Goals

- Install skills from: GitHub shorthand, GitHub URLs, GitLab URLs, local paths, direct URLs, well-known discovery endpoints
- Support project-level (`.axm/`) and global (`~/.axm/`) installation scopes
- Detect installed agents automatically (Claude Code, Cursor, Codex, etc.)
- Provide interactive multi-select UI using @clack/prompts
- Track installed skills and metadata in `.axm/settings.json`
- Track skill versions/hashes in `.axm/axm.lock` (YAML format)

### Non-Goals

- Custom skill registry/search API (future)
- Skill authoring/init command (future)
- Update/remove commands (future scope)
- Telemetry (not needed for axm)

## Decisions

### Decision: Directory Structure

Use `.axm/` as the canonical directory instead of `.agents/`:

```
.axm/
  settings.json    # Target agents, preferences
  axm.lock         # Installed skill versions (YAML)
  skills/          # Canonical skill storage
    <skill-name>/
      SKILL.md
```

Agent-specific symlinks are created in each agent's skills directory (e.g., `.claude/skills/<name>` -> `../.axm/skills/<name>`).

**Rationale**: Consolidates all axm state under a single directory, avoiding collision with other tools.

### Decision: Settings vs Lockfile Separation

- `settings.json`: User preferences and installed skills list - mutable, user-editable
  - Target agents, last selections
  - Installed skills with source and target agents (no version/hash info)
- `axm.lock`: Resolved version metadata - generated, not user-edited
  - Commit SHAs, content hashes
  - Timestamps (installedAt, updatedAt)
  - Exact source URLs for reproducibility

Example `settings.json`:

```json
{
  "version": 1,
  "agents": ["claude-code", "cursor"],
  "skills": {
    "pr-review": {
      "source": "github:example-org/agent-skills",
      "agents": ["claude-code", "cursor"]
    },
    "commit": {
      "source": "github:example-org/agent-skills",
      "agents": ["claude-code"]
    }
  }
}
```

**Rationale**: Settings track _what_ is installed and _where_, lockfile tracks _which version_. Users can edit settings.json to change agent targets; lockfile ensures reproducible installations.

### Decision: Canonical Source Notation

While the CLI accepts liberal input formats (e.g., `owner/repo` for GitHub), stored sources in `settings.json` and `axm.lock` use a canonical notation:

| Input (liberal)                 | Stored (canonical)             |
| ------------------------------- | ------------------------------ |
| `owner/repo`                    | `github:owner/repo`            |
| `https://github.com/owner/repo` | `github:owner/repo`            |
| `git@github.com:owner/repo.git` | `github:owner/repo`            |
| `https://gitlab.com/owner/repo` | `gitlab:owner/repo`            |
| `./local/path`                  | `./local/path`                 |
| `/absolute/path`                | `/absolute/path`               |
| `https://example.com/skill.md`  | `https://example.com/skill.md` |

Prefixes are only used for shorthand notations that would otherwise be ambiguous:

- `github:owner/repo` - disambiguates from relative path `owner/repo`
- `gitlab:owner/repo` - disambiguates from relative path

URLs and local paths are stored as-is since they're already unambiguous.

**Rationale**:

- Minimal: Only add prefixes where needed for disambiguation
- Unambiguous: No confusion between `foo/bar` (GitHub shorthand) and a local path
- Portable: Can reconstruct the fetch URL from the canonical form
- Extensible: Easy to add new shorthand types (e.g., `gist:`)

### Decision: YAML Lockfile Format

Use YAML instead of JSON for the lockfile:

```yaml
version: 1
skills:
  pr-review:
    source: github:example-org/agent-skills
    skillPath: skills/pr-review
    commitSha: abc123def456...
    contentHash: sha256:789xyz...
    installedAt: 2026-01-28T10:00:00Z
    updatedAt: 2026-01-28T10:00:00Z
```

Note: The canonical `source` field encodes the source type, so separate `sourceType` and `sourceUrl` fields are unnecessary.

**Rationale**: YAML is more readable in diffs and easier to edit if needed.

### Decision: Implicit Initialization

Commands that require `.axm/settings.json` SHALL trigger initialization if it doesn't exist:

```typescript
// Pattern for commands requiring initialization
const addHandler = (args: AddArgs) =>
  pipe(
    ensureInitialized({ global: args.global, yes: args.yes }),
    Effect.flatMap((settings) => installSkills(args, settings)),
  );
```

The `ensureInitialized` service:

1. Checks if settings file exists (fast path - no parsing)
2. If exists, reads and returns settings
3. If not, runs the init flow with provided options

**Rationale**: Seamless first-time experience. Users can run `axm skills add` without knowing about `init`.

### Decision: Agent Detection Strategy

Detect agents by checking for their configuration directories:

```typescript
const agentConfigs: AgentConfig[] = [
  { id: "claude-code", name: "Claude Code", detectPath: "~/.claude" },
  { id: "cursor", name: "Cursor", detectPath: "~/.cursor" },
  { id: "codex", name: "Codex", detectPath: "~/.codex" },
  // ... 30+ agents
];
```

Detection runs concurrently for speed. Results are cached in settings.

**Rationale**: Simple, fast, no external dependencies. Works offline.

### Decision: Effect Integration

Structure the init and add commands as:

1. **CLI layer** (yargs): Parse arguments, call handler
2. **Handler** (Effect): Orchestrates the flow using Effect services
3. **Services** (Effect): SourceParser, SkillDiscovery, AgentDetection, Installer, etc.

```typescript
// Handler returns Effect that can be tested with mock services
export const addSkillsHandler = (args: AddArgs): Effect.Effect<void, AddError, AddServices> => ...
```

**Effect-only rule**: All business logic returns `Effect<A, E, R>`, never `Promise<T>`. Use `Effect.tryPromise` only at boundaries to wrap external Promise-based libraries (e.g., execa, @clack/prompts). See CLAUDE.md Effect Guidelines for patterns.

### Decision: @clack/prompts for Interactive UI

Use @clack/prompts for the interactive CLI experience:

- `p.intro()` / `p.outro()` for session start/end
- `p.select()` for single choice
- `p.multiselect()` for multiple choices
- `p.spinner()` for async operations
- `p.confirm()` for yes/no prompts

**Rationale**: Well-tested library with polished terminal UI components.

### Decision: Well-Known Skills Discovery

Support the [Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) for discovering skills from any HTTP(S) host.

When a URL doesn't match GitHub, GitLab, or other recognized patterns:

1. Fetch `{url}/.well-known/skills/index.json`
2. Parse the index to discover available skills
3. Fetch skills from `{url}/.well-known/skills/{skill-name}/SKILL.md`

**Index format** (per RFC):

```json
{
  "skills": [
    {
      "name": "skill-name",
      "description": "What the skill does",
      "files": ["SKILL.md", "references/commands.md"]
    }
  ]
}
```

The `files` array lists all files in the skill directory. The CLI fetches all listed files, not just SKILL.md.

**Skill selection behavior**:

| Condition             | Behavior                       |
| --------------------- | ------------------------------ |
| Single skill in index | Auto-select                    |
| `--skill name`        | Install only named skills      |
| `--yes`               | Install all discovered skills  |
| Multiple skills       | Interactive multiselect prompt |

**Rationale**: Enables any organization to publish skills at a predictable location without requiring git hosting. Builds on RFC 8615 (Well-Known URIs).

## Architecture

```
packages/cli/src/commands/
  init.ts                      # Init command (yargs)
  init.handler.ts              # Init handler (Effect)
  skills.ts                    # Parent command
  skills/
    add.ts                     # Add subcommand (yargs)
    add.handler.ts             # Add handler (Effect)

packages/core/src/
  experimental/
    skills/
      index.ts                 # Public exports for @agentxm/core/experimental/skills
      source-parser.ts         # Parse source strings (including git refs)
      skill-discovery.ts       # Find SKILL.md files
      agent-detection.ts       # Detect installed agents
      installer.ts             # Install skills to agents
      settings.ts              # Read/write settings.json
      lockfile.ts              # Read/write axm.lock
      content-hash.ts          # Compute deterministic content hashes
      git.ts                   # Git operations (clone, checkout ref)
      wellknown.ts             # Well-known skills discovery (RFC 8615)
      types.ts                 # Shared types

packages/core/src/
  experimental/
    skills/
      __tests__/
        source-parser.test.ts  # Unit tests for source parsing
        content-hash.test.ts   # Unit tests for hash computation
        installer.test.ts      # Unit tests for installation logic
        lockfile.test.ts       # Unit tests for lockfile read/write
        settings.test.ts       # Unit tests for settings read/write
        wellknown.test.ts      # Unit tests for well-known discovery
```

### Export Pattern

Skills functionality is exported via subpath:

```typescript
// CLI imports skills from dedicated subpath
import {
  parseSource,
  detectAgents,
  installSkill,
} from "@agentxm/core/experimental/skills";
```

This requires adding the subpath export to `packages/core/package.json`:

```json
"exports": {
  ".": { ... },
  "./experimental": { ... },
  "./experimental/skills": {
    "types": "./dist/experimental/skills/index.d.ts",
    "import": "./dist/experimental/skills/index.js"
  }
}
```

## Risks / Trade-offs

### Risk: Breaking changes in @clack/prompts

Mitigation: Pin version, monitor for updates.

### Risk: Agent detection may miss edge cases

Mitigation: Support manual `--agent` flag to override detection.

### Trade-off: Symlinks vs Copies

Symlinks are preferred (single source of truth) but may fail on some systems (Windows without Developer Mode). Fallback to copy mode when symlinks fail.

### Decision: Git Ref Version Pinning

Support `@ref` syntax for pinning to specific git refs:

```bash
axm skills add owner/repo@v1.0.0           # Tag
axm skills add owner/repo@main             # Branch
axm skills add owner/repo@abc123           # Commit SHA
axm skills add owner/repo/path@v1.0.0      # With subpath
```

The `@` is reserved for git refs only. Skill filtering uses the `--skill` flag.

**Rationale**: Enables reproducible installations. The lockfile stores the resolved commit SHA regardless of the ref type specified.

### Decision: Local Content Hashing

Compute content hashes locally from cloned/copied skill directories rather than using GitHub API:

```typescript
// Hash computation (conceptual)
const hash = computeHash(skillDirectory); // SHA-256 of sorted files + contents
```

**Rationale**:

- Works with private repositories (no API auth needed)
- Works offline after clone
- Avoids GitHub API rate limits
- Consistent behavior across all source types

### Decision: Cross-Platform Path Handling

All path operations MUST use Node.js `path` module functions:

- `path.join()` for constructing paths
- `path.resolve()` for absolute paths
- `path.relative()` for symlink targets
- `path.normalize()` for comparison

Never use string concatenation with `/` or `\` for paths.

**Rationale**: Ensures Windows compatibility. See npx-skills issue #176 for the bug this prevents.

### Decision: SSH for Private Repositories

SSH is the recommended method for private repositories. The CLI:

1. Uses `stdio: 'inherit'` during git clone to allow passphrase prompts
2. Provides clear error messages suggesting SSH when HTTPS auth fails
3. Does not store or manage credentials directly

**Rationale**: Leverages existing SSH key infrastructure. Avoids credential management complexity.

## Testing Strategy

All business logic modules SHALL have unit tests. E2E tests cover CLI invocation.

### Unit Test Coverage

| Module               | Key Test Cases                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `source-parser.ts`   | GitHub shorthand, URLs with refs, subpaths, SSH URLs, local paths, Windows paths, well-known URLs |
| `content-hash.ts`    | Deterministic output, changes with content, ignores metadata                                      |
| `installer.ts`       | Symlink creation, copy fallback, path construction                                                |
| `lockfile.ts`        | YAML round-trip, version migration, partial updates                                               |
| `settings.ts`        | JSON round-trip, merge behavior, defaults, ensureInitialized logic                                |
| `agent-detection.ts` | Concurrent detection, config directory checks, caching                                            |
| `git.ts`             | Ref resolution, shallow clone options, error handling                                             |
| `init.handler.ts`    | First-time init, already initialized, non-interactive mode                                        |
| `add.handler.ts`     | Full flow with mock services, error handling, implicit init trigger                               |
| `wellknown.ts`       | Index fetching, validation, skill fetching, multi-file handling                                   |

### E2E Test Coverage

E2E tests use Vitest + execa to spawn the CLI as a subprocess, asserting on exit codes, stdout/stderr, and file system state.

| Scenario                           | Assertions                                                   |
| ---------------------------------- | ------------------------------------------------------------ |
| `axm init`                         | Creates `.axm/settings.json`, detects agents                 |
| `axm init --global`                | Creates `~/.axm/settings.json`                               |
| `axm init` (already initialized)   | Shows "already initialized" message                          |
| `axm init --yes`                   | Non-interactive, uses all detected agents                    |
| `axm skills` without subcommand    | Shows help, lists available subcommands                      |
| `axm skills add <source> --list`   | Lists available skills, exits 0                              |
| `axm skills add <local> --all`     | Installs skills, creates `.axm/` structure, creates symlinks |
| `axm skills add <invalid>`         | Shows error message, exits non-zero                          |
| `axm skills add <source> --global` | Installs to `~/.axm/`, not project directory                 |
| `axm skills add` (uninitialized)   | Triggers implicit init, then installs                        |
| `axm skills add <well-known-url>`  | Fetches index.json, discovers skills, installs               |

E2E tests live in `packages/cli/e2e/` and use:

- Isolated temp directories per test (cleaned up after)
- Local path fixtures for mock skill repositories (avoids network)
- `execa` to invoke the built CLI binary

### Testing Approach

1. **Pure functions for testability**: Source parsing, hash computation, and path operations are pure functions that can be tested without mocking.

2. **Effect services for I/O**: Git operations, file system access, and prompts are Effect services that can be replaced with test implementations.

3. **Handler unit tests**: The Effect handler (`add.handler.ts`) is tested with mock services injected, covering the orchestration logic.

4. **E2E for CLI wiring**: Yargs command definitions are tested via actual CLI invocation, not unit tests.

5. **Cross-platform path tests**: Use `path.posix` and `path.win32` to test path handling on any platform.

6. **Snapshot tests for lockfile/settings**: Verify file format stability with snapshot tests.

## Open Questions

None at this time.
