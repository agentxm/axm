## Why

Every skill handler (install, enable, disable, uninstall, rename) independently computes the canonical directory and source path using duplicated "is this registry?" branching. The rename handler got it wrong — it only uses `.agents/skills/`, silently breaking registry-sourced skill renames. Additionally, scope representation is inconsistent: the parser strips the `@` prefix, then at least 3 different places re-add it. Centralizing path logic and aligning scope convention eliminates this duplication and makes this class of bug impossible.

## What Changes

### Centralize skill path computation

- Rename constant `CANONICAL_SKILLS_DIR` to `UNIVERSAL_SKILLS_DIR` — `.agents/skills/` is the universal (non-registry) location, not the canonical location for all sources
- Introduce `getSkillDir(join, base, source, sanitizedName)` — a pure function that returns `{ canonicalPath, skillSrcPath }` based on source type:
  - Non-registry → both point to `<base>/.agents/skills/<name>`
  - Registry → `canonicalPath` is `<base>/.axm/extensions/@<scope>/skills/<name>`, `skillSrcPath` is `<canonicalPath>/src`
- The function accepts a minimal discriminant (`{ type: "registry"; scope: string } | { type: Exclude<SourceType, "registry"> }`) structurally compatible with both lock entries and source inputs
- Replace duplicated path computation in install, enable, rename handlers with `getSkillDir` calls
- **Fix rename bug**: rename handler uses `getSkillDir` with the lock entry, correctly handling registry-sourced skills (directory rename + SKILL.md frontmatter update at `skillSrcPath/SKILL.md`)

### Align scope convention to always `@`-prefixed

- **BREAKING**: `RegistrySourceInput.scope` changes from bare (`"community"`) to `@`-prefixed (`"@community"`)
- Parser keeps `@` prefix when extracting scope from `@scope/name` input
- Remove ad-hoc scope normalization from install-skill, source service, and registry provider
- Lock entries, settings, filesystem, and source inputs all use the same `@`-prefixed convention
- Printer updated to handle `@`-prefixed scope in display output

## Capabilities

### New Capabilities

- `skill-paths`: Centralized skill path computation — given a source type and skill name, resolves the canonical directory and skill source path

### Modified Capabilities

- `managed-extensions`: The "Install pipeline conditional path" requirement moves from handler-level branching to the centralized `getSkillDir` function. Behavioral contract unchanged.
- `skills-install-execute`: Canonical location computation delegates to `getSkillDir`. Behavioral contract unchanged.
- `extension-sources`: `RegistrySourceInput.scope` is always `@`-prefixed. Parse and display behavior updated accordingly.

## Impact

- `packages/cli/src/cli-commands/skills/constants.ts` — rename constant
- `packages/cli/src/cli-commands/skills/skill-paths.ts` — new module with `getSkillDir`
- `packages/cli/src/cli-commands/skills/rename/rename-skill.ts` — bug fix: registry-sourced rename
- `packages/cli/src/cli-commands/skills/install/install-skill.ts` — replace duplicated path logic, remove scope normalization
- `packages/cli/src/cli-commands/skills/enable/enable-skill.ts` — replace duplicated path logic, eliminate unsafe `as` cast
- `packages/cli/src/cli-commands/skills/disable/disable-skill.ts` — constant rename
- `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` — constant rename
- `packages/cli/src/sources/parser.ts` — keep `@` prefix in parsed scope
- `packages/cli/src/sources/printer.ts` — handle `@`-prefixed scope in display
- `packages/cli/src/sources/service.ts` — remove scope normalization
- `packages/cli/src/sources/providers/registry.ts` — remove defensive scope checks
