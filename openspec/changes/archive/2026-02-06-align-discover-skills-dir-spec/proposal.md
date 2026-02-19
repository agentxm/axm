## Why

Our `cli-skills-install-discover-skills-dir` spec has functional gaps compared to a reference implementation of the same algorithm. Two gaps are critical: undefined behavior when a root `SKILL.md` fails to parse (implementers could return empty instead of continuing search), and ambiguous depth semantics (could be off by one level). Additional important gaps include incomplete plugin manifest resolution, missing priority directories (31 of 36 agent dirs absent from the priority list), priority directory ordering, and missing interaction between internal skill filtering and name deduplication. Aligning now prevents incorrect implementations and ensures parity with the proven reference.

**Reference sources analyzed:**

- Reference spec for skill discovery in cloned repositories
- Reference implementation: discovery algorithm, plugin manifest handling, installer, test suites

## What Changes

### Critical — Incorrect discovery results without these

**Phase 1 — Root SKILL.md parse failure fallthrough:**
Our spec defines behavior when root `SKILL.md` is valid (return immediately or continue based on `fullDepth`) and when it's absent (proceed to phase 2). It is **silent** on what happens when root `SKILL.md` exists but fails to parse (invalid frontmatter, missing required fields, or filtered as internal). The reference implementation falls through to phase 2 regardless of `fullDepth` — an unparseable root `SKILL.md` does not block deeper discovery. Without this, an implementer could return an empty array when the root has an invalid `SKILL.md` and `fullDepth` is false.

**Phase 3 — Max depth semantics clarification:**
Our spec says "max depth is 5" and that depth 6 is excluded, but doesn't clarify indexing. The reference implementation uses 0-indexed depth with `depth > maxDepth` (not `>=`), meaning levels 0 through 5 are searched — 6 levels inclusive. An implementer could interpret "max depth 5" as 5 levels total (depths 0-4) rather than 6 levels total (depths 0-5).

### Important — Implementation ambiguity or missing functionality

**Phase 2 — Missing priority directories:**
Our `PRIORITY_DIRECTORIES` has 8 hardcoded entries, but the `AgentConfig` registry defines 39 agents with 36 unique `skills.dir` values — only 5 of which appear in the priority list (`skills`, `.claude/skills`, `.cursor/skills`, `.cline/skills`, `.windsurf/skills`). The remaining 31 agent directories (e.g., `.codex/skills`, `.gemini/skills`, `.roo/skills`, `.github/skills`, etc.) are missing, meaning skills installed for those agents are only discoverable via Phase 3 recursive fallback. Additionally, `.copilot/skills` is in the priority list but has no corresponding `AgentConfig` (stale entry). Non-agent directories `skills/.curated`, `skills/.experimental/`, and `skills/.system/` should remain as a static list. Agent-specific directories should be derived from the `AgentConfig` registry (`getAllAgents()` → unique `skills.dir` values) rather than hardcoded, so new agents automatically get priority directory coverage.

**Phase 2 — Priority directory ordering:**
`.` (searchPath) must be FIRST in the priority directory list, not last. The current list has `.` at position 8 — this means a skill at the repo root loses dedup priority to the same skill found in `skills/` or `.claude/skills/`. The reference implementation treats the searchPath root as highest priority.

**Phase 2 — Processing order and deduplication:**
Our spec says Phase 2 "SHALL enumerate" directories but doesn't specify processing order. `Effect.forEach` preserves input order even with `concurrency: "unbounded"` — results are returned in the order of the input array regardless of completion timing. Post-hoc dedup over these ordered results is functionally equivalent to the reference implementation's inline sequential dedup. The current concurrent approach is correct and should be kept.

**Phase 2 — Directory-type entries only:**
Specify that only directory-type entries within each priority directory are checked for `SKILL.md`. Files at the priority directory root level are ignored.

**Phase 3 — Concurrency model:**
Specify that subdirectories at each level are searched concurrently (the reference uses `Promise.all` at each recursive level). Our spec says "recursive depth-first search" but the reference is actually breadth-first-parallel within each depth level.

**Phase 3 — SKIP_DIRS namespace:**
Clarify that `SKIP_DIRS` (`node_modules`, `.git`, `dist`, `build`, `__pycache__`) only applies to Phase 3 recursive search. Phase 2 does not filter by these names — if any happened to be priority directories, their children would still be scanned.

**Internal skills and seenNames interaction:**
Our spec doesn't address whether a filtered-out internal skill consumes its name in `seenNames`. In the reference implementation, internal skills that are filtered out (return `null` from `parseSkillMd`) do **not** add their name to `seenNames`. This means a non-internal skill with the same name appearing later in discovery **will** be found. This is correct behavior but must be explicitly specified to prevent implementations that shadow non-internal skills with filtered internals.

**Plugin Manifest — `pluginRoot` validation:**
When `metadata.pluginRoot` is provided but does NOT start with `./`, the **entire** `marketplace.json` is silently ignored — no plugins from it are processed. Our spec mentions path validation but doesn't call out that an invalid `pluginRoot` silences the whole manifest.

