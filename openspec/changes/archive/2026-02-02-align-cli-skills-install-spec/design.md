## Context

The current `skills install` command has source parsing logic in `packages/core/src/experimental/skills/source-parser.ts`. This handles GitHub/GitLab URLs, shorthand, local paths, and well-known URLs. However, the proposal (§3.2) defines a more comprehensive Extension Resolution algorithm that:

1. Supports additional input patterns (AXM names `@scope/name`, bare names, explicit source prefixes)
2. Follows a specific resolution order with early-exit semantics
3. Returns richer metadata (`ExtensionRef[]` with `metadata` object)
4. Will be reused by all extension commands (`install`, `update`, `info`, `fork`, etc.)

Additionally, the current lockfile uses YAML with `commitSha`/`contentHash`, while the proposal specifies JSON with `folderHash`. Settings use `skills: {}` but proposal uses `extensions.skills: {}`.

**Stakeholders**: All future extension commands depend on resolution module. Breaking schema changes affect existing users.

## Goals / Non-Goals

**Goals:**

- Create a standalone `extension-resolution` module in `packages/core/` that can be reused across all extension types and commands
- Implement the full resolution algorithm from proposal §3.2
- Update `cli-skills-install` to consume the resolution module
- Migrate lockfile to JSON format with `folderHash`
- Migrate settings to `extensions.skills` structure
- Maintain test coverage through the refactor

**Non-Goals:**

- Remote registry implementation (placeholder only—returns empty results)
- Bitbucket/Azure DevOps source support (future work, patterns established)
- Automatic migration of existing lockfiles/settings (manual migration acceptable for experimental API)
- Generic git URL support beyond GitHub/GitLab (future work)

## Decisions

### 1. Module Location and Structure

**Decision**: Create `packages/core/src/experimental/resolution/` as a new module.

```
packages/core/src/experimental/
├── resolution/
│   ├── index.ts              # Public API: resolveExtension()
│   ├── types.ts              # ExtensionRef, ResolutionOptions, errors
│   ├── resolver.ts           # Main resolution algorithm
│   ├── resolvers/
│   │   ├── local-path.ts     # Step 1: ./path, /abs/path
│   │   ├── axm-name.ts       # Steps 2-3: @scope/name, bare name
│   │   ├── explicit-source.ts # Step 4: github:owner/repo
│   │   ├── ambiguous.ts      # Step 5: owner/repo disambiguation
│   │   └── url.ts            # Step 6: unmatched URLs
│   └── *.test.ts
├── skills/                   # Existing—will import from resolution/
```

**Rationale**: Separate module allows independent testing and reuse. Resolution is a distinct concern from skill-specific logic (discovery, installation).

**Alternatives considered**:

- Extend existing `source-parser.ts`: Would bloat a single file and mix concerns
- Keep in CLI package: Would prevent reuse by other packages

### 2. Resolution Function Signature

**Decision**: Single entry point with options object.

```typescript
interface ResolutionOptions {
  types?: ExtensionType[]; // Filter by type (default: all)
  sources?: SourceType[]; // Limit which sources to query
  agents?: string[]; // Filter by agent support
  cwd?: string; // Working directory for path resolution
  registryLookup?: RegistryLookup; // Injected registry service (optional)
}

const resolveExtension: (
  input: string,
  options?: ResolutionOptions,
) => Effect<ExtensionRef[], ResolutionError>;
```

**Rationale**: Options object is extensible without breaking changes. Injecting registry lookup allows testing without network.

### 3. Resolution Order Implementation

**Decision**: Implement as ordered pipeline with early exit using Effect.

```typescript
// Pseudo-code for resolver.ts
const resolvers = [
  resolveLocalPath, // Step 1
  resolveAxmName, // Step 2
  resolveBareName, // Step 3
  resolveExplicitSource, // Step 4
  resolveAmbiguous, // Step 5
  resolveUnmatchedUrl, // Step 6
];

// Try each in order, return first non-empty result
const tryResolvers = (
  input: string,
  options: ResolutionOptions,
  remaining: typeof resolvers,
): Effect.Effect<ExtensionRef[], ResolutionError> =>
  Effect.gen(function* () {
    if (remaining.length === 0) return [];
    const [resolver, ...rest] = remaining;
    const result = yield* resolver(input, options);
    if (result.length > 0) return result;
    return yield* tryResolvers(input, options, rest);
  });
```

**Rationale**: Matches proposal exactly. Each resolver is independently testable.

### 4. AXM Name Resolution

