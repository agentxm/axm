## Context

`install` and `fork` resolve their `<source>` positional argument through separate code paths:

- **Install**: `parseSourceInput(source)` → `SourceProviders.resolve()` → discover skills → select → plan. Name filtering happens post-discovery via `--skill <name>` (exact match only, no globs).
- **Fork**: Three-path `resolveInputSkills()` — glob against lockfile, exact lockfile lookup, or fallback to `parseSourceInput` → `SourceProviders.resolve()`.

Install already has `--skill` for exact name filtering after discovery. Fork has inline glob matching but only against the lockfile. The `expandGlob` function lives in `uninstall/glob.ts` and is shared between fork and uninstall.

## Goals / Non-Goals

**Goals:**

- Both `install` and `fork` accept the same source input types and resolve them through shared logic
- Glob patterns work against source-discovered skills, not just lockfile entries
- Install gains glob-based name filtering (extending existing `--skill` flag)
- Fork drops its bespoke 3-path resolver in favor of the shared approach
- Installed skill name input (e.g. `fork my-skill`) still works — resolved via lockfile → local source

**Non-Goals:**

- Changing the `uninstall` command's glob behavior (it only needs lockfile matching)
- Adding new source types (registry name input, bare name input remain unsupported)
- Changing how SourceProviders discover or fetch skills
- Modifying the plan/apply pipeline

## Decisions

### 1. Extend `--skill` to accept glob patterns instead of adding a new argument

Install already has `--skill <name>` for exact name filtering. Rather than adding a separate `--filter` or `--glob` flag, extend `--skill` to accept glob patterns (strings containing `*`).

```
axm skills install github:owner/repo --skill "effect-*"
axm skills install github:owner/repo --skill effect-basics --skill "testing-*"
```

**Why over a new flag:** `--skill` already means "filter to these names." Globs are a natural extension of name filtering. Adding a separate flag creates ambiguity about how `--skill` and `--filter` interact.

**Why over making `<source>` accept globs:** The `<source>` positional has a well-defined grammar (source strings). Mixing glob patterns into source parsing creates ambiguity — `effect-*` could be a (malformed) source string or a glob. Keeping source and name-filter as separate concerns is cleaner.

### 2. Fork takes `<source>` and optional `--skill` glob, same as install

Fork currently overloads its single `<source>` positional to mean "source string OR installed name OR glob." This overloading is the root of the problem.

**New fork CLI shape:**

```
axm skills fork <source> [--skill <pattern>...]
axm skills fork github:owner/repo --skill "effect-*"
axm skills fork ./local/path
```

For the common case of forking an installed skill by name, the installed skill name is treated as a source string that resolves to its installed location (via lockfile lookup as a local source). This preserves the `fork my-skill` shorthand without special-casing the `<source>` argument.

**Why:** Aligns fork's CLI contract with install. One positional for source, flags for filtering. Eliminates the need for fork's bespoke 3-path resolver.

### 3. Resolve installed skill names through `parseSourceInput`

Today, `parseSourceInput` returns `ParseError` for `NameInput` ("Name input is not yet supported"). Instead of special-casing installed name lookup in each command, extend the parser to resolve bare names against the lockfile as a local source.

When `parseSourceInput` encounters a `NameInput`:

1. Look up the name in the lockfile
2. If found, resolve to a local source pointing at the installed location
3. If not found, fail with a descriptive error suggesting `axm skills list`

This requires `parseSourceInput` to become effectful with a `LockfileService` dependency (it's already effectful, returning `Effect<SourceInput, ParseError>`). The lockfile dependency is acceptable because name resolution is inherently stateful.

**Why over keeping name lookup in each handler:** Centralizes resolution logic. Every command that accepts a source string gets installed-name resolution for free.

**Alternative considered — keep name lookup in handlers:** Simpler change, no new dependency on `parseSourceInput`. Rejected because it perpetuates the pattern of each command reimplementing resolution logic.

### 4. Apply glob filtering post-discovery via `expandGlob`

After `SourceProviders.resolve()` returns discovered skill refs, apply `expandGlob` to filter by name pattern. This is the same `expandGlob` function already used by uninstall and fork.

```
source → SourceProviders.resolve() → [all skill refs] → expandGlob(pattern) → [matched refs]
```

**Where the filtering happens:** In each handler, after discovery and before selection/planning. This keeps the filter close to where names are meaningful (post-discovery) and avoids pushing glob concerns into the generic SourceProviders layer.

**Why not filter inside SourceProviders.resolve():** The provider layer discovers by directory structure (SKILL.md files). Name filtering is a presentation/selection concern, not a discovery concern. Providers shouldn't need to know about globs.

### 5. Move `expandGlob` to a shared location

`expandGlob` currently lives in `cli-commands/skills/uninstall/glob.ts`. With three consumers (install, fork, uninstall), it should move to a shared utility.

**New location:** `packages/cli/src/skills/glob.ts` (or wherever the skill-name-glob capability naturally lives).

### 6. Install skill name filtering becomes glob-aware

The existing `determineSkillsToInstall` in `select-skills.ts` does exact name matching against `requestedSkills`. Change this to use `expandGlob` when any requested skill name contains `*`.

If a `--skill` value contains `*`, treat it as a glob pattern. Otherwise, keep exact matching (preserving current behavior for non-glob inputs and error messages for missing exact names).

## Risks / Trade-offs

**[Risk] `NameInput` resolution adds LockfileService dependency to parser** → Acceptable because `parseSourceInput` already returns an Effect. The lockfile lookup is a clean service dependency, not a side-channel. Commands that don't provide LockfileService (if any) would need to be updated.

**[Risk] Fork's `fork my-skill` shorthand could break if lockfile structure changes** → Mitigated by resolving through the same lockfile service used everywhere else. The lockfile is the single source of truth for installed skill locations.

**[Risk] Glob patterns in `--skill` could match unexpectedly (e.g. `*` installs everything)** → Acceptable. `--skill "*"` is equivalent to `--all`. Users must quote globs to prevent shell expansion. This matches uninstall's existing glob behavior.

**[Trade-off] Breaking change to fork's CLI** → Fork's `<source>` positional no longer accepts globs directly. Users must use `--skill` for glob filtering. The old `fork "effect-*"` becomes `fork <source> --skill "effect-*"`. This is a clearer contract but requires migration.
