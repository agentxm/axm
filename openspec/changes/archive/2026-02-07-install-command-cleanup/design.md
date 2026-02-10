## Context

The `skills install` command has three production files (`discover-skills.ts`, `parse-manifests.ts`, `skill-utils.ts`) that use `node:path` directly instead of `@effect/platform`'s `Path.Path` service. The sibling `install-skill.ts` and `uninstall-skill.ts` already use `Path.Path` correctly, so the pattern is established in the codebase. Additionally, `InstallError` and `DiscoveryError` use `Option<unknown>` for their `cause` field, which is non-standard compared to the rest of the codebase.

## Goals / Non-Goals

**Goals:**

- Migrate all `node:path` usage in install production code to `@effect/platform` `Path.Path`
- Standardize `InstallError` and `DiscoveryError` cause fields to `unknown`
- Replace `.flat()` with idiomatic `Array.flatten`
- Remove unnecessary `as const` assertions in `build-plan.ts`

**Non-Goals:**

- Migrating test files from `node:path` — tests use Node.js APIs directly per convention
- Migrating `node:crypto` (`randomUUID`) or `node:os` (`tmpdir`) — `@effect/platform` doesn't wrap these
- Changing the discovery algorithm or install pipeline behavior
- Refactoring function signatures beyond what's needed for the `Path.Path` migration

## Decisions

### D1: `skill-utils.ts` — keep pure, accept basename as a parameter

`getSkillDisplayName` and `filterSkills` are pure functions. Making them effectful just to access `Path.Path` for a single `basename()` call would be over-engineering.

**Approach:** Extract the `basename` call to the call site. Change `getSkillDisplayName` to accept the pre-computed basename fallback as a parameter, or inline the logic at the single call site where the path fallback is needed.

**Alternative considered:** Make `getSkillDisplayName` return an `Effect` requiring `Path.Path`. Rejected because it would force every consumer into `Effect.gen` for a trivial string operation, and `filterSkills` chains on it — the ripple would be disproportionate.

**Alternative considered:** Import `@effect/platform-node/NodePath` to get a non-effectful path instance. Rejected because that couples to the Node.js implementation and defeats the purpose of the service pattern.

**Decision:** Accept `node:path` in `skill-utils.ts` as a boundary exception. The functions are pure utilities doing string manipulation with `basename` — effectively string operations, not filesystem access. This matches how `sanitizeName` already works (pure string manipulation, no platform dependency). Add a comment noting the exception.

### D2: `discover-skills.ts` — yield `Path.Path` alongside `FileSystem.FileSystem`

All effectful functions in `discover-skills.ts` already yield `FileSystem.FileSystem` inside `Effect.gen`. Adding `Path.Path` follows the same pattern used in `install-skill.ts`.

**Approach:** Add `Path.Path` to each function's service requirements. Replace all `nodePath.join/resolve/relative` calls with `path.join/resolve/relative` from the yielded service. Remove the `node:path` import.

Functions affected:

- `tryParseSkillInDir` — uses `join`
- `scanDirectory` — uses `join`
- `recursiveScan` — uses `join`
- `discoverSkillsInDir` — uses `join`, `resolve`
- `discoverFromRemoteGitSource` — uses `join`, `relative`

### D3: `parse-manifests.ts` — yield `Path.Path` alongside `FileSystem.FileSystem`

Same pattern as D2. All functions already have `FileSystem.FileSystem` in their dependency channel.

Functions affected:

- `validatePath` — currently pure, uses `resolve`, `dirname`, `sep`. Must become effectful or accept a `Path.Path` instance.
- `validateDirPath` — same as `validatePath`
- `resolvePluginBase` — uses `resolve`
- `parseMarketplaceJson` — uses `join`
- `parsePluginJson` — uses `join`

**Approach for `validatePath`/`validateDirPath`:** These are called inside `Effect.gen` functions that already have `Path.Path` available. Pass the yielded `path` instance as a parameter rather than making these simple validators effectful themselves. This keeps them as pure functions while eliminating the `node:path` import.

Signature change: `validatePath(rawPath, basePath)` → `validatePath(rawPath, basePath, path)` where `path` is the `Path.Path` service instance.

### D4: `InstallError` and `DiscoveryError` cause — change to `unknown`

Both error types currently use `cause: Option.Option<unknown>`. The project convention is `cause: unknown` for `Data.TaggedError`. This means call sites change from `Option.some(error)` to just `error` and from `Option.none()` to `undefined`.

**Scope:** `InstallError` is used in `handler.ts`, `discover-skills.ts`, and `select-skills.ts`. `DiscoveryError` is used only in `discover-skills.ts`. All call sites need updating.

### D5: `Array.flatten` over `.flat()`

Replace `results.flat()` with `Array.flatten(results)` in `discover-skills.ts` (lines 174, 222). This is a direct 1:1 substitution since `Array.flatten` from `effect/Array` does the same thing.

### D6: `build-plan.ts` — remove `as const` assertions

The `as const` assertions on `"PlannedJobStep"`, `"no-op"`, and `"success"` are unnecessary because the object literals are already constrained by the `Plan<AddSkillOperation>` return type. Remove them for cleaner code.

## Risks / Trade-offs

- **`Path.Path` threading in `parse-manifests.ts`** — Passing the path instance as a parameter to `validatePath`/`validateDirPath` adds a parameter but keeps the functions pure and testable.
  → Acceptable trade-off: one extra parameter vs. making simple validators effectful.

- **`skill-utils.ts` exception** — Keeping `node:path` here deviates from the convention.
  → Mitigated by comment explaining the rationale. The functions are string manipulation utilities, not I/O.

- **Broad `InstallError` cause change** — Many call sites across 3 files need updating.
  → Low risk: mechanical find-and-replace of `Option.some(error)` → `error` and `Option.none()` → `undefined`.

- **`node:os` and `node:crypto` kept** — `tmpdir()` and `randomUUID()` stay as-is in `discover-skills.ts`.
  → `@effect/platform` doesn't provide alternatives for these. They're boundary calls, not path computation.
