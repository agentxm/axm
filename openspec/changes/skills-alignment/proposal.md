## Why

The cross-extension-type alignment analysis (command-support change) established
conventions for `--preview` flags and rendered-file tracking that apply
uniformly across all extension types. Skills already have `--preview` on
`install`, but the other state-changing operations (`uninstall`, `update`,
`enable`, `disable`) lack it. Additionally, skills can render files (instead of
symlinking) on systems without symlink support, but have no managed-file marker
or rendered-file tracking when they do. Aligning skills to the shared
conventions ensures a consistent CLI experience across skills, commands, and
subagents.

## What Changes

- Verify and test `--preview` flag on `axm skills uninstall`, `axm skills update`,
  `axm skills enable`, and `axm skills disable`. The flag and handler plumbing
  already exist; this change adds test coverage confirming preview behavior is
  consistent with the existing `--preview` on `axm skills install`.
- When skills render files (symlink fallback on systems without symlink
  support), the copied `SKILL.md` includes a managed-file marker comment
  (`<!-- Managed by axm — see "axm skills --help" -->`) and rendered files are
  tracked in the lockfile with source hash — consistent with the
  rendered-extension infrastructure used by commands and subagents.
- Migrate `parse-skill-md.ts` from `source-resolution/` to `skills/skill-content.ts`,
  refactoring it to use the shared `frontmatter.ts` parser from
  `core/unstable/extensions/`. This validates the shared parser's generality
  (three consumers, not two), eliminates a redundant direct `gray-matter`
  dependency, and establishes three parallel per-type content modules
  (`skills/skill-content.ts`, `commands/command-content.ts`,
  `subagents/subagent-content.ts`).

## Capabilities

### New Capabilities

_None — this change extends existing capabilities._

### Modified Capabilities

- `cli-skills-uninstall`: Verify and test `--preview` flag behavior
- `cli-skills-update`: Verify and test `--preview` flag behavior
- `cli-skills`: Verify and test `--preview` on `enable` and `disable` subcommands
- `cli-skills-install`: Add rendered-file tracking and managed marker for copy-mode installs
- `skills`: Migrate skill content file parsing to `skills/skill-content.ts` using the shared frontmatter parser

## Impact

- `packages/cli/src/root/skills/` — uninstall, update, enable, disable command
  definitions gain `--preview` flag
- `packages/core/src/unstable/skills/` — handler logic for preview mode
  (display plan without applying)
- `packages/core/src/unstable/skills/skill-content.ts` — new per-type content
  module migrated from `source-resolution/parse-skill-md.ts`, refactored to use
  the shared `frontmatter.ts` parser
- `packages/core/src/unstable/lockfile/schema.ts` — skill lock entries may gain
  `renderedFiles` tracking when rendering (not symlinking)
- Shared infrastructure (managed marker, source hash) —
  skills use the same types as commands and subagents when rendering

## Implementation Sequencing

This change is implemented after command-support and subagent-support. The
`--preview` verification work has no dependency on the shared infrastructure and
could proceed independently, but the rendered-file tracking, managed marker, and
content file migration work depends on the shared modules created during
command-support (`core/unstable/extensions/rendered-files.ts`,
`managed-marker.ts`, `conflict-detection.ts`, `frontmatter.ts`). Implementing
last ensures the shared types are stable and proven by two extension types
before skills opts in. The `parse-skill-md.ts` migration validates the shared
`frontmatter.ts` parser's generality as a third consumer.
