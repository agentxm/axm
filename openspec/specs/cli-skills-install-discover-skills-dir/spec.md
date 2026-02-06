# cli-skills-install-discover-skills-dir Specification

## Purpose

Directory-based skill discovery algorithm for `axm skills install`. Discovers skills by scanning directories for `SKILL.md` files with valid YAML frontmatter, using a three-phase approach: direct match, priority directory scan, and recursive fallback.

## Requirements

### Requirement: Discovery Input

`discoverSkillsInDir` SHALL accept a base directory, an optional subpath, and discovery options (`fullDepth`, `includeInternal`). The effective search root SHALL be `join(basePath, subpath)` when subpath is provided, otherwise `basePath`.

#### Scenario: Base directory only

- **WHEN** called with `basePath="/repo"` and no subpath
- **THEN** the search root SHALL be `/repo`

#### Scenario: Base directory with subpath

- **WHEN** called with `basePath="/repo"` and `subpath="packages/skills"`
- **THEN** the search root SHALL be `/repo/packages/skills`

### Requirement: SKILL.md Frontmatter Parsing

A directory SHALL be recognized as a skill if and only if it contains a file named exactly `SKILL.md` (case-sensitive) that is a regular file (verified via `stat().isFile()`) with YAML frontmatter containing non-empty `name` and `description` fields. Frontmatter SHALL be parsed with `gray-matter`. Symlinks to valid regular files SHALL be accepted (stat follows symlinks).

The returned skill SHALL have the following shape:

- `name`: string — from frontmatter
- `description`: string — from frontmatter
- `path`: string — `dirname` of the `SKILL.md` file path
- `metadata`: `Option<Record<string, unknown>>` — from frontmatter `metadata` field

#### Scenario: Valid frontmatter

- **WHEN** a `SKILL.md` contains frontmatter with `name: "my-skill"` and `description: "Does something"`
- **THEN** the skill SHALL be returned with `name="my-skill"`, `description="Does something"`, and `path` set to the directory containing the `SKILL.md`

#### Scenario: Missing name field

- **WHEN** a `SKILL.md` contains frontmatter with only `description` (no `name`)
- **THEN** the file SHALL be silently skipped

#### Scenario: Missing description field

- **WHEN** a `SKILL.md` contains frontmatter with only `name` (no `description`)
- **THEN** the file SHALL be silently skipped

#### Scenario: No frontmatter block

- **WHEN** a `SKILL.md` has no YAML frontmatter delimiters
- **THEN** the file SHALL be silently skipped

#### Scenario: Invalid YAML in frontmatter

- **WHEN** a `SKILL.md` has a frontmatter block with unparseable YAML
- **THEN** the file SHALL be silently skipped

#### Scenario: Metadata extraction

- **WHEN** a `SKILL.md` frontmatter contains a `metadata` field with arbitrary key-value pairs
- **THEN** the returned skill SHALL include `metadata` as `Option.some(record)`

#### Scenario: No metadata field

- **WHEN** a `SKILL.md` frontmatter has no `metadata` field
- **THEN** the returned skill SHALL have `metadata` as `Option.none()`

#### Scenario: Case-sensitive filename matching

- **WHEN** a directory contains `skill.md` or `Skill.md` but not `SKILL.md`
- **THEN** the file SHALL NOT be recognized as a skill

#### Scenario: Regular file check

- **WHEN** a directory entry named `SKILL.md` is a directory (not a regular file)
- **THEN** it SHALL be silently skipped

#### Scenario: Symlink to valid file

- **WHEN** `SKILL.md` is a symlink pointing to a valid regular file with valid frontmatter
- **THEN** the skill SHALL be recognized (stat follows symlinks)

### Requirement: Phase 1 -- Direct Match

The algorithm SHALL first check if the search root itself contains a valid `SKILL.md`.

#### Scenario: Direct match with fullDepth false

- **WHEN** the search root contains a valid `SKILL.md` and `fullDepth` is false
- **THEN** the algorithm SHALL return immediately with that single skill

#### Scenario: Direct match with fullDepth true

- **WHEN** the search root contains a valid `SKILL.md` and `fullDepth` is true
- **THEN** the skill SHALL be added to results and the algorithm SHALL continue to phases 2 and 3

