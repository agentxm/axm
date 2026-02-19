## Requirements

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

### Requirement: Uninstall plan display and confirmation

The uninstall plan SHALL be displayed before execution, showing the pack and all orphaned extensions to be removed.

#### Scenario: Preview mode

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack --preview`
- **THEN** the plan is displayed but NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack --yes`
- **THEN** the plan is applied without prompting

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

### Requirement: Uninstall removes orphaned pack folder from disk

`axm packs uninstall <name>` SHALL remove the pack's managed extension folder from disk even when the pack is not present in the lockfile or settings.

When the pack is not in the lockfile, the command SHALL scan `.axm/extensions/@*/packs/<name>/` for a matching directory and remove it if found.

#### Scenario: Pack folder exists on disk but not in lockfile

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile or settings
- **AND** `.axm/extensions/@test/packs/testing/` exists on disk
- **THEN** the directory `.axm/extensions/@test/packs/testing/` SHALL be removed
- **AND** the result SHALL be `success` (not `no-op`)

#### Scenario: Pack folder does not exist on disk or in lockfile

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile or settings
- **AND** no matching directory exists under `.axm/extensions/@*/packs/testing/`
- **THEN** the result SHALL be `no-op` with message "not installed"

#### Scenario: Pack folder exists under multiple namespaces

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile
- **AND** `.axm/extensions/@foo/packs/testing/` and `.axm/extensions/@bar/packs/testing/` both exist
- **THEN** both directories SHALL be removed
