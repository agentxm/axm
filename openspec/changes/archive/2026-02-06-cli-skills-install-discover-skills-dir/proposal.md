## Why

The current `discoverSkillsInDir` does a naive recursive walk of the entire directory tree looking for `SKILL.md` files, deriving skill names from parent directory names and ignoring frontmatter entirely. This means discovery is slow (walks everything), misses structured metadata (name, description, internal flags), and doesn't prioritize well-known skill locations. A smarter 3-phase algorithm — direct match, priority directory scan, recursive fallback — will discover skills faster, parse their frontmatter for richer metadata, and support plugin manifests for explicit skill declarations.

## What Changes

- **Replace `discoverSkillsInDir`** with a 3-phase discovery algorithm: direct match, priority directory scan (well-known paths), and bounded recursive fallback
- **Parse SKILL.md frontmatter** at discovery time using `gray-matter` to extract `name`, `description`, and `metadata` (including `internal` flag)
- **Add plugin manifest support** for `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` to declare skill paths explicitly
- **Well-known priority directories** as static constants — `skills/`, `.claude/skills/`, `.cursor/skills/`, etc. — no runtime agent registry dependency
- **Simplify `AgentSkillsConfig`** — replace `projectDir` + `globalDir` with single `dir` field (e.g., `".cline/skills"`)
- **Add discovery options** — `fullDepth` for exhaustive search, `includeInternal` for internal skill visibility
- **Deduplicate by skill name** across all phases (first-found wins)
- **Bound recursive search** to max depth 5, skip `node_modules`, `.git`, `dist`, `build`, `__pycache__`
- **Update `Skill` type** — `description` becomes `string` (not `Option`), add `metadata` field. Skills without a parsed description are not returned.

## Capabilities

### New Capabilities

- `cli-skills-install-discover-skills-dir`: 3-phase skill discovery algorithm with frontmatter parsing, priority directory scanning (static well-known paths), plugin manifest support, deduplication, and internal skill filtering

### Modified Capabilities

- `cli-skills-install`: Updated to use new discovery function signature and richer `Skill` type

## Impact

- `packages/cli/src/cli-commands/skills/install/discover-skills.ts` — primary implementation target
- `packages/cli/src/extensions/skills/types.ts` — `Skill` type gains `rawContent`, `metadata` fields; `description` becomes required string
- `packages/cli/src/agents/types.ts` — `AgentSkillsConfig` simplified to `{ dir: string }`, removing `globalDir`
- `packages/cli/src/agents/*/config.ts` — all ~40 agent configs updated to new shape
- `packages/cli/src/cli-commands/skills/install/handler.ts` — caller updated for new discovery API
- New dependency: `gray-matter` for frontmatter parsing
- Existing discovery tests need rewrite for new 3-phase behavior
