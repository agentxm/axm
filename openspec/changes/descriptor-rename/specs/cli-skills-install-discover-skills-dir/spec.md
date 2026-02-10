## MODIFIED Requirements

### Requirement: Phase 2 -- Priority Directory Scan

The algorithm SHALL enumerate a list of priority directories relative to the search root and scan each for immediate child directories containing valid `SKILL.md` files. This SHALL be a one-level-deep scan (not recursive). Only directory-type entries within each priority directory SHALL be checked; files at the priority directory root level SHALL be ignored.

The priority directory list SHALL be composed as follows, in order:

1. `.` (searchPath root) — always first, highest priority
2. Non-agent static directories: `skills/.curated`, `skills/.experimental`, `skills/.system`
3. Agent-specific directories: derived from the `AgentDescriptor` registry (`getAllAgents()` → unique `skills.dir` values, deduplicated)

Priority directories SHALL be processed concurrently. `Effect.forEach` with `concurrency: "unbounded"` preserves input order in results regardless of I/O completion timing, ensuring deduplication respects the priority ordering.

All path operations within the scan (joining priority directory paths, resolving search roots) SHALL use the `Path.Path` service.

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