#### Scenario: No direct match

- **WHEN** the search root does not contain a `SKILL.md`
- **THEN** the algorithm SHALL proceed to phase 2

#### Scenario: Root SKILL.md parse failure with fullDepth false

- **WHEN** the search root contains a `SKILL.md` that fails to parse (invalid frontmatter, missing required fields) and `fullDepth` is false
- **THEN** the algorithm SHALL fall through to phase 2 (an unparseable root SKILL.md does NOT block deeper discovery)

#### Scenario: Root SKILL.md parse failure with fullDepth true

- **WHEN** the search root contains a `SKILL.md` that fails to parse and `fullDepth` is true
- **THEN** the algorithm SHALL continue to phases 2 and 3 (same as no direct match)

#### Scenario: Root SKILL.md is internal and filtered out

- **WHEN** the search root contains a valid `SKILL.md` with `metadata.internal: true` and `includeInternal` is false and `fullDepth` is false
- **THEN** the algorithm SHALL fall through to phase 2 (a filtered internal skill does not count as a successful direct match)

### Requirement: Phase 2 -- Priority Directory Scan

The algorithm SHALL enumerate a list of priority directories relative to the search root and scan each for immediate child directories containing valid `SKILL.md` files. This SHALL be a one-level-deep scan (not recursive). Only directory-type entries within each priority directory SHALL be checked; files at the priority directory root level SHALL be ignored.

The priority directory list SHALL be composed as follows, in order:

1. `.` (searchPath root) — always first, highest priority
2. Non-agent static directories: `skills/.curated`, `skills/.experimental`, `skills/.system`
3. Agent-specific directories: derived from the `AgentConfig` registry (`getAllAgents()` → unique `skills.dir` values, deduplicated)

Priority directories SHALL be processed concurrently. `Effect.forEach` with `concurrency: "unbounded"` preserves input order in results regardless of I/O completion timing, ensuring deduplication respects the priority ordering.

#### Scenario: Skill in canonical directory

- **WHEN** `skills/my-skill/SKILL.md` exists with valid frontmatter
- **THEN** the skill SHALL be discovered in phase 2

#### Scenario: Skill in agent-convention directory

- **WHEN** `.claude/skills/my-skill/SKILL.md` exists with valid frontmatter
- **THEN** the skill SHALL be discovered in phase 2

#### Scenario: Skill in curated directory

- **WHEN** `skills/.curated/my-skill/SKILL.md` exists with valid frontmatter
- **THEN** the skill SHALL be discovered in phase 2

#### Scenario: Priority directory does not exist

- **WHEN** a priority directory (e.g., `.cursor/skills/`) does not exist in the search root
- **THEN** it SHALL be silently skipped with no error

#### Scenario: Top-level skill folders

- **WHEN** `my-skill/SKILL.md` exists directly under the search root
- **THEN** it SHALL be discovered during the `.` (search root) scan in phase 2

#### Scenario: Search root has highest dedup priority

- **WHEN** `my-skill/SKILL.md` exists at the search root AND `skills/my-skill/SKILL.md` exists with the same name
- **THEN** the search root version SHALL win deduplication (`.` is first in priority list)

#### Scenario: Agent directory coverage

- **WHEN** a skill exists in `.codex/skills/my-skill/SKILL.md` and `.codex/skills` is a registered agent skills directory
- **THEN** the skill SHALL be discovered in phase 2 (not deferred to phase 3)

#### Scenario: Files at priority directory root ignored

- **WHEN** a file (not a directory) named `my-skill` exists directly inside a priority directory
- **THEN** it SHALL be ignored (only directory-type entries are scanned)

### Requirement: Phase 3 -- Recursive Fallback

Phase 3 SHALL run when no skills were found in phases 1 and 2, or when `fullDepth` is true. It SHALL perform a recursive search from the search root. Subdirectories at each level SHALL be searched concurrently (`Effect.forEach` with `concurrency: "unbounded"`).

Max depth uses 0-indexed depth with `depth > maxDepth` (not `>=`), where `maxDepth` is 5. This means levels 0 through 5 are searched — 6 levels inclusive. Depth 6 and beyond are excluded.

