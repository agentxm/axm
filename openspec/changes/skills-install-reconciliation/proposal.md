## Why

The current skills install implementation mixes concerns and uses ad-hoc diffing. Refactoring to desired-state reconciliation provides a clearer mental model (current → ideal → plan → apply), enables trivial dry-run support, and establishes architectural patterns for all extension operations.

## What Changes

- **Replace validity with issues**: Remove `SkillValidity` union; issues computed during state loading and attached at appropriate levels (ActualSkill, SkillState, CurrentState)
- **Simplify plan steps**: Replace 5-way `SkillChange` (Add/Update/Remove/Unchanged/Repair) with 3-way `PlanStep` (InstallSkill/UpdateSkill/UninstallSkill)
- **Name-based skill identity**: Skills matched by name (unique across all sources); rejects duplicates from different sources
- **New install paths**: Registry → `.axm/extensions/@<scope>/skills/<name>`, External → `.axm/extensions/external/skills/<name>`
- **BREAKING**: Lockfile schema changes - rename `folderHash` → `gitTreeHash`, add `agents` field per skill
- **BREAKING**: Settings schema changes - flatten `extensions.skills` to root `skills`, use structured source entries
- **Remove rollback**: On apply failure, stop and return partial result; lockfile only updated on full success
- **Pure buildPlan**: Diffing is pure function; effectful fetching isolated to `buildIdealState`

## Capabilities

### New Capabilities

- `workspace-reconciliation`: Core reconciliation pattern (loadCurrentState, buildIdealState, buildPlan, applyPlan) shared across all extension commands

### Modified Capabilities

- `cli-skills-install`: Update to use reconciliation pattern; change plan display format; remove repair concept
- `skills-state`: Replace validity with issues; update state types to match new design
- `schema-lockfile`: Rename `folderHash` → `gitTreeHash`; add `agents` array per skill entry
- `schema-settings`: Flatten skills to root level; use `SkillSettingsEntry` union type for sources

## Impact

- `packages/core/src/experimental/state/` - Major refactor of types and functions
- `packages/cli/src/commands/skills/install/` - Handler rewrite to use new pattern
- `.axm/settings.json` schema - Breaking change to structure
- `.axm/axm-lock.yaml` schema - Breaking change to field names and structure
- Existing installed skills need migration or reinstall after schema changes
