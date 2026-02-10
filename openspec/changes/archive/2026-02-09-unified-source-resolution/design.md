## Context

`install` and `fork` resolve their `<source>` positional argument through separate code paths:

- **Install**: `parseSourceInput(source)` → `SourceProviders.resolve()` → discover skills → select → plan. Name filtering happens post-discovery via `--skill <name>` (exact match only, no globs).
- **Fork**: Three-path `resolveInputSkills()` — glob against lockfile, exact lockfile lookup, or fallback to `parseSourceInput` → `SourceProviders.resolve()`.

The source resolution layer has two distinct concerns today conflated under one name: `parseInputPattern` is the pure classifier (string → `InputPattern` union), while `parseSourceInput` is the effectful resolver (string → `Effect<SourceInput>`). The name `parseSourceInput` obscures the fact that it already does more than parsing — it dispatches to provider-specific resolvers and shorthand expanders.

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

### 3. Rename `parseSourceInput` → `determineSourceInput` and resolve installed skill names

There are two layers today:

- `parseInputPattern` — pure function that classifies a string into an `InputPattern` discriminated union (no Effect, no dependencies)
- `parseSourceInput` — effectful function that takes an `InputPattern` and resolves it to a `SourceInput`

The name `parseSourceInput` understates what this function does. It doesn't just parse — it resolves shorthands, looks up hosts, and dispatches to provider-specific parsers. Renaming to `determineSourceInput` makes the responsibility clear: it _determines_ the source from user input, which naturally includes looking things up.

With the rename, adding a `LockfileService` dependency becomes obvious rather than surprising. When `determineSourceInput` encounters a `NameInput`:

1. Look up the name in the lockfile via `LockfileService`
2. If found, resolve to a local source pointing at the installed location
3. If not found, fail with a descriptive error suggesting `axm skills list`

`determineSourceInput` already returns `Effect<SourceInput, ParseError>`. The new `LockfileService` requirement adds to the `R` channel and propagates automatically to callers via inference.

**Why over keeping name lookup in each handler:** Centralizes resolution logic. Every command that accepts a source string gets installed-name resolution for free.

**Alternative considered — keep name lookup in handlers:** Simpler change, no new dependency. Rejected because it perpetuates the pattern of each command reimplementing resolution logic.

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

## Code Sketches

### Install handler — minimal change

The install handler structure stays the same. The only change is in `select-skills.ts` where `determineSkillsToInstall` becomes glob-aware:

```typescript
// BEFORE (select-skills.ts): exact match only
if (args.requestedSkills.length > 0) {
  const invalidSkills = Array.filter(
    args.requestedSkills,
    (name) => !skills.some((s) => s.skill.name === name),
  );
  // ... error if invalid ...
  return Array.filter(skills, (s) => args.requestedSkills.includes(s.skill.name));
}

// AFTER: glob-aware matching via expandGlobs
if (args.requestedSkills.length > 0) {
  const allNames = Array.map(skills, (s) => s.skill.name);
  const matched = expandGlobs(args.requestedSkills, allNames);
  if (matched.length === 0) {
    // ... error listing available names ...
  }
  return Array.filter(skills, (s) => matched.includes(s.skill.name));
}
```

Additionally, the install handler stops passing `args.skills` into `findOptions.names` (pass `[]` instead) so the provider discovers everything and glob filtering happens post-discovery in `determineSkillsToInstall`.

### Fork handler — replace `resolveInputSkills` with shared flow

The entire `resolveInputSkills` function (103-192), `ResolvedSkill` type, `isGlobPattern`, and `getInstalledSkillRelativePath` are deleted. The fork handler adopts the same parse → discover → filter structure as install:

```typescript
// BEFORE: bespoke 3-path resolveInputSkills(args.source, base)
const resolvedSkills = yield * resolveInputSkills(args.source, base);

// AFTER: shared flow (same as install)
const source =
  yield *
  determineSourceInput(args.source).pipe(
    Effect.mapError((e) => new ForkError({ message: `Invalid source: ${e.message}`, cause: e })),
  );

const allRefs = yield * sources.resolve(source, { names: [], agents: [], type: "skill" });
const discoveredSkills = Array.filter(allRefs, (ref) => ref.type === "skill");

// Apply --skill glob filter (new)
const filtered =
  args.skills.length > 0
    ? Array.filter(discoveredSkills, (s) =>
        expandGlobs(
          args.skills,
          Array.map(discoveredSkills, (r) => r.skill.name),
        ).includes(s.skill.name),
      )
    : discoveredSkills;
```

The plan building (steps 4+) uses `filtered` and accesses `ref.skill.name` / `ref.location` directly from `SkillRef` instead of the intermediate `ResolvedSkill` type.

### `determineSourceInput` — handle `NameInput` via lockfile

In `parser.ts`, rename the function and resolve the `NameInput` branch:

```typescript
// BEFORE
Match.tag("NameInput", () =>
  Effect.fail(new ParseError({ message: "Name input is not yet supported", input })),
),

// AFTER
Match.tag("NameInput", ({ name }) =>
  Effect.gen(function* () {
    const ls = yield* LockfileService;
    const skills = yield* ls.getSkills();
    if (!(name in skills)) {
      return yield* new ParseError({
        message: `Unknown skill "${name}". Check installed skills with \`axm skills list\`.`,
        input,
      });
    }
    return yield* parseLocalPath(getInstalledSkillPath(name, skills[name]));
  }),
),
```

### Shared `expandGlobs`

New multi-pattern function alongside existing `expandGlob`, in a shared module:

```typescript
// packages/cli/src/skills/glob.ts (moved from uninstall/glob.ts)
export const expandGlobs = (
  patterns: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const matched = new Set<string>();
  for (const pattern of patterns) {
    for (const name of expandGlob(pattern, names)) {
      matched.add(name);
    }
  }
  return names.filter((n) => matched.has(n)); // preserve original order
};
```

## Risks / Trade-offs

**[Risk] `NameInput` resolution adds LockfileService dependency to `determineSourceInput`** → The rename from `parseSourceInput` makes this natural — "determine" implies lookup, not just parsing. The `LockfileService` dependency propagates via Effect's `R` channel inference. Callers already provide `LockfileService` in their runtime layers.

**[Risk] Fork's `fork my-skill` shorthand could break if lockfile structure changes** → Mitigated by resolving through the same lockfile service used everywhere else. The lockfile is the single source of truth for installed skill locations.

**[Risk] Glob patterns in `--skill` could match unexpectedly (e.g. `*` installs everything)** → Acceptable. `--skill "*"` is equivalent to `--all`. Users must quote globs to prevent shell expansion. This matches uninstall's existing glob behavior.

**[Trade-off] Breaking change to fork's CLI** → Fork's `<source>` positional no longer accepts globs directly. Users must use `--skill` for glob filtering. The old `fork "effect-*"` becomes `fork <source> --skill "effect-*"`. This is a clearer contract but requires migration.
