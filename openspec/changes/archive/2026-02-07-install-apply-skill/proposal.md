## Why

The install handler builds a `Plan<AddSkillOperation>`, displays it, and optionally confirms — but `applyPlan` is a stub that only logs "Installed {label}". No files are written to disk. No lockfile entries are created. Users cannot actually install skills.

## What Changes

- **Make `applyPlan` accept an executor callback** — the generic plan apply loop gains an `execute: (op: Op) => Effect<void, E, R>` parameter that runs per-action. The current hardcoded `clack.log.success` call moves into callers.
- **Thread the executor through `resolvePlan`** — the workspace service's `resolvePlan` method accepts the same executor and forwards it to `applyPlan`.
- **Implement `executeAddSkill`** — a new skill-specific executor that handles the `AddSkillOperation`. Per-skill flow:
  1. **Sanitize skill name** for filesystem safety:
     - Convert to lowercase
     - Replace any character not in `[a-z0-9._]` with a single hyphen
     - Strip leading/trailing dots and hyphens
     - Truncate to 255 characters (filesystem limit)
     - Fall back to `"unnamed-skill"` if result is empty

  2. **Compute paths**:
     - Canonical: `<base>/.agents/skills/<sanitized-name>` (always `.agents/skills/`, not agent-dependent)
     - Agent-specific: `<base>/<agent.skills.dir>/<sanitized-name>` for each target agent

  3. **Validate path safety** via `isPathSafe(base, target)`:
     - Normalize and resolve both paths
     - Ensure target starts with base + separator (or equals base)
     - Validate both canonical path and each agent-specific path
     - On failure: return error result for that skill/agent pair, write no files

  4. **Write to canonical location** (clean-slate):
     - `rm -rf` the canonical directory (if exists)
     - `mkdir -p` the canonical directory
     - Copy skill files from source via `copySkillDirectory()`:
       - **Excluded files**: `README.md`, `metadata.json`, entries starting with `_`, `.git` directories
       - **Dereference symlinks**: copy file content, not the symlink itself (`dereference: true`)
       - **Recursive**: handles nested directories
       - Copy entries concurrently within a directory

  5. **Symlink from agent directories** to canonical, for each target agent:
     - **Self-reference detection**: if canonical and agent paths resolve to the same location (checking both direct paths AND parent-symlink-resolved paths via `resolveParentSymlinks()`), skip symlink creation and return success
     - **Existing symlink at target**:
       - Points to correct target → no-op (return success)
       - Points to wrong target → remove and recreate
       - Is a directory (not symlink) → remove directory, create symlink
     - **Circular symlink (ELOOP)**: catch ELOOP error, force-remove broken symlink, continue to creation
     - **Parent directory creation**: `mkdir -p` ensures agent skills directory exists
     - **Relative path computation**: compute relative path from the _real_ (symlink-resolved) parent directory via `resolveParentSymlinks()`, not the potentially symlinked path
     - **Platform**: Unix/macOS relative symlink (Windows junctions deferred)
     - **Fallback**: on any symlink failure, fall back to copy mode for that agent (set `symlinkFailed: true` in result)

  6. **Update lockfile** — add/update a `SkillLockEntry` via `updateLockEntry()`. Map the `Source` type to the corresponding lock entry fields via `sourceToLockEntry()`. **Lockfile write errors are silently swallowed** — a failed lockfile write never causes the installation to fail.

- **Collect structured results** — each skill/agent pair produces an `InstallResult`:
  ```
  success: boolean
  path: string               — agent-specific path
  canonicalPath: string       — canonical path (symlink mode)
  mode: "symlink" | "copy"
  symlinkFailed: boolean      — true if symlink failed, fell back to copy
  error: Option<string>       — error message if failed
  ```
- **Report results** — log per-skill success/failure via Clack. Display canonical path, which agents received symlinks, and any symlink fallback warnings.

## Design Considerations

The approach follows the reference implementation (Section 8 of the skills INSTALL_SPEC) adapted to our architecture:

