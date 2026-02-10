## Context

The install command currently builds a plan of `InstallSkillOperation` actions and displays them, but `applyPlan` is a stub that only logs "Installed {label}". The proposal defines the full installation pipeline: sanitize → validate paths → copy files → create symlinks → update lockfile.

The codebase uses a desired-state reconciliation pattern (`loadCurrentState → buildIdealState → buildPlan → applyPlan`) with Effect throughout. Plans are generic over their operation type (`Plan<Op>`), and the workspace service's `resolvePlan` handles preview/confirm/apply flow.

Key existing pieces:

- `applyPlan` in `workspace/apply-plan.ts` — iterates jobs/steps, currently logs only
- `WorkspaceContextService.resolvePlan` in `workspace/service.ts` — display/confirm/apply orchestration
- `AddSkillOperation` (renamed to `InstallSkillOperation` in this change) includes `source: Source`, `agents: ReadonlyArray<string>`, `skill: Skill`, `path: Option<string>`, `gitTreeSha: Option<string>`
- `updateLockEntry(axmDir, skillName, entry)` exists in `lockfile/lockfile.ts`
- 44 agents registered, each with `skills.dir` (e.g., `.claude/skills`, `.cursor/skills`)
- Source types use `Option<T>` for optional fields; lockfile schemas use `Schema.optional`

## Goals / Non-Goals

**Goals:**

- Make `applyPlan` extensible via a typed handler registry keyed by operation `kind`, returning an applied plan with `actualResult` on each step
- Implement the full skill installation pipeline as `installSkill`
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

### 1. Handler registry on `applyPlan`

**Decision:** `applyPlan` accepts a typed handler registry — a map from operation `kind` to handler function. Operations must carry a `kind: string` discriminant. Existing operations (`InstallSkillOperation`, `UninstallSkillOperation`) currently use `_tag` — migrate to `kind` to avoid collision with Effect's `Data.TaggedClass`/`Data.TaggedError` convention. Also rename `"add-skill"` → `"install-skill"` and `"remove-skill"` → `"uninstall-skill"` for consistency with command naming. `applyPlan` dispatches each action's `op` to the matching handler by `kind`. Handler errors are fixed to `OperationError`. Handler dependencies (R channel) are inferred from the handler functions provided — TypeScript bubbles up the union of all handler requirements automatically.

**Rationale:** Execution logic is a property of the operation _type_, not the individual instance — every `InstallSkillOperation` is executed the same way. A registry keyed by `kind` makes this relationship explicit and discoverable. The mapped type ensures exhaustiveness: TypeScript forces the caller to provide a handler for every `kind` in the operation union.

Handlers receive everything they need from two sources: (1) the operation object itself (source, agents, skill, paths, etc.), and (2) Effect services via `yield*` (FileSystem, Clack, Path, etc.). No factory functions or closures needed — handlers are plain functions. Service dependencies bubble up through `applyPlan` → `resolvePlan` → handler, where the runtime layer satisfies them.

**Alternatives considered:**

- _Single callback `execute: (op: Op) => Effect`_ — works but treats execution as an opaque function. Doesn't express that execution is determined by operation type. Callers would need internal dispatch anyway for union operation types.
- _Operations carry their own `execute` method_ — couples data and behavior at the instance level. Execution logic is identical across all instances of a type, so per-instance attachment is misleading.
- _Pattern match on `kind` inside applyPlan_ — breaks the generic `Plan<Op>` abstraction. applyPlan shouldn't know about skill-specific tags.
- _Fixed `R = never` with factory/closure injection_ — forces handlers to close over services via a factory function. Adds unnecessary indirection when Effect's service pattern already handles dependency propagation. The operation object carries domain data; Effect context carries infrastructure services.

**Types and signature:**

```typescript
// Yielded by handlers for hard failures — applyPlan catches and converts to error result
class OperationError extends Data.TaggedError("OperationError")<{
  operation: string
  message: string
  cause: unknown
}> {}

// Handler: returns OperationResult, may yield OperationError for hard failures
type OperationHandler<Op, R = never> = (op: Op) => Effect.Effect<OperationResult, OperationError, R>

// Constraint shape for the registry (R = any to accept any handler)
type Handlers<Op extends { kind: string }> = {
  [K in Op["kind"]]: (op: Extract<Op, { kind: K }>) => Effect.Effect<OperationResult, OperationError, any>
}

// Extract the union of R from all handler functions
type ExecutionContext<T> =
  T[keyof T] extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R : never

// Before
export const applyPlan = <Op>(plan: Plan<Op>) => ...

// After — returns Plan<Op> with actualResult populated on each step
// applyPlan catches OperationError and converts to { result: "error", message }
export const applyPlan = <Op extends { kind: string }, T extends Handlers<Op>>(
  plan: Plan<Op>,
  handlers: T,
): Effect.Effect<Plan<Op>, never, ExecutionContext<T>> => ...
```

