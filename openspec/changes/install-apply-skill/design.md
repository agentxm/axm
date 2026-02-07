## Context

The install command currently builds a plan of `AddSkillOperation` actions and displays them, but `applyPlan` is a stub that only logs "Installed {label}". The proposal defines the full installation pipeline: sanitize → validate paths → copy files → create symlinks → update lockfile.

The codebase uses a desired-state reconciliation pattern (`loadCurrentState → buildIdealState → buildPlan → applyPlan`) with Effect throughout. Plans are generic over their operation type (`Plan<Op>`), and the workspace service's `resolvePlan` handles preview/confirm/apply flow.

Key existing pieces:

- `applyPlan` in `workspace/apply-plan.ts` — iterates jobs/steps, currently logs only
- `WorkspaceContextService.resolvePlan` in `workspace/service.ts` — display/confirm/apply orchestration
- `AddSkillOperation` includes `source: Source`, `agents: ReadonlyArray<string>`, `skill: Skill`, `path: Option<string>`, `gitTreeSha: Option<string>`
- `updateLockEntry(axmDir, skillName, entry)` exists in `lockfile/lockfile.ts`
- 44 agents registered, each with `skills.dir` (e.g., `.claude/skills`, `.cursor/skills`)
- Source types use `Option<T>` for optional fields; lockfile schemas use `Schema.optional`

## Goals / Non-Goals

**Goals:**

- Make `applyPlan` extensible by accepting an executor callback
- Implement the full skill installation pipeline as `executeAddSkill`
- Write skill files to canonical location (`.agents/skills/<name>`)
- Symlink from agent-specific directories to canonical
- Update lockfile entries after installation
- Handle edge cases: path traversal, circular symlinks, self-reference detection

**Non-Goals:**

- Backward compatibility with the stub `applyPlan` signature (no callers depend on the current behavior)
- Copy-only mode selection (symlink fallback handles failures automatically)
- Windows junction support
- Remote/well-known skill variants (only repo/local sources)
- Force reinstall behavior
- Settings update (only lockfile is written)

## Decisions

### 1. Executor callback on `applyPlan`

**Decision:** Add an `execute: (op: Op) => Effect<void, E, R>` parameter to `applyPlan`. The current hardcoded `clack.log.success` call moves into callers.

**Rationale:** The plan system is generic over `Op`, but the _application_ of an operation is domain-specific. An executor callback keeps `applyPlan` generic while letting each command define what "execute" means.

**Alternatives considered:**

- _Subclass/service per operation type_ — over-engineered for two operation types (add/remove). A callback is simpler.
- _Pattern match on `_tag` inside applyPlan_ — breaks the generic `Plan<Op>` abstraction. applyPlan shouldn't know about skill-specific tags.

**Signature change:**

```typescript
// Before
export const applyPlan = <Op>(plan: Plan<Op>) => ...

// After
export const applyPlan = <Op, E, R>(
  plan: Plan<Op>,
  execute: (op: Op) => Effect.Effect<void, E, R>,
) => ...
```

The `Clack` dependency is removed from `applyPlan` — it becomes the executor's responsibility to do any logging.

### 2. Threading executor through `resolvePlan`

**Decision:** `resolvePlan` on `WorkspaceContextService` gains the same executor parameter and forwards it to `applyPlan`.

**Rationale:** The handler calls `ws.resolvePlan(plan)` — that's where the preview/confirm/apply flow lives. The executor must reach `applyPlan` through this path.

**Signature change:**

```typescript
// Before
resolvePlan: <Op>(plan: Plan<Op>) => Effect<void, PromptCancelled | PromptError, Clack>;

// After
resolvePlan: <Op, E, R>(plan: Plan<Op>, execute: (op: Op) => Effect.Effect<void, E, R>) =>
  Effect<void, PromptCancelled | PromptError | E, Clack | R>;
```

### 3. File layout: feature-grouped, not scattered

**Decision:** Skill installation files go in `cli-commands/skills/install/`. Cross-cutting utilities (`isPathSafe`, `createSymlink`, `resolveParentSymlinks`) go in `utils/`.

**Rationale:** Follows the project's "group by feature" convention. `executeAddSkill` is install-specific. Sanitize and copy are shared across install/uninstall so they live one level up in `cli-commands/skills/`. Path and symlink utilities are genuinely cross-cutting.

