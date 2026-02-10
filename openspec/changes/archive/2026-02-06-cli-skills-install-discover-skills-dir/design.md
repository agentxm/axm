## Context

The current `discoverSkillsInDir` in `discover-skills.ts` does a single-pass recursive walk of the entire directory tree. It finds files matching `/^skill\.md$/i`, derives skill names from parent directory names, and returns `Skill` objects with `description: Option.none()`. No frontmatter is parsed, no priority ordering exists, and no plugin manifests are supported.

The `Skill` type currently has `description: Option.Option<string>`, which is always `None` at discovery time. Frontmatter parsing only happens later in `workspace/load-state.ts` using a custom regex parser.

Agent configs currently define `projectDir` and `globalDir`. The `globalDir` is unused in practice — installation always targets project-level directories. The config will be simplified to a single `dir` field (e.g., `".claude/skills"`).

## Goals / Non-Goals

**Goals:**

- Replace `discoverSkillsInDir` with a 3-phase discovery algorithm (direct match → priority scan → recursive fallback)
- Parse SKILL.md frontmatter at discovery time to extract `name`, `description`, and `metadata`
- Support plugin manifests (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`) for explicit skill path declarations
- Deduplicate skills by name across all phases (first-found wins)
- Filter internal skills (`metadata.internal: true`) unless opted in
- Simplify `AgentSkillsConfig` to `{ dir: string }`, removing `globalDir`

**Non-Goals:**

- Git tree hash / folder hash computation (follow-up change)
- Agent registry dependency at discovery time
- `rawContent` on the Skill type
- Backward compatibility with the old discovery API

## Decisions

### 1. gray-matter for frontmatter parsing

**Decision:** Use `gray-matter` to parse SKILL.md frontmatter.

**Rationale:** The existing custom regex parser in `load-state.ts` is fragile and limited (single-line key-value only). `gray-matter` is the standard Node.js library for YAML frontmatter — battle-tested, handles edge cases, and matches the spec's requirement. It's already the convention in the skills ecosystem (Vercel skills reference uses it).

**Alternatives:**

- Keep custom regex parser → limited, can't handle nested metadata
- Full YAML parser on manually-extracted frontmatter → more code for same result

### 2. Static well-known priority directories

**Decision:** Priority directories are a static `readonly string[]` constant in the discovery module. They include canonical paths (`skills/`, `skills/.curated/`, etc.) and agent-convention paths (`.claude/skills/`, `.cursor/skills/`, etc.).

**Rationale:** Discovery is a pure directory-scanning function — it shouldn't depend on the agent registry. The well-known paths are stable conventions. If a new agent is added, its path gets added to both the agent config and the priority list.

**Alternatives:**

- Derive from agent registry at runtime → unnecessary coupling; discovery shouldn't know about agents
- Accept priority dirs as a parameter → over-abstraction; callers would all pass the same list

### 3. Three-phase discovery with early exit

**Decision:** Phase 1 (direct match) returns immediately if a single skill is found and `fullDepth` is false. Phase 2 scans priority dirs one level deep. Phase 3 recurses with depth limit of 5.

**Rationale:** Most repos are either a single skill (Phase 1 fast path) or organized into well-known directories (Phase 2). Phase 3 is the expensive fallback that only runs when needed. This matches the performance characteristics in the spec.

### 4. Skill type and return shape

**Decision:** `Skill.description` becomes `string` (no longer `Option`). Add `metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>`. Skill `name` comes from frontmatter (not directory name). Skills without a parsed description are not returned.

**Rationale:** Discovery enforces that both `name` and `description` are present — skills missing either are skipped. Since every returned skill has a description, `Option` adds ceremony with no value. `metadata` is optional because most skills won't have it.

```typescript
interface Skill {
  readonly name: string; // From SKILL.md frontmatter (required)
  readonly description: string; // From SKILL.md frontmatter (required)
  readonly path: string; // Directory containing SKILL.md
  readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
}

interface DiscoveryOptions {
  readonly fullDepth: boolean; // Exhaustive recursive search even if root skill found
  readonly includeInternal: boolean; // Include metadata.internal: true skills
}

// discoverSkillsInDir signature
const discoverSkillsInDir: (
  basePath: string,
  subPath: Option.Option<string>,
  options: DiscoveryOptions,
) => Effect.Effect<ReadonlyArray<Skill>, DiscoveryError, FileSystem.FileSystem>;
```

`AgentSkillsConfig` simplified:

```typescript
interface AgentSkillsConfig {
  readonly dir: string; // e.g., ".claude/skills"
}
```

### 5. Effect-idiomatic implementation

**Decision:** Use `Effect.forEach` with concurrency for directory scanning. Errors during discovery are caught and logged (debug level), never propagated — the function returns whatever skills it found. Use `Effect.option` to silently skip inaccessible paths.

**Rationale:** Matches the spec's resilience requirements (section 8) and the codebase's Effect conventions.

### 6. Plugin manifest path validation

**Decision:** All paths from plugin manifests must start with `./` and resolve to within `basePath`. Use `nodePath.resolve` + `startsWith` check against normalized basePath.

**Rationale:** Prevents path traversal attacks from malicious plugin manifests.

## Risks / Trade-offs

- **New dependency (gray-matter)** → Well-established package (~40M weekly downloads), minimal risk. Evaluate bundle size impact.
- **Breaking Skill type change** → `description` going from `Option<string>` to `string` requires updating all consumers. Non-goal to maintain backward compat, so this is accepted.
- **Priority directory list maintenance** → Static list must be updated when new agents are added. Acceptable trade-off vs. runtime registry coupling.
- **Phase 3 depth limit** → 5 levels may miss deeply nested skills. Unlikely in practice; `fullDepth` option provides escape hatch.
