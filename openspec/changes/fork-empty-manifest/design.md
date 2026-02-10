## Context

When `axm skills fork` runs, it builds a three-step plan per skill: copy → publish → install. The copy step copies source files and generates an `axm-skill.json` manifest. Currently, the manifest's `agents` array is populated from the project's workspace settings — meaning the forked extension inherits the consumer's agent configuration.

This is wrong: the manifest is the _extension author's_ declaration of agent compatibility. It should start empty and be populated intentionally by the author. The install step already independently reads agents from settings for symlink creation, so the manifest doesn't need to carry this information.

## Goals / Non-Goals

**Goals:**

- Forked skill manifests omit `agents` entirely
- Rename `ForkSkillOperation` → `CopySkillOperation` (the operation copies files; "fork" is the overall command)
- Remove the `agents` field from `CopySkillOperationArgs` since the executor no longer needs it
- Fork handler no longer fetches agents from settings for the copy operation

**Non-Goals:**

- Changing install-time agent binding (the `InstallSkillOperation` still gets agents from settings — this is correct)
- Adding any new CLI flags or user prompts for agent selection during fork

## Decisions

### 1. Rename `ForkSkillOperation` → `CopySkillOperation`

**Choice**: Rename the operation type and executor to reflect what it actually does — copy files and generate a manifest.

**Rationale**: "Fork" is the user-facing command that orchestrates copy → publish → install. The operation itself just copies. Naming it `CopySkillOperation` avoids conflating the command with the operation and reads clearly in plan output.

### 2. Remove `agents` from `CopySkillOperationArgs`

**Choice**: Delete the field entirely rather than making it optional or defaulting it.

**Rationale**: The copy executor always uses `[]` — there's no use case for passing agents to the manifest at fork time. Keeping a dead field invites confusion. Backward compatibility is a non-goal.

**Alternative considered**: Make `agents` optional with a default of `[]`. Rejected — adds unnecessary optionality for a field that's always empty.

### 3. Omit `agents` from generated manifest

**Choice**: The `copySkill` executor does not write an `agents` property in the generated `axm-skill.json`.

**Rationale**: The manifest is a starting point for the extension author. Omitting the property entirely (rather than writing an empty array) signals that agents haven't been configured yet. The author adds agents as they develop the skill.

### 4. Remove `ss.getAgents()` call from fork handler

**Choice**: The fork handler stops fetching agents from `SettingsService` for the copy operation. It still passes agents to the `InstallSkillOperation` via `ss.getAgents()`.

**Rationale**: The fork handler currently calls `ss.getAgents()` once and uses the result in both the fork and install operations. After this change, it's only needed for the install operation. The call stays but is no longer used for the fork step args.

## Risks / Trade-offs

- [Users expect forked skills to "just work" with their agents] → The install step still binds agents via symlinks. The only difference is the manifest file, which is the author-facing artifact. No user-visible behavior change at fork time.
- [Existing forked extensions have populated agents in manifests] → Non-issue. The manifest is local to the extension directory and only matters at publish/install time. Existing forks are unaffected.
