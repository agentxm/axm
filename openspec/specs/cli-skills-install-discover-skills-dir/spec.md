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

A directory SHALL be recognized as a skill if and only if it contains a file named `SKILL.md` (case-insensitive) with YAML frontmatter containing non-empty `name` and `description` fields. Frontmatter SHALL be parsed with `gray-matter`.

#### Scenario: Valid frontmatter

- **WHEN** a `SKILL.md` contains frontmatter with `name: "my-skill"` and `description: "Does something"`
- **THEN** the skill SHALL be returned with `name="my-skill"` and `description="Does something"`

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

### Requirement: Phase 2 -- Priority Directory Scan

The algorithm SHALL enumerate a static list of well-known directories relative to the search root and scan each for immediate child directories containing valid `SKILL.md` files. This SHALL be a one-level-deep scan (not recursive).

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
- **THEN** it SHALL be discovered during the `./` (search root) scan in phase 2

### Requirement: Phase 3 -- Recursive Fallback

Phase 3 SHALL run when no skills were found in phases 1 and 2, or when `fullDepth` is true. It SHALL perform a recursive depth-first search from the search root.

#### Scenario: Recursive search triggers on empty results

- **WHEN** phases 1 and 2 found zero skills and `fullDepth` is false
- **THEN** phase 3 SHALL execute

#### Scenario: Recursive search triggers on fullDepth

- **WHEN** `fullDepth` is true (regardless of prior results)
- **THEN** phase 3 SHALL execute

#### Scenario: Max depth limit

- **WHEN** a `SKILL.md` exists at depth 6 from the search root
- **THEN** it SHALL NOT be discovered (max depth is 5)

#### Scenario: Skipped directories

- **WHEN** a `SKILL.md` exists inside `node_modules/`, `.git/`, `dist/`, `build/`, or `__pycache__/`
- **THEN** it SHALL NOT be discovered

#### Scenario: Deep skill found

- **WHEN** a valid `SKILL.md` exists at `a/b/c/my-skill/SKILL.md` (depth 4) and no priority directory matched
- **THEN** it SHALL be discovered in phase 3

### Requirement: Deduplication

A `seenNames` set SHALL track skill names across all phases. If a skill's name has already been seen, it SHALL be silently discarded. First-found wins.

#### Scenario: Duplicate in different directories

- **WHEN** `skills/my-skill/SKILL.md` and `.claude/skills/my-skill/SKILL.md` both define `name: "my-skill"`
- **THEN** only the first-discovered instance SHALL be returned

#### Scenario: Discovery order priority

- **WHEN** the same skill name appears in a priority directory and in the recursive fallback
- **THEN** the priority directory version SHALL win (discovered first)

### Requirement: Internal Skills Filtering

Skills with `metadata.internal: true` SHALL be excluded from results unless opted in.

#### Scenario: Internal skill excluded by default

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `includeInternal` is false
- **THEN** the skill SHALL NOT be included in results

#### Scenario: Internal skill included by option

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `includeInternal` is true
- **THEN** the skill SHALL be included in results

#### Scenario: Internal skill included by environment variable

- **WHEN** a `SKILL.md` has `metadata.internal: true` and `INSTALL_INTERNAL_SKILLS=1`
- **THEN** the skill SHALL be included in results

#### Scenario: Non-internal skill always included

- **WHEN** a `SKILL.md` has no `metadata.internal` field or `metadata.internal: false`
- **THEN** the skill SHALL be included regardless of `includeInternal` setting

### Requirement: Plugin Manifest Support

The algorithm SHALL check for plugin manifests at `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` and append declared skill parent directories to the priority scan list.

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