**Decision**: Check project → global → registry in order. Return first level with matches.

```typescript
// For @scope/name, check:
// 1. .axm/skills/@scope/name/
// 2. ~/.axm/skills/@scope/name/
// 3. Registry API (placeholder: always returns [])
```

**Rationale**: Local-first matches user expectation (installed extensions shadow registry).

**Alternatives considered**:

- Check all levels and merge: More complex, unclear precedence semantics
- Registry-first: Would require network for every resolution

### 5. Reuse Existing Source Parser

**Decision**: Wrap existing `source-parser.ts` within `explicit-source.ts` resolver.

The current parser handles GitHub/GitLab URLs, shorthand, local paths. We'll:

1. Keep it for URL/shorthand parsing
2. Add new resolvers for AXM names, bare names, ambiguous patterns
3. Map `ParsedSource` to `ExtensionRef` at the boundary

**Rationale**: Avoids rewriting tested code. Parser does one thing well.

### 6. ExtensionRef Schema

**Decision**: Follow proposal §3.2 Result Schema exactly.

```typescript
interface ExtensionRef {
  type: ExtensionType; // skill, command, pack, mcp-server
  source: SourceType; // github, gitlab, path, registry, etc.
  origin: string; // Fully resolved URL/path
  ref?: string; // Git ref if applicable
  name?: string; // @scope/name if resolved
  originalInput: string; // Preserved for debugging
  metadata: ExtensionMetadata; // version, description, files, etc.
}
```

**Rationale**: Alignment with proposal enables future compatibility.

### 7. Lockfile Schema Change

**Decision**: Change to JSON format with `folderHash`.

```typescript
// Before (YAML)
skills:
  my-skill:
    source: "github:owner/repo"
    commitSha: "abc123"
    contentHash: "sha256:..."

// After (JSON)
{
  "lockfileVersion": 1,
  "extensions": {
    "skills": {
      "my-skill": {
        "source": "github:owner/repo",
        "origin": "https://github.com/owner/repo",
        "folderHash": "abc123def456...",
        "installedAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    }
  }
}
```

**Rationale**: JSON aligns with proposal. `folderHash` (git tree SHA) is more stable than commit SHA across rebases.

**Migration**: No automatic migration. Existing experimental users will need to delete `axm.lock` and reinstall.

### 8. Settings Schema Change

**Decision**: Nest skills under `extensions` object.

```typescript
// Before
{ "skills": { "my-skill": { source, agents } } }

// After
{
  "namespace": "@community",
  "agents": ["claude-code"],
  "extensions": {
    "skills": { "my-skill": "^1.0.0" }
  }
}
```

**Rationale**: Supports multiple extension types uniformly. Version specifier (not object) aligns with npm conventions.

### 9. Conflict Detection

**Decision**: Warn and skip by default when skill name already exists.

```
⚠ Skill "my-skill" already installed. Skipping.
  Use --force to overwrite.
```

**Rationale**: Safe default prevents accidental overwrites. Explicit flag for intentional replacement.

### 10. Error Handling

**Decision**: Typed errors with recovery guidance.

```typescript
class ResolutionError extends Data.TaggedError("ResolutionError")<{
  code: "NOT_FOUND" | "AMBIGUOUS" | "INVALID_INPUT" | "NETWORK_ERROR";
  message: string;
  input: string;
  suggestions?: string[];
}> {}
```

**Rationale**: Consistent with existing `ParseError`. Suggestions help users recover.

## Risks / Trade-offs

**[Breaking schema changes]** → Acceptable for experimental API. Document in changelog. No automatic migration—users delete lockfile and reinstall.

**[Resolution complexity]** → More code paths to test. Mitigate with comprehensive unit tests for each resolver and integration tests for full pipeline.

**[Registry placeholder]** → AXM name resolution returns empty for registry lookups until remote registry is implemented. Users can still install via explicit sources.

**[Ambiguous pattern network calls]** → Step 5 may query multiple sources in parallel. Mitigate with timeout and caching (future optimization).

## Open Questions

1. **Bare name implied scope**: Should we read `scope` from settings, or require explicit `@scope/name`? Proposal says "if implied scope configured"—need to decide default behavior when no scope configured.

2. **Parallel source queries**: For ambiguous `owner/repo`, should we query GitHub and GitLab in parallel, or just GitHub? Current implementation defaults to GitHub only.

3. **Type inference from filesystem**: When resolving a path, how do we determine if it's a skill vs command? Currently we only support skills—need to decide on heuristics (look for SKILL.md, axm-skill.json, etc.).
