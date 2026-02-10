## Why

When forking a skill, the generated `axm-skill.json` manifest is populated with the current project's agent IDs from settings. This couples the forked extension to the forking project's configuration. Forked skills should start with an empty manifest so users explicitly choose which agents to add — the manifest is the extension author's contract, not a copy of the consumer's environment.

## What Changes

- **BREAKING**: Rename `ForkSkillOperation` → `CopySkillOperation` to distinguish the operation from the command
- **BREAKING**: `CopySkillOperation` no longer passes the project's agents to the manifest — the generated `axm-skill.json` will omit the `agents` property entirely
- The `InstallSkillOperation` built during fork still reads agents from settings (install-time behavior unchanged)
- The fork handler no longer needs to fetch agent IDs for the manifest generation step

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `skills-fork`: CopySkillOperation executor generates manifest with empty agents instead of copying from workspace settings

## Impact

- `packages/cli/src/cli-commands/skills/fork-skill.ts` — manifest generation omits `agents`
- `packages/cli/src/cli-commands/skills/fork/handler.ts` — stops passing agents to `CopySkillOperation`
- `packages/cli/src/cli-commands/skills/operations.ts` — rename `ForkSkillOperation` → `CopySkillOperation`, drop `agents` field
- `packages/cli/src/cli-commands/skills/fork-skill.ts` → rename to `copy-skill.ts`
- `openspec/specs/skills-fork/spec.md` — scenario for manifest defaults needs updating
