## Context

The codebase has evolved organically, resulting in multiple representations of the same concepts:

- **5 SkillSource variants** across 4 files
- **3 LockedSkill variants** with V2/Legacy suffixes
- **2 Lockfile structures** (nested `extensions.skills` vs flat `skills`)

The `dry-run.md` design document defines the canonical types for the reconciliation system, but `schemas/lockfile.ts` doesn't fully align with it. This creates confusion about which types to use and risks runtime inconsistencies.

**Current state:**

- `schemas/lockfile.ts` defines Effect schemas for YAML serialization
- `skills/types.ts` defines legacy TypeScript interfaces
- `skills/state/types.ts` defines runtime types with `Option<T>` and V2 variants
- `skills/lockfile.ts` uses its own internal schemas

**Constraints:**

- Backward compatibility is explicitly a non-goal
- Must use Effect Schema for all YAML parsing/serialization
- Must align with dry-run.md design as the canonical specification

## Goals / Non-Goals

**Goals:**

- Single source of truth for lockfile types in `schemas/lockfile.ts`
- Full alignment with dry-run.md design specification
- Zero duplicate type definitions
- No "Legacy" or "V2" suffixed types
- Proper Effect Schema decoding with typed errors

**Non-Goals:**

- Backward compatibility with existing lockfiles (users will re-install)
- Migration tooling for existing lockfiles
- Changes to settings.json schema (separate concern)
- Changes to ParsedSource (parsing layer is distinct from storage layer)

## Decisions

### D1: SkillSource Variants — Keep GitHub + Git + Local

**Decision:** Keep 3 variants: `Local`, `GitHub`, `Git`

**Rationale:** The dry-run.md design only shows `GitHub`, but practical usage requires supporting GitLab, Bitbucket, and self-hosted git repos. The `Git` variant handles these with a generic URL.

**Alternatives considered:**

- _Only GitHub (per design)_: Too restrictive, forces users to mirror to GitHub
- _Expand GitHub to GitHost with provider field_: Over-engineered for current needs
- _URL-based detection_: Loses explicit type safety

**Schema:**

```typescript
type SkillSource =
  | { _tag: "Local"; path: string }
  | { _tag: "GitHub"; owner: string; repo: string; ref?: string; path?: string }
  | { _tag: "Git"; url: string; ref?: string; subpath?: string }
  | {
      _tag: "Registry";
      location: RegistryLocation;
      scope: string;
      name: string;
      version?: string;
    };
```

### D2: Remove WellKnown Variant

**Decision:** Remove `WellKnown` from SkillSource.

**Rationale:** WellKnown is a discovery mechanism for registries, not a distinct source type. Skills discovered via /.well-known/ resolve to Registry sources. The design doesn't include it, and it adds complexity without clear use cases.

**Migration:** Any existing WellKnown entries will fail schema validation. Since backward compatibility is not a goal, this is acceptable.

### D3: Add RegistryLocation to Schema

**Decision:** Include `RegistryLocation` in the lockfile schema.

**Rationale:** Reproducibility requires knowing exactly where a skill came from. A registry skill from `https://registry.example.com` is different from one at `/local/registry`. The lockfile must capture this for `axm install` to reproduce the exact state.

**Schema:**

```typescript
type RegistryLocation = { _tag: "Remote"; url: string } | { _tag: "FileSystem"; path: string };
```

### D4: Date Handling — ISO Strings with Schema Transform

**Decision:** Store as ISO 8601 strings in YAML, transform to `Date` objects in TypeScript.

**Rationale:**

- YAML doesn't have a native Date type; ISO strings are portable and human-readable
- Runtime code benefits from `Date` objects for comparisons and formatting
- Effect Schema transforms handle this cleanly

**Implementation:**

```typescript
const DateFromString = Schema.transform(Schema.String, Schema.DateFromSelf, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});
```

### D5: Single Type with Name Field

**Decision:** Single type `SkillLockEntry` that includes `name` field.

**Rationale:**

- Simpler code: one type to import and use everywhere
- No need to pass name separately or use tuples
- Redundancy in YAML (name as key + in entry) is acceptable for code simplicity

**Alternatives considered:**

- _No name field, get from map key_: Requires passing name separately, more boilerplate
- _Two types (schema + runtime)_: Duplication we're trying to eliminate

**Implementation:**

```typescript
export const SkillLockEntrySchema = Schema.Struct({
  name: Schema.String,
  source: SkillSourceSchema,
  // ...
});
export type SkillLockEntry = typeof SkillLockEntrySchema.Type;
```

### D6: agents Array — Allow Empty

**Decision:** Change from `NonEmptyArray<string>` to `Array<string>`.

**Rationale:** The dry-run.md design uses regular arrays. An empty agents array means "skill installed but not linked to any agent" which is a valid state (available in .axm but not synced).

### D7: Consolidation Strategy — Delete and Replace

**Decision:** Delete all duplicate types, update all imports to use `schemas/lockfile.ts`.

**Rationale:** With backward compatibility as a non-goal, there's no need for gradual migration or compatibility shims. Clean deletion is simpler and leaves no confusion.

**Order of operations:**

1. Update `schemas/lockfile.ts` to match design
2. Update `skills/lockfile.ts` to use canonical schema
3. Remove types from `skills/types.ts`
4. Remove types from `skills/state/types.ts`
5. Remove types from `skills/state/pure-functions.ts`
6. Update all consumers
7. Run tests, fix failures

## Risks / Trade-offs

**[Risk] Breaking change cascade through many files → Large PR, hard to review**

Mitigation: Structure the PR with clear commit boundaries:

1. Schema updates (schemas/lockfile.ts)
2. Lockfile I/O updates (skills/lockfile.ts)
3. Type removals (skills/types.ts, skills/state/types.ts)
4. Consumer updates (load.ts, apply.ts, etc.)
5. Test updates

**[Risk] Git variant not in design doc → Potential design drift**

Mitigation: Document this as an intentional extension. The design doc focuses on MVP; Git support is a practical necessity. Update design doc to include Git variant.

**[Trade-off] Removing WellKnown limits future flexibility**

Accepted: WellKnown can be re-added when registry infrastructure lands. Keeping unused code adds confusion. YAGNI.

**[Trade-off] Name stored redundantly in YAML (as map key and in entry)**

Accepted: Code simplicity outweighs storage efficiency. Single type is easier to work with than passing name separately.

## File Changes Summary

| File                             | Changes                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `schemas/lockfile.ts`            | Add RegistryLocation, update SkillSource variants, remove deprecated exports   |
| `skills/types.ts`                | Remove LockEntry, Lockfile, LockfileExtensions                                 |
| `skills/lockfile.ts`             | Rewrite to use LockfileSchema, remove internal schemas                         |
| `skills/state/types.ts`          | Remove SkillSource, SkillSourceV2, LockedSkill, LockedSkillV2, related schemas |
| `skills/state/pure-functions.ts` | Remove local SkillSource, LockedSkillNew                                       |
| `skills/state/load.ts`           | Update imports                                                                 |
| `skills/state/apply.ts`          | Update imports, update conversion functions                                    |
| `skills/state/ideal.ts`          | Update imports                                                                 |
| `workspace/load-state.ts`        | Update imports                                                                 |
| Test files                       | Update to use new types                                                        |

## Open Questions

None — all questions from the proposal have been resolved in the decisions above.
