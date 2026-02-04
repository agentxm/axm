## Why

The codebase has accumulated **5 different representations** of skill sources and **3 different lockfile structures**. Additionally, `schemas/lockfile.ts` is **misaligned with the dry-run.md design** which is the canonical specification for these types. This creates confusion, duplication, and risks runtime inconsistencies.

## What Changes

### 1. Align schemas/lockfile.ts with dry-run.md Design

The dry-run.md design defines canonical types that `schemas/lockfile.ts` must implement:

**Add RegistryLocation schema** (missing entirely):

```typescript
type RegistryLocation = { _tag: "Remote"; url: string } | { _tag: "FileSystem"; path: string };
```

**Update SkillSource to match design** (currently has 5 variants, design has 3):
| Current Schema | Design | Action |
|----------------|--------|--------|
| `Local { path }` | `Local { path }` | Keep |
| `Git { url, ref?, subpath? }` | — | Remove (use GitHub for git repos) |
| `GitHub { owner, repo, ref?, path? }` | `GitHub { owner, repo, ref, path }` | Keep |
| `WellKnown { baseUrl, skillName }` | — | Remove (not in design) |
| `Registry { name, version }` | `Registry { location, scope, name, version }` | **Update**: add `location`, `scope` |

**Update SkillLockEntry to match LockedSkill**:
| Current Schema | Design (LockedSkill) | Action |
|----------------|----------------------|--------|
| No `name` field | `name: string` | Add (or keep as map key, design shows both) |
| `agents: NonEmptyArray` | `agents: Array` | Change to regular array |
| `installedAt: string` | `installedAt: Date` | Add schema transform |
| `updatedAt: string` | `updatedAt: Date` | Add schema transform |

### 2. Remove All Duplicate Type Definitions

**Files with duplicates to consolidate:**

| File                             | Types to Remove                                                | Migrate To            |
| -------------------------------- | -------------------------------------------------------------- | --------------------- |
| `skills/types.ts`                | `LockEntry`, `Lockfile`, `LockfileExtensions`                  | `schemas/lockfile.ts` |
| `skills/lockfile.ts`             | `LockEntrySchema`, `LockfileSchemaLegacy`                      | `schemas/lockfile.ts` |
| `skills/state/types.ts`          | `SkillSource`, `SkillSourceV2`, `LockedSkill`, `LockedSkillV2` | `schemas/lockfile.ts` |
| `skills/state/pure-functions.ts` | Local `SkillSource`, `LockedSkillNew`                          | `schemas/lockfile.ts` |

### 3. Remove All "Legacy" and "V2" Suffixed Types

- Remove `SkillSourceV2` → use `SkillSource` from schema
- Remove `LockedSkillV2` → use `LockedSkill` derived from schema
- Remove `LockedSkillNew` → use `LockedSkill`
- Remove `IdealSkillLegacy` → use `IdealSkill`
- Remove deprecated exports from `schemas/lockfile.ts`

### 4. Proper Effect Schema Decoding

Ensure all lockfile I/O uses proper schema decoding:

```typescript
// Current (BAD): Manual validation with fallback
const validateLockfile = (data: unknown): Effect.Effect<Lockfile, never> =>
  Schema.decodeUnknown(LockfileSchemaLegacy)(data).pipe(
    Effect.catchAll(() => Effect.succeed(createEmptyLockfile())),
  );

// Target (GOOD): Typed errors, no silent fallback
const decodeLockfile = (data: unknown): Effect.Effect<Lockfile, LockfileParseError> =>
  Schema.decodeUnknown(LockfileSchema)(data).pipe(
    Effect.mapError(
      (e) =>
        new LockfileParseError({
          message: "Invalid lockfile format",
          cause: e,
        }),
    ),
  );
```

### 5. Update Lockfile Structure

- **BREAKING**: Remove `extensions.skills` nesting from `skills/lockfile.ts`
- Use flat `{ lockfileVersion, skills }` structure matching `schemas/lockfile.ts`

## Capabilities

### New Capabilities

None - internal consolidation only.

### Modified Capabilities

None - no user-facing behavior changes.

## Impact

### Schema Alignment (schemas/lockfile.ts)

Changes needed to match dry-run.md:

- Add `RegistryLocationSchema` (Remote | FileSystem)
- Update `RegistrySourceSchema` to include `location` and `scope`
- Remove `GitSourceSchema` (Git URLs → GitHub or design decision needed)
- Remove `WellKnownSourceSchema` (not in design)
- Add schema transforms for `Date` fields
- Remove all deprecated exports

### Files Defining Duplicate Types

| File                             | Action                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `schemas/lockfile.ts`            | Update to match design, remove deprecated                                               |
| `skills/types.ts`                | Remove `LockEntry`, `Lockfile`, `LockfileExtensions`                                    |
| `skills/lockfile.ts`             | Rewrite to use canonical schema                                                         |
| `skills/state/types.ts`          | Remove `SkillSource`, `SkillSourceV2`, `LockedSkill`, `LockedSkillV2` + related schemas |
| `skills/state/pure-functions.ts` | Remove local `SkillSource`, `LockedSkillNew`                                            |

### Files Importing Types (need updates)

- `skills/state/load.ts`
- `skills/state/apply.ts`
- `skills/state/ideal.ts`
- `workspace/load-state.ts`
- `cli/commands/skills/install/handler.ts`

### Test Files

- `skills/lockfile.test.ts`
- `skills/state/load.test.ts`
- `skills/state/apply.test.ts`
- `schemas/lockfile.test.ts`

### Open Questions for Design Phase

1. **Git vs GitHub**: Design only has `GitHub`. Should we keep `Git` for generic git URLs (GitLab, Bitbucket, self-hosted)?
2. **WellKnown**: Design doesn't include it. Remove or add to design?
3. **RegistryLocation**: Design has it but current schema doesn't. Confirm this is needed for lockfile (vs just runtime)?
