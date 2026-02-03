## Context

The codebase has two places defining source types:

- `LockSourceTypeSchema` in lockfile.ts - a `Schema.Literal("github", "git", "local", "registry")`
- Settings schema with complex object variants (`GitHubSettingsEntrySchema`, `LocalSettingsEntrySchema`)

The lockfile already uses simple source type literals. The settings schema uses verbose object forms that don't match how users naturally think about sources (e.g., `github:owner/repo`).

## Goals / Non-Goals

**Goals:**

- Single source of truth for source types in a dedicated `extension-sources` module
- Ergonomic string-based source format in settings (e.g., `"github:owner/repo"`, `"@scope/name"`)
- Simpler settings schema with `Record<string, string>` for skills

**Non-Goals:**

- Backward compatibility with object-form settings
- Source string parsing/resolution (that's a separate concern for extension-resolution)
- Changing the lockfile entry structure (just the import location of the source type)

## Decisions

### Decision: Source string format

Use prefix-based format for non-registry sources:

- `github:owner/repo` or `github:owner/repo/path` or `github:owner/repo#ref`
- `git:https://example.com/repo.git` or `git:url#ref`
- `local:./path/to/skill`
- `@scope/name` or `@scope/name@version` (registry, no prefix needed)

**Rationale**: Follows conventions from npm (`github:user/repo`), Go modules, and other ecosystems. Registry sources are the common case and don't need a prefix.

### Decision: SourceSchema location

Create `packages/core/src/experimental/schemas/extension-sources.ts` containing:

- `SourceSchema` - the literal union `"github" | "git" | "local" | "registry"`
- `SourceType` - the inferred type

**Rationale**: Source types are a cross-cutting concern used by both settings and lockfile. A dedicated module avoids circular dependencies and establishes a single source of truth.

### Decision: Settings skills as Record<string, string>

Replace `SkillsMapSchema` (which uses `SkillSettingsEntrySchema` union) with a simple `Record<string, string>` where values are source strings.

**Rationale**: Strings are more ergonomic, match user mental model, and simplify the schema significantly. Parsing the string into structured data happens at resolution time, not schema validation time.

## Risks / Trade-offs

- **Less validation at parse time** → Source string format errors surface at resolution time, not settings load. Acceptable since resolution provides better error context anyway.
- **String parsing complexity moves elsewhere** → Extension resolution already handles this; settings just stores the user's intent.
