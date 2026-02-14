## Context

Extensions currently have no versioning model. Settings stores bare source strings (`@acme/tool`) with no version intent. The lockfile pins exact resolved versions but with no constraint to update against. Pack manifest version ranges (`"^1.0.0"`) exist syntactically but are never evaluated — `selectVersion` in the registry provider just picks the newest version that passes agent filtering.

Pack dependencies are written to `settings.json` via the same `ws.setSkill()` path as user installs, making them indistinguishable from user-installed skills. This prevents safe pack uninstall cleanup and creates user confusion about what they explicitly installed.

The source string already supports an `@version` suffix (e.g., `@acme/tool@^1.0.0`) in parsing, but the version portion is consumed during resolution and not persisted.

## Goals / Non-Goals

**Goals:**

- Establish a simple, uniform version expression model across all contexts (user install, pack manifest, pack add)
- Enable constraint-aware version resolution using semver range matching
- Separate user intent (settings) from pack intent (pack lock entries) — derived ownership with no new schema fields
- Support `axm update` with constraint-aware re-resolution and informative warnings
- Accept any valid semver range via the `semver` library, recommend three common forms

**Non-Goals:**

- Dependency resolution between skills (skills have no transitive dependencies on each other)
- Lock-step version coordination across multiple registries
- Migration tooling for existing settings with pack-installed skill entries

## Decisions

### 1. Version expressions: full semver ranges via `semver` library

**Decision**: Accept any valid semver range string using the `semver` npm package. Recommend three common forms in documentation and CLI output:

| Form         | Meaning                         | Recommended for                 |
| ------------ | ------------------------------- | ------------------------------- |
| (none) / `*` | Latest always                   | Most users, most pack authors   |
| `^x.y.z`     | Compatible updates within major | Pack authors wanting stability  |
| `x.y.z`      | Exact pin                       | Locking to a known-good version |

All other valid semver ranges (`~1.2.3`, `>=1.0.0 <2.0.0`, etc.) are accepted without restriction.

**Rationale**: The `semver` library handles parsing, matching, and edge cases (e.g., `^0.x` caret semantics) correctly. Using it is simpler than building a custom parser, even for a limited subset. Accepting full range syntax costs nothing — the library handles it — while artificially restricting input would require validation code that adds complexity without value.

**Alternatives considered**:

- Custom in-house parser for three forms only: More code to write and maintain than `semver.satisfies()`. Misses edge cases like `^0.1.0` semantics. Artificially limits power users.
- Two forms only (`*` and exact): Too coarse — no way to say "compatible updates within major."

### 2. "Stay current" as default

**Decision**: No version in the source string means `*` (latest). This is the default for both user installs and pack author dependencies.

**Rationale**: Agent skills are instruction sets, not code APIs. A newer version is generally better. Users who need stability pin explicitly. This matches user expectation — `axm install @acme/tool` should give the latest and keep giving the latest on update.

**Alternatives considered**:

- Default to `^resolved` (npm-style): Forces users into constraint management they didn't ask for. A user who types `axm install @acme/tool` likely wants "latest," not "^1.2.3."
- Default to exact pin: Too conservative for this domain. Forces manual updates for every skill.

### 3. Version constraint embedded in source string

**Decision**: Store version constraints in the existing source string field in settings — `@acme/tool@^1.0.0`. No new schema fields.

**Rationale**: The source string parser already handles the `@version` suffix. Persisting it requires no schema changes. The absence of a version portion naturally represents `*`. Settings files remain human-readable and editable.

**Alternatives considered**:

- Separate `version` field on `SkillEntryObjectSchema`: Adds schema complexity. Splits related information across two fields. Forces all code paths to check two locations.
- Version in lockfile only: Loses user intent — can't distinguish "I chose ^1.0.0" from "I got 1.2.3."

### 4. Constraint priority: user > pack > latest

**Decision**: User explicit constraints always win. Pack constraints apply when the user has no constraint (or `*`). Multiple pack constraints are intersected when compatible; highest wins with a warning when incompatible.

**Rationale**: The user is the workspace owner. If they explicitly constrain a version, they're making a conscious choice that overrides any pack's opinion. This is the user's escape hatch for pack-to-pack conflicts and for opting into newer versions than a pack expects.

**Scope**: Version constraints apply to registry-sourced extensions only. Non-registry sources (git, GitHub, local, etc.) continue using refs, branches, and paths — semver does not apply to them.

**Resolution algorithm** (version-based, not range arithmetic):

```
1. Collect all constraints on a skill:
   - User constraint: from settings source string (or * if absent)
   - Pack constraints: from each pack's axm-pack.json manifest on disk

2. If user has explicit constraint (not *):
   - Resolve against available versions with user constraint only.
   - First version satisfying user constraint → use it. Done.
   - No version satisfies → fail with error
     ("no version of @scope/name satisfies <constraint>").

3. If user has * (or no constraint):
   - Collect all pack constraints into a constraint set.
   - For each candidate version (newest first from index.json):
     a. Check semver.satisfies() against ALL pack constraints.
     b. First version satisfying all → use it. Done.
        (Handles compatible constraints.)
     c. If no version satisfies all → use newest available version.
        Warn about each unsatisfied pack constraint.
```

This avoids range intersection arithmetic entirely — just iterate versions and check satisfaction. User constraints are hard failures; pack conflicts are soft warnings.

**Warning behavior**:

- Warn when a pack constraint holds back a user-installed skill with `*` intent (step 3b selected a version below latest)
- Warn when no version satisfies all pack constraints (step 3c — incompatible packs)
- No warning when user explicitly constrains (step 2 — they chose this)
- Error when user constraint is unsatisfiable (step 2 — no matching version)

