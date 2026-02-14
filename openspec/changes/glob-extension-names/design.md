## Context

The `skills fork` command currently requires a single source string (installed skill name, local path, or remote URL) as its positional argument, plus an optional `--skill` flag for glob filtering _within_ that source. To fork multiple skills by name pattern (e.g., all `effect-*` skills), users must either:

1. Point at a directory containing all the skills and use `--skill "effect-*"` to filter, or
2. Run `skills fork` once per skill

The glob expansion utility (`expandGlob`/`expandGlobs` in `skills/glob.ts`) already exists and is used by `--skill` filtering and `packs add`. The source parser (`sources/parser.ts`) classifies input into typed patterns but has no glob variant — `NAME_PATTERN` requires `[a-zA-Z0-9-]` only, so `"effect-*"` falls through to `Option.none()`.

`packs add` already supports glob patterns for the extension argument. `packs new` needs no change.

## Goals / Non-Goals

**Goals:**

- `axm skills fork "effect-*"` expands the glob against installed skill names (from the lockfile) and forks all matches in a single plan
- Glob detection happens early in the fork handler — no changes to the core resolution pipeline (`resolveSource`, `parseInputPattern`)
- Reuse existing `expandGlobs` from `skills/glob.ts`

**Non-Goals:**

- Changing `resolveSource` return type or adding glob awareness to the core resolution pipeline — globs are a command-level convenience, not a source format
- Glob support in `skills install` or other commands (can be added later with the same pattern)
- Multi-pattern support (e.g., `axm skills fork "effect-*" "testing-*"`) — single pattern only, matching current positional arg cardinality

## Decisions

### 1. Handle glob at the command level, not in source resolution

**Choice:** Detect globs in the `skills fork` handler before calling `resolveSource`. When detected, expand against lockfile skill names and resolve each match individually.

**Why not add `GlobPatternInput` to `parseInputPattern`?**

- `resolveSource` returns a single `Source` — globs produce multiple. Changing the return type would ripple through every consumer.
- Globs are a UX convenience for batch operations, not a source format. Keeping them at the command level is simpler and more cohesive.

**Why not a shared `resolveSourcesWithGlob` wrapper?**

- Only `skills fork` needs this today. If more commands need it, extract then. YAGNI.

### 2. Glob detection via `isGlobPattern`

**Choice:** Add a simple `isGlobPattern` predicate to `skills/glob.ts`:

```typescript
export const isGlobPattern = (input: string): boolean => input.includes("*");
```

This is the same heuristic used by `packs add` handler (which checks `args.extension.includes("*")`). Centralizing it avoids duplication.

### 3. Expand against lockfile skill names

**Choice:** When a glob is detected, read all installed skill names from the lockfile via `ws.getLockedSkills()`, expand the pattern, then resolve each matched name through the existing `resolveSource` → `routeNameInput` path.

**Why lockfile and not filesystem scan?**

- Lockfile is the source of truth for installed skills
- Already available via `Workspace` service
- Consistent with how `routeNameInput` works (it looks up the lockfile)

### 4. Concurrent resolution and discovery

**Choice:** After expanding the glob to N skill names, resolve and discover each concurrently with `Effect.forEach(..., { concurrency: "unbounded" })`, then merge all discovered `SkillRef`s into a single list before plan building.

This avoids O(N) sequential resolution calls.

### 5. Fork handler flow with glob

The modified handler flow:

```
source arg
  ├─ contains "*" → expand against lockfile names
  │   ├─ 0 matches → fail with NO_SKILLS_MATCHED (list available names)
  │   └─ N matches → for each: resolveSource → resolveExtension → collect SkillRefs
  │       └─ merge into single discovered list → continue at step 4 (--skill filter)
  └─ no "*" → existing flow (resolveSource → resolveExtension → single source)
```

The `--skill` filter still applies after glob expansion, enabling `axm skills fork "effect-*" --skill "effect-basics"` (though unlikely).

## Risks / Trade-offs

- **Glob only matches installed skills** — `axm skills fork "effect-*"` won't match uninstalled skills. This is intentional: forking requires a local source to copy from, and the lockfile tells us where each skill lives. Users who want to fork from a remote source should use `axm skills fork <remote-source> --skill "effect-*"`.
  → Mitigation: Error message should clarify this when no matches found.

- **N sequential source resolutions** — Each matched name goes through `resolveSource` individually (lockfile lookup + local path parse). This is fast (no I/O beyond the initial lockfile read, which is cached by the Workspace service) but could be optimized by batching if needed.
  → Mitigation: Lockfile is read once and cached. Each `routeNameInput` call just indexes into the cached map.