**Plugin Manifest — Conventional `{pluginBase}/skills/` always added:**
For each plugin in a manifest, `{pluginBase}/skills/` is unconditionally added to the priority scan — even when the plugin has no `skills` array or an empty one. This ensures convention-based skill layout works without explicit declaration. Our spec only covers explicit skill path declarations.

**Plugin Manifest — Omitted `source` field (root-level plugins):**
Plugin `source` may be omitted entirely, resolving the plugin base to `basePath + pluginRoot` (or just `basePath` if `pluginRoot` is also omitted). This supports root-level plugins. Our spec assumes `source` is always present.

**Plugin Manifest — Object-type `source` skipped:**
Plugin `source` can be an object (representing remote sources). These are silently skipped — only string sources and omitted sources are processed.

**Plugin Manifest — Both manifests are additive:**
`marketplace.json` and `plugin.json` are both read independently and their paths are accumulated. They are not mutually exclusive.

**Plugin Manifest — Path `dirname` transformation:**
Explicit skill paths from manifests are transformed via `dirname()` to produce parent directories. This is because the discovery loop does one-level-deep scanning — it needs the parent directory to find the skill's child directory. E.g., skill path `./skills/my-skill` becomes search directory `./skills/`.

**SKILL.md Parsing — Case sensitivity:**
**BREAKING**: Change `SKILL.md` matching from case-insensitive to case-sensitive (exact `SKILL.md`). The reference implementation uses a hardcoded literal `'SKILL.md'` with `stat()`. Case-insensitive matching would require `readdir()` on every directory to find case variants — added complexity with no real-world benefit since `SKILL.md` is the universal convention.

**SKILL.md Parsing — Regular file check:**
`SKILL.md` must be verified as a regular file via `stat().isFile()`. A directory named `SKILL.md` (possible on some filesystems) should be rejected. The reference uses `stat` (follows symlinks), so a symlink to a valid file is accepted.

**SKILL.md Parsing — Output type definition:**
Formally define the output `Skill` interface: `name`, `description`, `path` (computed from `dirname` of SKILL.md path), `metadata` (optional record from frontmatter).

**Post-discovery utilities (new capability):**

- `getSkillDisplayName(skill)`: returns `skill.name`, falling back to `basename(skill.path)` when name is empty/falsy
- `filterSkills(skills, inputNames)`: case-insensitive matching against both `skill.name` and `getSkillDisplayName(skill)` — implements the `--skill <name>` CLI flag
- Skill name sanitization for on-disk installation: lowercase, non-alphanumeric (except `.` `_`) replaced with hyphens, leading/trailing dots and hyphens stripped, truncated to 255 chars, fallback to `unnamed-skill`

### Nice-to-have — Clarity improvements

**`INSTALL_INTERNAL_SKILLS` accepted values:**
Expand to accept both `"1"` and `"true"` (our spec only mentions `"1"`).

**Phase 3 re-scanning note:**
Document that Phase 3 starts from `searchPath` and may revisit directories already scanned in Phases 1 and 2. The `seenNames` set prevents duplicates, but the redundant I/O is accepted as a simplicity trade-off.

**`isContainedIn` implementation note:**
Path containment uses `resolve`/`normalize` (textual comparison with platform separator), not `realpath`. Symlinks are not resolved — a symlinked path textually within `basePath` but physically pointing elsewhere would pass the check.

**Priority directory coverage note:**
With agent dirs derived from the registry, all supported agent `skillsDir` values are covered as Phase 2 priority directories. Phase 3 remains as a fallback for directories outside the known set (e.g., custom layouts or future agents not yet in the registry).

## Capabilities

### New Capabilities

- `cli-skills-install-post-discovery`: Post-discovery utilities — display name resolution (`getSkillDisplayName`), skill filtering by name (`filterSkills`), and name sanitization for on-disk installation paths (`sanitizeName`)

### Modified Capabilities

- `cli-skills-install-discover-skills-dir`: Phase 1 parse-failure fallthrough, priority dirs derived from AgentConfig registry (31 missing agent dirs, 1 stale removal), priority dir ordering (`.` first), depth semantics clarification, Phase 3 concurrency model, SKIP_DIRS scope, internal skill / seenNames interaction, plugin manifest resolution gaps (pluginRoot validation, conventional skills/ dir, omitted source, object source, additive manifests, dirname transformation), case-sensitive SKILL.md matching (BREAKING), regular file check, output type definition, INSTALL_INTERNAL_SKILLS accepts "true"

## Impact

- **`discoverSkillsInDir` implementation**: Phase 1 control flow (parse-failure fallthrough), priority directory list (derived from AgentConfig registry, `.` moved to first position), Phase 3 concurrency model, plugin manifest parser (6 behavioral additions)
- **BREAKING — Case sensitivity**: Any existing case-insensitive `SKILL.md` matching logic would need to change to exact `SKILL.md` match
- **New module**: Post-discovery utilities (`getSkillDisplayName`, `filterSkills`, `sanitizeName`) needed by the install command handler and UI layer
- **Test surface**: Significant new test scenarios needed for Phase 1 fallthrough, internal/seenNames interaction, plugin manifest edge cases