### 5. Derived ownership — no new schema fields

**Decision**: Ownership is derived by cross-referencing settings and pack lock entries. No `installedBy` or `owners` field on skill lock entries.

**Derivation**:

- Skill in `settings.json` → user-owned
- Skill FQN in any pack's `resolvedSkills` → pack-owned
- Both → shared (reference-counted)
- Neither → orphan (safe to clean up)

**Correlation**: Registry skill lock entries have `scope` and `name` fields. Pack `resolvedSkills` uses FQN keys (`@scope/name`). Match by constructing FQN from lock entry fields.

**Rationale**: The data already exists in two places (settings + pack lock entries). Adding an explicit ownership field creates a third source of truth that must be kept in sync. Derivation is simple — scan a handful of pack entries — and always consistent.

### 6. Pack dependencies excluded from settings

**Decision**: `installSkill` called during pack install skips `ws.setSkill()` for the settings portion. Pack deps are written to the skills lock map (for physical install tracking) and the pack's `resolvedSkills` (for ownership), but not to settings.

**Implementation approach**: Add a parameter to the pack install flow that indicates the skill is a pack dependency. The skill install executor writes to the lockfile but not to settings. This could be a flag on the install operation, or a separate code path for pack dependency installation.

**Rationale**: Settings is "what the user asked for." Pack deps are what the pack asked for. Mixing them creates the ownership ambiguity we're solving.

### 7. Semver matching via `semver` npm package

**Decision**: Use the `semver` npm package for all version parsing, range validation, and satisfaction checking.

**Key functions used**:

- `semver.satisfies(version, range)`: Check if a version satisfies a constraint
- `semver.validRange(range)`: Validate user/author-provided range strings
- `semver.valid(version)`: Validate version strings from registry

**Integration point**: Extend `selectVersion` in `registry.ts` to accept a version constraint parameter. Filter versions with `semver.satisfies(version.version, constraint)` in addition to the existing agent filter. The constraint comes from resolution metadata (parsed from source string or pack manifest). The registry's `index.json` already lists versions newest-first, so matching is: iterate versions, return first that satisfies constraint and passes agent filter.

**Rationale**: Battle-tested library that correctly handles all semver edge cases (`^0.x` behavior, pre-release ordering, hyphen ranges, etc.). Eliminates custom parsing code entirely. Widely used (>60M weekly downloads), well-maintained, minimal footprint.

### 8. Pack add defaults to `*`

**Decision**: `axm pack add @acme/tool` writes `"@acme/tool": "*"` to the pack manifest instead of `"@acme/tool": "^1.2.3"`. Authors constrain via inline syntax: `axm pack add @acme/tool@^1.0.0`.

**Rationale**: Consistent with the "stay current" philosophy. Pack authors who don't specify a version are saying "I trust upstream." Authors who need compatibility guarantees specify it inline — same syntax as everywhere else.

### 9. Pack versioning follows the same model

**Decision**: Packs use the same version constraint model as skills. `axm packs install @acme/starter-pack@^2.0.0` persists the constraint in settings, lockfile stores the exact resolved version, and `axm update` re-resolves packs within their constraints.

**Settings**: `"starter": "@acme/starter-pack@^2.0.0"` (or bare `"@acme/starter-pack"` for `*`).

**Lockfile**: Pack lock entry's `resolvedVersion` stores the exact resolved version, same as today.

**Rationale**: Uniform model — one set of rules for all extensions. No reason to treat pack versioning differently from skill versioning.

### 10. Pack update cascades to dependencies

**Decision**: `axm update` updates both skills and packs. When a pack updates to a new version, its manifest is re-read and dependencies are reconciled.

**Pack update flow**:

```
1. Re-resolve pack version within its constraint (from settings source string).
2. If pack version changed:
   a. Fetch new pack archive, extract to managed location.
   b. Read new manifest's dependency map.
   c. Compare to old manifest's dependency map:
      - New deps (in new, not in old): install them.
      - Removed deps (in old, not in new): mark for orphan check.
      - Changed constraints: re-resolve with new constraint.
   d. Run orphan detection on removed deps
      (keep if user-owned or referenced by another pack).
   e. Update pack lock entry with new resolvedVersion and resolvedSkills.
3. If pack version unchanged: still re-resolve pack's skill deps
   within their constraints (a dep may have a newer version available).
```

**Rationale**: Users expect `axm update` to update everything. A pack that pins `^1.0.0` for a skill should pick up `1.1.0` when it's published, even if the pack itself hasn't changed. Step 3 ensures pack deps stay current within their constraints.

## Risks / Trade-offs

**"Stay current" default means packs can break silently** — A pack author who uses `*` hasn't tested against future versions. If a skill publishes a breaking change, the pack may stop working for new installs.
→ Acceptable for this domain. Skills are instruction sets with low coupling. Pack authors who need stability constrain explicitly.

**No migration for existing settings** — Existing settings files may have pack-installed skills as top-level entries. After this change, those entries become "user-owned" even though the user didn't install them.
→ These entries are harmless — they just mean the user "also owns" what the pack brought in. Over time, pack reinstall/update cycles will normalize state.

**Constraint priority means packs can be overridden** — A user setting `^2.0.0` on a skill that a pack constrains to `^1.0.0` means the pack gets v2 which it wasn't tested against.
→ This is intentional. The user explicitly opted in. The pack may warn or degrade but won't block the user.

**New dependency** — Adding `semver` introduces a runtime dependency.
→ Low risk. `semver` is one of the most widely used npm packages, well-maintained, and has zero transitive dependencies.
