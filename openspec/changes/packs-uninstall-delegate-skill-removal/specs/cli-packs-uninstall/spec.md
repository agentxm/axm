## MODIFIED Requirements

### Requirement: Uninstall pack and orphaned extensions

`axm packs uninstall <name>` SHALL remove the pack and any dependency skills it brought in that are no longer needed.

The name SHALL support glob patterns to match multiple packs.

The plan builder SHALL compute which skills to include as `uninstall-skill` steps:

1. Collect all skills from the target pack(s)' `resolvedSkills`
2. Exclude skills referenced by any remaining pack's `resolvedSkills` (packs not being removed in this batch)
3. Exclude skills that have a direct entry in project settings (i.e., directly installed by the user)
4. Remaining skills become `uninstall-skill` plan steps

The plan SHALL order steps with `uninstall-pack` steps first, followed by `uninstall-skill` steps.

The `uninstall-pack` operation handler SHALL only remove the pack itself (directory, settings, lockfile). It SHALL NOT detect or remove orphaned skills — skill removal is delegated to `uninstall-skill` operation steps in the plan.

#### Scenario: Uninstall pack with dependency skills

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/skills/code-review`
- **AND** `@acme/skills/code-review` has no direct settings entry and no other pack references it
- **THEN** the plan includes an `uninstall-pack` step for `@acme/frontend-pack`
- **AND** the plan includes an `uninstall-skill` step for `@acme/skills/code-review`
- **AND** the `uninstall-pack` step appears before the `uninstall-skill` step

#### Scenario: Uninstall pack with shared skill

- **WHEN** user runs `axm packs uninstall @acme/pack-a`
- **AND** `@acme/skills/code-review` is in `pack-a`'s `resolvedSkills`
- **AND** `@acme/skills/code-review` is also in `pack-b`'s `resolvedSkills`
- **AND** `pack-b` is still installed
- **THEN** the plan includes `uninstall-pack` for `pack-a`
- **AND** `@acme/skills/code-review` is NOT included as an `uninstall-skill` step

#### Scenario: Uninstall pack with directly installed skill

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/skills/code-review`
- **AND** `code-review` has a direct entry in project settings (e.g., user ran `axm skills install code-review`)
- **THEN** `@acme/skills/code-review` is NOT included as an `uninstall-skill` step

#### Scenario: Glob pattern matches multiple packs with shared skill

- **WHEN** user runs `axm packs uninstall "@acme/*"`
- **AND** packs `@acme/pack-a` and `@acme/pack-b` are installed
- **AND** both packs reference `@acme/skills/shared-skill` in their `resolvedSkills`
- **AND** `@acme/skills/shared-skill` has no direct settings entry
- **THEN** the plan includes `uninstall-pack` for both packs
- **AND** the plan includes `uninstall-skill` for `@acme/skills/shared-skill` (since both referencing packs are being removed)

### Requirement: Uninstall removes settings and lockfile entries

After successful uninstall, the pack entry SHALL be removed from both settings.json and the lockfile `packs` section. Skill entries SHALL be removed by the `uninstall-skill` operation handler (which handles ownership-aware cleanup).

#### Scenario: Clean removal from settings and lockfile

- **WHEN** pack `@acme/frontend-pack` is successfully uninstalled
- **THEN** the `packs` section in settings.json no longer contains `frontend-pack`
- **AND** the `packs` section in the lockfile no longer contains `@acme/frontend-pack`

#### Scenario: Dependency skill removed from lockfile after pack removal

- **WHEN** pack `@acme/frontend-pack` is uninstalled
- **AND** `@acme/skills/code-review` was a dependency skill with no other references
- **THEN** the `uninstall-skill` operation removes `code-review` from the lockfile and disk