`SKIP_DIRS` (`node_modules`, `.git`, `dist`, `build`, `__pycache__`) SHALL only apply to Phase 3 recursive search. Phase 2 does NOT filter by these names.

Phase 3 starts from `searchPath` and may revisit directories already scanned in Phases 1 and 2. The `seenNames` set prevents duplicate results. This redundant I/O is accepted as a simplicity trade-off.

#### Scenario: Recursive search triggers on empty results

- **WHEN** phases 1 and 2 found zero skills and `fullDepth` is false
- **THEN** phase 3 SHALL execute

#### Scenario: Recursive search triggers on fullDepth

- **WHEN** `fullDepth` is true (regardless of prior results)
- **THEN** phase 3 SHALL execute

#### Scenario: Max depth limit — depth 5 included

- **WHEN** a `SKILL.md` exists at depth 5 from the search root (0-indexed)
- **THEN** it SHALL be discovered

#### Scenario: Max depth limit — depth 6 excluded

- **WHEN** a `SKILL.md` exists at depth 6 from the search root (0-indexed)
- **THEN** it SHALL NOT be discovered

#### Scenario: Skipped directories

- **WHEN** a `SKILL.md` exists inside `node_modules/`, `.git/`, `dist/`, `build/`, or `__pycache__/`
- **THEN** it SHALL NOT be discovered

#### Scenario: SKIP_DIRS not applied in Phase 2

- **WHEN** a priority directory happens to be named `build` (hypothetically)
- **THEN** Phase 2 SHALL still scan its children (SKIP_DIRS only applies to Phase 3)

#### Scenario: Deep skill found

- **WHEN** a valid `SKILL.md` exists at `a/b/c/my-skill/SKILL.md` (depth 4) and no priority directory matched
- **THEN** it SHALL be discovered in phase 3

#### Scenario: Concurrent search within depth level

- **WHEN** Phase 3 encounters multiple subdirectories at the same depth level
- **THEN** they SHALL be searched concurrently

### Requirement: Deduplication

A `seenNames` set SHALL track skill names across all phases. If a skill's name has already been seen, it SHALL be silently discarded. First-found wins.

#### Scenario: Duplicate in different directories

- **WHEN** `skills/my-skill/SKILL.md` and `.claude/skills/my-skill/SKILL.md` both define `name: "my-skill"`
- **THEN** only the first-discovered instance SHALL be returned

#### Scenario: Discovery order priority

- **WHEN** the same skill name appears in a priority directory and in the recursive fallback
- **THEN** the priority directory version SHALL win (discovered first)

### Requirement: Internal Skills Filtering

Skills with `metadata.internal: true` SHALL be excluded from results unless opted in. A filtered-out internal skill SHALL NOT consume its name in the `seenNames` set.

#### Scenario: Internal skill excluded by default

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `includeInternal` is false
- **THEN** the skill SHALL NOT be included in results

#### Scenario: Internal skill included by option

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `includeInternal` is true
- **THEN** the skill SHALL be included in results

#### Scenario: Internal skill included by environment variable

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `INSTALL_INTERNAL_SKILLS` is set to `"1"` or `"true"`
- **THEN** the skill SHALL be included in results

#### Scenario: Non-internal skill always included

- **WHEN** a `SKILL.md` has no `metadata.internal` field or `metadata.internal: false`
- **THEN** the skill SHALL be included regardless of `includeInternal` setting

#### Scenario: Filtered internal does not consume seenNames

- **WHEN** an internal skill named `"my-skill"` is filtered out in phase 2
- **AND** a non-internal skill named `"my-skill"` exists in phase 3
- **THEN** the non-internal skill SHALL be discovered (the filtered internal did not consume the name)

### Requirement: Plugin Manifest Support

The algorithm SHALL check for plugin manifests at `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` and append declared skill parent directories to the priority scan list. Both manifests are read independently and their paths are accumulated (additive, not mutually exclusive).

**`marketplace.json` structure:**

- MAY contain `metadata.pluginRoot` (string). If present and does NOT start with `./`, the entire manifest SHALL be silently ignored.
- Contains `plugins` array. Each plugin:
  - `source`: string starting with `./` (relative path to plugin directory), omitted (root-level plugin resolving to `basePath + pluginRoot` or `basePath`), or object (silently skipped).
  - `skills`: optional array of skill path strings.
