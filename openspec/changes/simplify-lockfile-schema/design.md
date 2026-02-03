## Context

The current lockfile schema uses Effect's `Schema.TaggedStruct` for discriminated unions, producing YAML with nested `_tag` fields:

```yaml
source:
  _tag: GitHub
  owner: wayne-industries
  repo: skills
```

This is verbose and unfamiliar to users expecting simple YAML. The internal type safety is valuable, but the serialized format should be human-friendly.

## Goals / Non-Goals

**Goals:**

- Flat, readable YAML structure for lockfiles
- Simple `source` string discriminator instead of `_tag`
- Source-specific fields at entry level, not nested

**Non-Goals:**

- Backward compatibility with existing lockfiles (regenerate via reinstall)
- Supporting new source types (scope limited to schema flattening)

## Decisions

### Decision 1: Use `source` string as discriminator

**Choice**: `source: "github"` instead of `source: { _tag: "GitHub", ... }`

**Rationale**: Standard YAML pattern. Most package managers (npm, cargo, pip) use simple string types.

**Alternatives considered**:

- Keep `_tag` pattern: Rejected - unfamiliar to users, verbose
- Use `type` field: Rejected - `source` is more descriptive for this context

### Decision 2: Flatten source fields to entry level

**Choice**: All source-specific fields (owner, repo, ref, path, url) at the lock entry level.

**Rationale**: Reduces nesting depth, makes YAML more scannable.

**Alternatives considered**:

- Keep nested but remove `_tag`: Rejected - still requires nesting for no benefit

### Decision 3: Use lowercase source type names

**Choice**: `"github"`, `"git"`, `"local"`, `"registry"` (lowercase)

**Rationale**: Matches YAML conventions and other package managers.

### Decision 4: Remove redundant `name` field

**Choice**: Lock entry name is the map key only, not stored redundantly in the value.

**Rationale**: DRY principle. The key `my-skill:` is the name.

### Decision 5: Keep `version` field for registry sources

**Choice**: Retain optional `version` field for registry sources (semver).

**Rationale**: Registry sources need explicit version tracking separate from git ref.

## Risks / Trade-offs

**[Risk] Existing lockfiles become invalid** → Mitigation: Users regenerate via `axm install`. No migration tool needed for experimental API.

**[Risk] Schema validation complexity** → Mitigation: Use Schema.Union with literal discriminators, Effect handles this well.

**[Trade-off] Less type-safe discriminator** → The string-based `source` is slightly less ergonomic in TypeScript than tagged unions, but Schema.Union with literals still provides exhaustive checking.