**New files:**
| File | Location | Why |
|------|----------|-----|
| `execute.ts` | `cli-commands/skills/install/` | Install-specific orchestrator |
| `install-result.ts` | `cli-commands/skills/install/` | Result type for per-agent outcomes |
| `sanitize-name.ts` | `cli-commands/skills/` | Shared: install + uninstall need it |
| `copy-skill-directory.ts` | `cli-commands/skills/` | Shared: skill-specific exclusion rules |
| `source-to-lock-entry.ts` | `cli-commands/skills/` | Shared: install + update need it |
| `path-safety.ts` | `utils/` | Cross-cutting: any path validation |
| `create-symlink.ts` | `utils/` | Cross-cutting: symlink lifecycle |
| `resolve-parent-symlinks.ts` | `utils/` | Cross-cutting: path resolution |

### 4. Canonical + symlink installation model

**Decision:** Always write to `.agents/skills/<sanitized-name>` (canonical), then symlink from each agent's `skills.dir`. If symlink fails, fall back to copy for that agent.

**Rationale:** Single source of truth avoids file duplication. Universal agents (whose `skills.dir` is `.agents/skills`) read directly from canonical — self-reference detection skips symlink creation. Non-universal agents get relative symlinks.

**Why relative symlinks:** Absolute symlinks break if the project is moved. Relative paths computed from the _real_ (symlink-resolved) parent directory handle cases where e.g. `~/.claude/skills` is itself a symlink.

### 5. Concurrency: serialized jobs, but concurrent agent symlinks within a skill

**Decision:** Change `buildPlan`'s job concurrency from `"unbounded"` to `1` (serialize across skills). Within `executeAddSkill`, symlink creation for multiple agents runs concurrently.

**Rationale:** `updateLockEntry` does read-modify-write on the lockfile. Concurrent skill installations would race on lockfile writes. However, symlinking to different agent directories within a single skill is independent and safe to parallelize.

**Alternative considered:** Lockfile batching (collect all entries, write once at the end). Simpler to serialize for now; batching can be added if installation becomes a bottleneck.

### 6. Source-to-lock-entry mapping

**Decision:** Pure function `sourceToLockEntry` that switches on `source.source` discriminant and maps `Option<T>` fields to `T | undefined` for the lockfile schema.

**Rationale:** The Source types use `Option<string>` for optional fields (e.g., `ref`, `subPath`), while lockfile schemas use `Schema.optional(Schema.String)` (plain `string | undefined`). This conversion must happen at the boundary.

**Key mappings:**

- `source.subPath` → lock entry `path` (field rename)
- `Option.getOrUndefined` for all optional fields
- `GitRepositorySource` has URL-or-path union — map to `GitLockEntry` with `url` (when URL variant) or `path` (when path variant, using `source.path` field directly)
- Common fields (`agents`, `installedAt`, `updatedAt`, `gitTreeHash`) come from operation metadata

### 7. Error handling strategy

**Decision:** `executeAddSkill` returns structured `InstallResult` per agent. Path safety and copy failures fail the skill. Symlink failures fall back to copy. Lockfile write failures are silently swallowed.

**Rationale:**

- Path traversal is a hard failure — never write outside the base directory
- Copy failure means the skill can't be installed — no point symlinking
- Symlink failure is recoverable — copy the files instead
- Lockfile is advisory — a missing entry doesn't break the installed skill, and the next install/update will re-create it

### 8. Skill name sanitization

**Decision:** Pure function with deterministic, filesystem-safe output:

1. Lowercase
2. Replace `[^a-z0-9._]` with single hyphen
3. Collapse consecutive hyphens
4. Strip leading/trailing dots and hyphens
5. Truncate to 255 characters
6. Fall back to `"unnamed-skill"` if empty

**Rationale:** Filesystem safety across platforms. The rules are simple, predictable, and match common conventions. No encoding or hashing — human-readable output.

## Risks / Trade-offs

**Serialized installation is slower for many skills** → Acceptable for now. Typical installs are 1-5 skills. Lockfile batching can be added later if needed.

**Symlink fallback silently degrades** → The `InstallResult` records `symlinkFailed: true` and the reporter shows a warning. Users can investigate and fix permissions.

**`rm -rf` on canonical directory before copy** → If interrupted mid-copy, the skill is in a broken state. Mitigation: atomic rename (write to temp, rename) could be added later. For now, re-running install fixes it.

**Lockfile write failures are swallowed** → A failed lockfile write means the skill is installed but not tracked. The next `install` will see it as "not installed" and re-install. This is the lesser evil compared to failing the whole installation.

**No Windows support for symlinks** → Deferred to a future change. The proposal already notes this. The symlink utility can be extended with `type: 'junction'` logic later.