- For each processed plugin, `{pluginBase}/skills/` SHALL unconditionally be added to the priority scan (supports convention-based skill layout without explicit declaration).
- Explicit skill paths from `plugins[].skills` SHALL be transformed via `dirname()` to produce parent directories for the priority scan.

**`plugin.json` structure:**

- Contains a `skills` array of skill path strings.
- Parent directory of each declared skill path SHALL be added to the priority scan.

#### Scenario: marketplace.json with skill paths

- **WHEN** `.claude-plugin/marketplace.json` contains plugins with skill paths
- **THEN** the parent directory of each declared skill path SHALL be added to the priority scan

#### Scenario: plugin.json with skill paths

- **WHEN** `.claude-plugin/plugin.json` contains a `skills` array
- **THEN** the parent directory of each declared skill path SHALL be added to the priority scan

#### Scenario: Missing manifest

- **WHEN** `.claude-plugin/marketplace.json` or `.claude-plugin/plugin.json` does not exist
- **THEN** it SHALL be silently skipped

#### Scenario: Invalid manifest JSON

- **WHEN** a manifest file contains invalid JSON
- **THEN** it SHALL be silently skipped

#### Scenario: Path traversal rejected

- **WHEN** a manifest declares a skill path containing `..` or an absolute path
- **THEN** the path SHALL be rejected

#### Scenario: Paths must start with ./

- **WHEN** a manifest declares a skill path not starting with `./`
- **THEN** the path SHALL be rejected

#### Scenario: Resolved path must be within basePath

- **WHEN** a manifest skill path resolves to outside `basePath` after normalization
- **THEN** the path SHALL be rejected

#### Scenario: Invalid pluginRoot silences entire marketplace.json

- **WHEN** `marketplace.json` has `metadata.pluginRoot` that does NOT start with `./`
- **THEN** the entire `marketplace.json` SHALL be silently ignored (no plugins processed)

#### Scenario: Conventional skills directory always added

- **WHEN** a marketplace plugin has no `skills` array or an empty one
- **THEN** `{pluginBase}/skills/` SHALL still be added to the priority scan

#### Scenario: Omitted plugin source

- **WHEN** a marketplace plugin has no `source` field
- **THEN** the plugin base SHALL resolve to `basePath + pluginRoot` (or just `basePath` if `pluginRoot` is also omitted)

#### Scenario: Object plugin source skipped

- **WHEN** a marketplace plugin has `source` as an object (representing a remote source)
- **THEN** that plugin SHALL be silently skipped

#### Scenario: Both manifests are additive

- **WHEN** both `marketplace.json` and `plugin.json` exist with skill paths
- **THEN** paths from both SHALL be accumulated (they are not mutually exclusive)

#### Scenario: Skill path dirname transformation

- **WHEN** a manifest declares skill path `./skills/my-skill`
- **THEN** the search directory added to priority scan SHALL be `./skills/` (dirname of the declared path)

### Requirement: Path Containment Check

Path containment (`isContainedIn`) SHALL use `resolve`/`normalize` for textual comparison with platform separator. Symlinks are NOT resolved via `realpath` — a symlinked path textually within `basePath` but physically pointing elsewhere would pass the check.

#### Scenario: Path within basePath

- **WHEN** a resolved path is textually within `basePath`
- **THEN** the containment check SHALL pass

#### Scenario: Symlinked path textually within basePath

- **WHEN** a path is a symlink that textually resolves within `basePath` but physically points outside
- **THEN** the containment check SHALL pass (no realpath resolution)

### Requirement: Error Resilience

The discovery algorithm SHALL NOT propagate errors to the caller. All filesystem and parsing failures SHALL be caught and logged at debug level.

#### Scenario: Unreadable SKILL.md

- **WHEN** a `SKILL.md` file exists but cannot be read (permissions error)
- **THEN** it SHALL be silently skipped

#### Scenario: Unreadable directory

- **WHEN** a directory cannot be listed during recursive search
- **THEN** it SHALL return empty results for that branch

#### Scenario: Zero skills found

- **WHEN** discovery completes with no skills found across all phases
- **THEN** the function SHALL return an empty array (caller decides how to handle)