- **Canonical location is always `.agents/skills/`** — this is a fixed path, not dependent on which agents are selected. Universal agents (amp, codex, opencode, etc. — those whose `skills.dir` is `.agents/skills`) read directly from canonical. Non-universal agents (claude-code with `.claude/skills`, cursor with `.cursor/skills`, etc.) get symlinks.
- **Universal agent + global scope → skip symlink**: when a universal agent is installed globally, the canonical location _is_ its skills directory. No symlink is needed. The executor detects this by comparing resolved paths.
- **`resolveParentSymlinks()` is critical**: before computing relative symlink paths, the parent directory of the link location must be resolved through symlinks. This handles cases where e.g. `~/.claude/skills` is itself a symlink to `~/.agents/skills` — without resolution, the relative path computation would be wrong.
- **Base directory** is the workspace base: `~/` for global, `./` for project scope. The workspace service provides `path` (the `.axm` dir) — the base is its parent. Agent skill directories are relative to this base.
- **Canonical + symlink** is the only supported mode. A future change can add user-selectable copy-only mode if needed. Symlink failure automatically falls back to copy per agent.
- **Lockfile writes are serialized** — `updateLockEntry` does read-modify-write, so concurrent calls would race. The plan job uses `concurrency: 1` for install operations (changed from `"unbounded"` in `buildPlan`).
- **Source-to-lock-entry mapping** creates the correct `SkillLockEntry` variant based on the `Source` discriminant (`github` → `GitHubLockEntry`, `local` → `LocalLockEntry`, etc.). Common fields (`agents`, `installedAt`, `updatedAt`, `gitTreeHash`) are populated from the operation metadata.

## Capabilities

### New Capabilities

- `skills-install-execute`: The `executeAddSkill` function — orchestrates per-skill installation: sanitize → validate → copy → symlink → lockfile. Returns `InstallResult` per agent. Located in `cli-commands/skills/install/`.
- `skill-name-sanitize`: Pure function to sanitize skill names for filesystem safety. Located in `cli-commands/skills/` (shared across install/uninstall).
- `path-safety`: `isPathSafe(base, target)` — validates resolved target stays within base directory. Located in `utils/` (cross-cutting utility).
- `create-symlink`: Effectful function handling the full symlink lifecycle — self-reference detection, existing symlink cleanup, ELOOP recovery, parent symlink resolution, relative path computation. Located in `utils/` (cross-cutting utility).
- `copy-skill-directory`: Effectful recursive directory copy with exclusion rules and symlink dereferencing. Located in `cli-commands/skills/` (skill-specific exclusion rules).
- `resolve-parent-symlinks`: Resolves the parent directory of a path through symlinks, preserving the final component. Located in `utils/` (cross-cutting utility).
- `source-to-lock-entry`: Pure function mapping `Source` + `AddSkillOperation` metadata to `SkillLockEntry`. Located in `cli-commands/skills/` (shared across install/update).
- `install-result`: `InstallResult` type for per-agent installation outcomes. Located in `cli-commands/skills/install/`.

### Modified Capabilities

- `workspace-plan-apply`: `applyPlan` accepts an executor callback instead of hardcoding log-only behavior.
- `workspace-resolve-plan`: `resolvePlan` on `WorkspaceContextService` accepts and threads executor callback.
- `skills-install-build-plan`: Change job concurrency from `"unbounded"` to `1` to serialize lockfile writes.
- `cli-skills-install`: Handler passes `executeAddSkill` to `ws.resolvePlan`.

## Out of Scope

- User-selectable copy-only installation mode (symlink fallback handles all cases for now)
- Force reinstall behavior (the `force` field on `AddSkillOperation` is present but not yet acted on)
- Settings update (adding skill entries to `settings.json` — only lockfile is updated)
- Overwrite detection / confirmation (build-plan marks already-installed as no-op; force mode deferred)
- Telemetry
- Windows junction support (`platform() === 'win32' ? 'junction' : undefined`) — deferred
- Remote skill / well-known skill installation variants (single SKILL.md write, multi-file write) — repo/local sources only for now

## Impact

- `packages/cli/src/workspace/apply-plan.ts` — accept executor callback, remove hardcoded log
- `packages/cli/src/workspace/service.ts` — thread executor through `resolvePlan` and `WorkspaceContextService` interface
- `packages/cli/src/cli-commands/skills/install/execute.ts` — new: `executeAddSkill` orchestrator
- `packages/cli/src/cli-commands/skills/install/install-result.ts` — new: `InstallResult` type
- `packages/cli/src/cli-commands/skills/sanitize-name.ts` — new: `sanitizeName` pure function
- `packages/cli/src/cli-commands/skills/copy-skill-directory.ts` — new: recursive copy with exclusions
- `packages/cli/src/cli-commands/skills/source-to-lock-entry.ts` — new: `sourceToLockEntry` mapping
- `packages/cli/src/utils/path-safety.ts` — new: `isPathSafe` validation
- `packages/cli/src/utils/create-symlink.ts` — new: symlink lifecycle with edge case handling
- `packages/cli/src/utils/resolve-parent-symlinks.ts` — new: parent symlink resolution
- `packages/cli/src/cli-commands/skills/install/build-plan.ts` — change concurrency to `1`
- `packages/cli/src/cli-commands/skills/install/handler.ts` — pass executor to `resolvePlan`
- `packages/cli/src/cli-commands/skills/index.ts` — barrel updated
- `packages/cli/src/utils/index.ts` — barrel updated
- `packages/cli/src/workspace/index.ts` — barrel updated if needed
