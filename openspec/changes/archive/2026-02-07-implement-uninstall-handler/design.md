## Context

The `axm skills uninstall` command has a yargs definition and handler stub but no implementation. The install handler establishes the plan-based reconciliation pattern: parse input → build operations → load lockfile → build plan → resolve plan. The uninstall handler follows this same flow but is simpler — no source parsing, discovery, or remote cloning. The lockfile is the source of truth for what's installed.

Key existing infrastructure:

- `UninstallSkillOperation` type already defined in `operations.ts` with `UninstallSkillArgs { skillName: string }`
- `removeLockEntry(axmDir, skillName)` already exists in lockfile module
- `ws.resolvePlan(plan, handlers)` handles display, confirm, and apply generically
- `OperationHandler<Op, R>` type for typed operation executors
- Lockfile entries track `agents: string[]` per skill — needed to know which symlinks to remove
- Install uses `CANONICAL_SKILLS_DIR = ".agents/skills"` for the single-copy canonical location
- Install uses `sanitizeName()` for filesystem-safe skill names

## Goals / Non-Goals

**Goals:**

- Implement the uninstall handler following the same plan-based reconciliation pattern as install
- Support glob patterns (`*` wildcard) to match multiple skills by name
- Remove canonical directory, agent symlinks, and lockfile entry per skill
- Support partial uninstall via `--agent` flag (remove from specific agents only)
- Reuse existing plan infrastructure (`ws.resolvePlan`, `displayPlan`, `applyPlan`)

**Non-Goals:**

- No interactive skill selection (multiselect prompt) — user specifies skill name(s) directly or via glob
- No `--force` flag — uninstall is always destructive (confirmation prompt handles safety)
- No dry-run beyond `--preview` (already handled by workspace)
- No undo/restore capability

## Decisions

### 1. Glob expansion against lockfile keys

Expand glob patterns early, before building operations. Convert the user's `skill` argument to a list of concrete skill names by matching against `Object.keys(lockfile.skills)`.

**Approach:** Convert `*` wildcards to regex (`*` → `.*`), anchor the pattern (`^...$`), and test each lockfile key. Escape other regex metacharacters in the literal portions. This is a pure function: `(pattern: string, skillNames: ReadonlyArray<string>) => ReadonlyArray<string>`.

**Why not a glob library:** Skill names are flat strings (no paths, no separators). We only need `*`. A library would be overkill and add a dependency.

**Zero matches:** If a pattern (or literal name) matches nothing in the lockfile, it still produces a `UninstallSkillOperation` — the plan builder marks it as `no-op` ("not installed"). This gives the user clear feedback via the plan display rather than a silent skip.

### 2. UninstallSkillArgs needs agent context

The current `UninstallSkillArgs` only has `skillName`. The operation handler needs to know which agents to remove symlinks from. Two options:

**Option A (chosen):** Read agents from the lockfile entry inside the operation handler. The handler already has access to `Workspace` → `getLockfile()`. This keeps the operation args minimal and the lockfile as the single source of truth.

**Option B (rejected):** Expand `UninstallSkillArgs` to include agents. This duplicates information already in the lockfile and couples the operation definition to implementation details.

For partial uninstall (`--agent` flag), pass the target agents through the operation args so the handler can scope its work. Add an optional `agents` field to `UninstallSkillArgs`.

### 3. Uninstall operation handler pipeline

Mirror the install handler's structure but in reverse:

1. Get workspace context (axmDir, base path)
2. Sanitize skill name (reuse `sanitizeName()`)
3. Read lockfile to get agent list for this skill
4. Remove agent symlinks/copies concurrently (per agent from lockfile entry or `--agent` filter)
5. Remove canonical directory (`.agents/skills/{sanitizedName}`)
6. Remove lockfile entry (via `removeLockEntry`)
7. Return `OperationResult`

Canonical directory removal happens _after_ symlink removal since symlinks may point to it.

### 4. Partial uninstall (--agent flag)

When `--agent` is provided, only remove symlinks for those agents, not the canonical directory. Update the lockfile entry's `agents` array to remove the specified agents. If the `agents` array becomes empty after removal, treat it as a full uninstall (remove canonical dir and lockfile entry).

### 5. Handler flow

```
handleUninstall(args)
  1. ws = yield* Workspace
  2. lockfile = yield* ws.getLockfile()
  3. skillNames = expandGlob(args.skill, Object.keys(lockfile.skills))
  4. ops = skillNames.map(name => ({ name: "uninstall-skill", args: { skillName: name, agents: args.agent } }))
  5. plan = buildPlan(ops, lockfile, "Uninstall skill(s)", ...)
  6. yield* ws.resolvePlan(plan, { "uninstall-skill": uninstallSkill })
  7. yield* clack.outro("Done")
```

### 6. File organization

Following the install handler structure:

- `uninstall/handler.ts` — Orchestration (replace stub)
- `uninstall/build-plan.ts` — Pure plan builder
- `uninstall/uninstall-skill.ts` — Operation handler
- `uninstall/glob.ts` — Glob expansion utility (pure function)

## Risks / Trade-offs

- **[Stale lockfile]** → If files on disk don't match lockfile (manual edits), uninstall may leave orphaned files or fail to remove files not tracked. Mitigation: operation handler removes by known paths (canonical + agent symlinks) and swallows "not found" errors gracefully.
- **[Glob matches too broadly]** → `*` alone would match everything. Mitigation: the plan preview shows all matched skills before confirmation. The `--preview` flag lets users check first.
- **[Partial uninstall complexity]** → Tracking which agents remain installed adds conditional logic. Mitigation: if agents list empties, promote to full uninstall — simple rule, no ambiguity.