Note: `OperationResult` is defined in `plan.ts` (per the rename-action-to-expected-result change) and used by both `JobStep.expectedResult` and `JobStep.actualResult`. It is not redefined here.

The `Clack` dependency is removed from `applyPlan` — display is handled by `resolvePlan` (see Decision 2). `applyPlan` looks up `handlers[step.operation.kind]`, calls it with the operation, and catches any `OperationError` — converting it to `{ result: "error", message: error.message }`. It returns a new `Plan<Op>` where each step's `actualResult` is populated. `applyPlan` never fails — errors are captured as `{ result: "error" }` on the step.

For steps where `expectedResult.result !== "success"`, `applyPlan` skips handler dispatch and sets `actualResult` to the step's `expectedResult` directly — the plan builder's prediction is the outcome.

**Handler implementation:** Plain functions — no factory, no closure. Domain data comes from the operation object, infrastructure services come from Effect context. Handlers return `OperationResult` directly for expected outcomes, or yield `OperationError` for hard failures that `applyPlan` catches.

```typescript
export const installSkill: OperationHandler<
  InstallSkillOperation,
  FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Hard failure — yield OperationError, applyPlan catches and converts
    if (!isPathSafe(op.skill.name)) {
      yield* new OperationError({
        operation: "install-skill",
        message: "Path traversal detected",
        cause: null,
      });
    }

    // Success
    return { result: "success", message: `Installed ${op.skill.name}` };
  });
```

**Caller usage (install handler):**

```typescript
// R = FileSystem | Path inferred from installSkill — no manual annotation
ws.resolvePlan(plan, {
  "install-skill": installSkill,
});
```

### 2. `resolvePlan` owns display and orchestration

**Decision:** `resolvePlan` on `WorkspaceContextService` gains a `handlers` parameter (same registry type). It owns _all_ display — both pre-application (preview) and post-application (results) — using `displayPlan` for both. Command handlers never render plan output.

**Rationale:** The plan is the universal display structure. Before application, `displayPlan` renders each step's `expectedResult`. After application, `displayPlan` renders each step's `actualResult`. The same function handles both — it just reads whichever result field is appropriate. This ensures consistent formatting, summary counts, and UX regardless of which command triggered the plan.

Command handlers receive the applied plan back for inspection (e.g., checking for errors to set exit codes) but never call Clack to display results.

**Flow:**

```typescript
resolvePlan: (plan, handlers) =>
  Effect.gen(function* () {
    yield* displayPlan(plan); // pre-application: shows expectedResult
    // ... confirm flow (--preview / --yes / interactive) ...
    const applied = yield* applyPlan(plan, handlers); // execute: populates actualResult
    yield* displayPlan(applied); // post-application: shows actualResult
    return applied;
  });
```

**`displayPlan` changes:** The function renders based on which result is available. For an unapplied plan, steps have `expectedResult` only — display shows predictions. For an applied plan, steps have `actualResult` — display shows outcomes. The rendering per result value:

| `result`    | Pre-application (expected)      | Post-application (actual)     |
| ----------- | ------------------------------- | ----------------------------- |
| `"success"` | `+ label` (will do)             | `✓ label` (did it)            |
| `"no-op"`   | `- label (message)` (skipping)  | `- label (message)` (skipped) |
| `"error"`   | `✗ label (message)` (will fail) | `✗ label (message)` (failed)  |

The summary line adapts too: `"3 to install, 1 to skip"` (pre) vs `"3 installed, 1 skipped"` (post).

**Signature change:**

```typescript
// Before
resolvePlan: <Op>(plan: Plan<Op>) => Effect<void, PromptCancelled | PromptError, Clack>;

// After — returns the applied Plan<Op> with actualResult populated
resolvePlan: <Op extends { kind: string }, T extends Handlers<Op>>(plan: Plan<Op>, handlers: T) =>
  Effect<Plan<Op>, PromptCancelled | PromptError, Clack | ExecutionContext<T>>;
```

### 3. File layout: feature-grouped, not scattered

**Decision:** Skill installation files go in `cli-commands/skills/install/`. Cross-cutting utilities (`isPathSafe`, `createSymlink`, `resolveParentSymlinks`) go in `utils/`.

**Rationale:** Follows the project's "group by feature" convention. `installSkill` is install-specific. Sanitize and copy are shared across install/uninstall so they live one level up in `cli-commands/skills/`. Path and symlink utilities are genuinely cross-cutting.

