## Why

There is no command to create a new skill from scratch. Users adopting axm must either install existing skills or manually create skill files by hand. A scaffolding command (`axm skills new`) gives authors a clear starting point and makes axm the natural tool for the full skill lifecycle — from creation through publishing.

## What Changes

- Add `axm skills new <name>` command that scaffolds a new managed skill
- The command creates the skill directory structure under `.axm/extensions/`, writes an `axm-skill.json` manifest, creates a starter `SKILL.md` in `src/`, and registers the skill in settings as a managed entry
- Supports `--scope` to override the workspace scope (same pattern as `axm packs new`)
- Supports `--agent` to wire the skill into specific agents at creation time (defaults to all configured agents)
- Creates agent symlinks so the skill is immediately usable after creation

## Capabilities

### New Capabilities

- `cli-skills-new`: The `axm skills new` command — scaffolding, directory creation, manifest generation, settings registration, and agent wiring for new skills

### Modified Capabilities

- `cli-skills`: Register `new` as a sub-command of `axm skills`

## Impact

- New command at `packages/cli/src/cli-commands/skills/new/`
- Workspace service: reuses existing `setSkill` for settings registration
- Managed extensions layout: follows existing `.axm/extensions/@<scope>/skills/<name>/` convention
- Agent symlinks: reuses existing symlink creation from install flow
