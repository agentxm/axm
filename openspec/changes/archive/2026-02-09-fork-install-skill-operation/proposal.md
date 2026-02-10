## Why

`axm skills fork` does not add the forked skill to `settings.json`. The fork handler manually duplicates lockfile and symlink logic from the install pipeline but omits the `SettingsService.addSkill()` call. The `skills-fork` spec already requires a three-operation plan (fork → publish → install), but the implementation only executes two (fork → publish) and handles post-plan bookkeeping inline.

## What Changes

- Add an `install-skill` operation as the third step in the fork plan (after fork and publish), installing from the registry where the skill was just published
- Remove the manual post-plan code in the fork handler (lockfile update, agent symlink creation) — `install-skill` already handles all of this including the settings update
- **BREAKING**: The fork handler's `ForkOp` union type expands to include `InstallSkillOperation`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `skills-fork`: The fork handler adds an `install-skill` operation to the plan and removes manual post-plan bookkeeping

## Impact

- `packages/cli/src/cli-commands/skills/fork/handler.ts` — plan construction and post-plan removal
- `packages/cli/src/cli-commands/skills/fork/handler.test.ts` — updated plan assertions
- `packages/cli/src/cli-commands/skills/fork/fork.e2e.test.ts` — assert settings.json is updated after fork