**Existing code to reuse:**
| What | Location | Notes |
|------|----------|-------|
| `sanitizeName` | `cli-commands/skills/install/skill-utils.ts` | Already exported, matches spec exactly. Consider moving up to `cli-commands/skills/` for shared use with uninstall. |
| `validatePath` | `cli-commands/skills/install/parse-manifests.ts` | Module-private, manifest-specific. Pattern is reusable but needs a general-purpose public variant for install pipeline. |

**New files:**
| File | Location | Why |
|------|----------|-----|
| `install-skill.ts` | `cli-commands/skills/install/` | Install-specific operation handler |
| `copy-skill-directory.ts` | `cli-commands/skills/` | Shared: skill-specific exclusion rules |
| `source-to-lock-entry.ts` | `cli-commands/skills/` | Shared: install + update need it |
| `path-safety.ts` | `utils/` | Cross-cutting: general-purpose path traversal validation (extract pattern from `validatePath` in parse-manifests.ts) |
| `create-symlink.ts` | `utils/` | Cross-cutting: symlink lifecycle |
| `resolve-parent-symlinks.ts` | `utils/` | Cross-cutting: path resolution |

### 4. Canonical + symlink installation model

**Decision:** Always write to `.agents/skills/<sanitized-name>` (canonical), then symlink from each agent's `skills.dir`. If symlink fails, fall back to copy for that agent.

**Rationale:** Single source of truth avoids file duplication. Universal agents (whose `skills.dir` is `.agents/skills`) read directly from canonical — self-reference detection skips symlink creation. Non-universal agents get relative symlinks.

**Why relative symlinks:** Absolute symlinks break if the project is moved. Relative paths computed from the _real_ (symlink-resolved) parent directory handle cases where e.g. `~/.claude/skills` is itself a symlink.

### 5. Concurrency: serialized jobs, but concurrent agent symlinks within a skill

**Decision:** Change `buildPlan`'s job concurrency from `"unbounded"` to `1` (serialize across skills). Within `installSkill`, symlink creation for multiple agents runs concurrently.

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

**Decision:** `installSkill` returns `OperationResult`. Hard failures (path traversal, copy failure) yield `OperationError`, which `applyPlan` catches and converts to `{ result: "error" }` on the step's `actualResult`. Recoverable situations return results directly: `{ result: "success" }` for successful installs. Symlink failures fall back to copy. Lockfile write failures are silently swallowed.

Note: `{ result: "no-op" }` is never returned by the handler — no-op detection happens at plan-build time via `expectedResult`. If a step's `expectedResult.result !== "success"`, `applyPlan` skips handler dispatch entirely and sets `actualResult = expectedResult`.

**Rationale:**

- Two error paths: handlers yield `OperationError` for hard failures (caught by `applyPlan`), or return `{ result: "error" }` directly for expected/graceful errors
- `operation` on `OperationError` identifies which operation failed, useful for reporting in multi-skill installs
- `applyPlan` never fails — it always returns `Plan<Op>` with `actualResult` populated on every step, making downstream reporting straightforward via `displayPlan`
- Path traversal is a hard failure — never write outside the base directory
- Copy failure means the skill can't be installed — no point symlinking
- Symlink failure is recoverable — copy the files instead
- Lockfile is advisory — a missing entry doesn't break the installed skill, and the next install/update will re-create it

### 8. Skill name sanitization

**Decision:** Already implemented in `sanitizeName` (`cli-commands/skills/install/skill-utils.ts`). Update the existing implementation to use `/[^a-z0-9._]+/g` (with `+` quantifier) so that any sequence of non-alphanumeric characters collapses to a single hyphen.

Pipeline:

1. Lowercase
2. Replace `[^a-z0-9._]+` with single hyphen (the `+` quantifier collapses runs like `"a--b"` → `"a-b"`)
3. Strip leading/trailing dots and hyphens
4. Truncate to 255 characters
5. Fall back to `"unnamed-skill"` if empty

**Rationale:** Filesystem safety across platforms. The rules are simple, predictable, and match common conventions. No encoding or hashing — human-readable output.

## Risks / Trade-offs

**Serialized installation is slower for many skills** → Acceptable for now. Typical installs are 1-5 skills. Lockfile batching can be added later if needed.

**Symlink fallback silently degrades** → The handler returns `{ result: "success" }` with a warning message noting the fallback to copy. Users can investigate and fix permissions.

**`rm -rf` on canonical directory before copy** → If interrupted mid-copy, the skill is in a broken state. Mitigation: atomic rename (write to temp, rename) could be added later. For now, re-running install fixes it.

**Lockfile write failures are swallowed** → A failed lockfile write means the skill is installed but not tracked. The next `install` will see it as "not installed" and re-install. This is the lesser evil compared to failing the whole installation.

**No Windows support for symlinks** → Deferred to a future change. The proposal already notes this. The symlink utility can be extended with `type: 'junction'` logic later.
