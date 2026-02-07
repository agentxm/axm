## Why

The install handler builds a `Plan<AddSkillOperation>`, displays it, and optionally confirms — but `applyPlan` is a stub that only logs "Installed {label}". No files are written to disk. No lockfile entries are created. Users cannot actually install skills.

## What Changes

- **Make `applyPlan` accept an executor callback** — the generic plan apply loop gains an `execute: (op: Op) => Effect<void, E, R>` parameter that runs per-action. The current hardcoded `clack.log.success` call moves into callers.
- **Thread the executor through `resolvePlan`** — the workspace service's `resolvePlan` method accepts the same executor and forwards it to `applyPlan`.
- **Implement `executeAddSkill`** — a new skill-specific executor that handles the `AddSkillOperation`:
  1. **Sanitize skill name** for filesystem safety (lowercase, replace non-`[a-z0-9._]` with hyphens, strip leading/trailing dots and hyphens, truncate to 255 chars, fallback to `"unnamed-skill"`).
  2. **Validate path safety** — ensure resolved target paths do not escape the base directory (prevents directory traversal via crafted skill names).
  3. **Copy skill files to the canonical location** — `<base>/<first-agent-skills-dir>/<sanitized-name>/`. For repo/local sources, recursively copy the skill directory (excluding `README.md`, `metadata.json`, `_*` prefixed entries, `.git`). The canonical location is the skills directory of the first selected agent.
  4. **Symlink from other agent directories** — for each remaining agent, create a relative symlink from `<base>/<agent-skills-dir>/<sanitized-name>` to the canonical location. Skip agents whose skills dir resolves to the same path as canonical (e.g., multiple universal agents sharing `.agents/skills`). On symlink failure, fall back to copy.
  5. **Update lockfile** — add/update a `SkillLockEntry` for each successfully installed skill via the existing `updateLockEntry()` function. Map the `Source` type to the corresponding lock entry fields.
- **Report results** — log per-skill success/failure via Clack after each action.

## Design Considerations

The approach follows the reference implementation (Section 8 of the skills INSTALL_SPEC) adapted to our architecture:

- **Canonical + symlink** is the only supported mode. A future change can add copy-only mode if needed. Symlink failure automatically falls back to copy per agent, so this works on all platforms.
- **Base directory** is the workspace base: `~/` for global, `./` for project scope. Agent skill directories are relative to this base (e.g., `<base>/.claude/skills/`, `<base>/.agents/skills/`).
- **Canonical location selection**: uses the first selected agent's skills directory as canonical. Since many agents share `.agents/skills`, this is the common case. If no agents use `.agents/skills`, the first agent's directory is canonical and others get symlinks.
- **Lockfile writes** are serialized — the executor processes one skill at a time for lockfile operations, even though plan jobs may have `concurrency: "unbounded"`. Since `updateLockEntry` does read-modify-write, concurrent calls would race. The plan already runs with `concurrency: "unbounded"` for steps within a job, so either the executor must serialize its lockfile writes or the plan concurrency must be limited. The simplest approach: the executor writes lockfile entries, and the plan job uses `concurrency: 1` for install operations (changed from `"unbounded"` in `buildPlan`).
- **Source-to-lock-entry mapping** creates the correct `SkillLockEntry` variant based on the `Source` discriminant (`github` → `GitHubLockEntry`, `local` → `LocalLockEntry`, etc.).

## Capabilities

### New Capabilities

- `skills-install-execute`: The `executeAddSkill` function — handles file operations (sanitize, validate, copy, symlink) and lockfile update for a single `AddSkillOperation`. Located in `cli-commands/skills/install/`.
- `skill-name-sanitize`: Pure function to sanitize skill names for filesystem safety. Located in `cli-commands/skills/` (shared across install/uninstall).
- `source-to-lock-entry`: Pure function mapping `Source` + `AddSkillOperation` metadata to `SkillLockEntry`. Located in `cli-commands/skills/` (shared across install/update).

### Modified Capabilities

- `workspace-plan-apply`: `applyPlan` accepts an executor callback instead of hardcoding log-only behavior.
- `workspace-resolve-plan`: `resolvePlan` on `WorkspaceContextService` accepts and threads executor callback.
- `skills-install-build-plan`: Change job concurrency from `"unbounded"` to `1` to serialize lockfile writes.
- `cli-skills-install`: Handler passes `executeAddSkill` to `ws.resolvePlan`.

## Out of Scope

- Copy-only installation mode (symlink fallback handles all cases for now)
- Force reinstall behavior (the `force` field on `AddSkillOperation` is present but not yet acted on)
- Settings update (adding skill entries to `settings.json` — only lockfile is updated)
- Overwrite detection / confirmation (build-plan marks already-installed as no-op; force mode deferred)
- Telemetry
- Platform-specific symlink handling (Windows junctions) — macOS/Linux relative symlinks only for now

## Impact

- `packages/cli/src/workspace/apply-plan.ts` — accept executor callback, remove hardcoded log
- `packages/cli/src/workspace/service.ts` — thread executor through `resolvePlan` and `WorkspaceContextService` interface
- `packages/cli/src/cli-commands/skills/install/execute.ts` — new: `executeAddSkill` function
- `packages/cli/src/cli-commands/skills/sanitize-name.ts` — new: `sanitizeName` pure function
- `packages/cli/src/cli-commands/skills/source-to-lock-entry.ts` — new: `sourceToLockEntry` pure function
- `packages/cli/src/cli-commands/skills/install/build-plan.ts` — change concurrency to `1`
- `packages/cli/src/cli-commands/skills/install/handler.ts` — pass executor to `resolvePlan`
- `packages/cli/src/cli-commands/skills/index.ts` — barrel updated
- `packages/cli/src/workspace/index.ts` — barrel updated if needed
