## Context

The fork handler (`handler.ts`) builds a two-step plan (fork-skill → publish-skill) and then runs manual post-plan code to update the lockfile and create agent symlinks. This duplicates logic already present in the `installSkill` operation handler, and critically omits the `SettingsService.addSkill()` call — so forked skills never appear in `settings.json`.

The `skills-fork` spec already requires three operations (fork → publish → install). The `installSkill` handler already handles lockfile updates, settings updates, agent symlinks, and pre-clean. We just need to wire it in.

## Goals / Non-Goals

**Goals:**

- Forked skills appear in `settings.json` after fork completes
- Reuse `installSkill` instead of duplicating its logic
- Align implementation with the existing `skills-fork` spec

**Non-Goals:**

- Changing `fork-skill` or `publish-skill` operation behavior
- Modifying `installSkill`'s pre-clean or copy logic
- Changing the fork command's user-facing interface or flags

## Decisions

### Add `InstallSkillOperation` as third plan step

The fork handler will append an `install-skill` step per skill after its publish step. The operation's `source` is `{ source: "registry" }` since the skill was just published to the local registry. The `location` points to the registry extension path (`file://<base>/.axm/extensions/@<scope>/skills/<name>`).

`installSkill`'s `preCleanAllLocations` will delete the extension directory that `fork-skill` created — this is fine because `publish-skill` has already archived the files into the registry. `installSkill` then installs from that registry location, writing files back to the canonical path and handling lockfile, settings, and symlinks.

**Alternative considered**: Call `ss.addSkill()` directly in the post-plan code alongside the existing lockfile/symlink logic. Rejected because it perpetuates duplication and divergence from the spec. Using the operation is the right abstraction.

### Remove manual post-plan bookkeeping

The entire Step 8 block (lines 251–315) — lockfile update, agent symlink creation — is removed. `installSkill` handles all of this. The only post-plan code remaining is the final `log.success("Done")`.

### Expand `ForkOp` union type

The handler's `ForkOp` type changes from `ForkSkillOperation | PublishSkillOperation` to `ForkSkillOperation | PublishSkillOperation | InstallSkillOperation`. This widens the plan's generic parameter and requires the handler registry passed to `resolvePlan` to include `"install-skill": installSkill`.

### Construct `InstallSkillOperationArgs` from fork context

The `InstallSkillOperationArgs` fields are populated from data already available in the fork handler:

| Field        | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| `source`     | `{ source: "registry" }`                                                                     |
| `agents`     | `agentIds` (from settings)                                                                   |
| `force`      | `true` (always overwrite — we just forked it)                                                |
| `skill`      | `{ name: ref.skill.name, description: ref.skill.description, metadata: ref.skill.metadata }` |
| `location`   | `file://<base>/.axm/extensions/@<scope>/skills/<name>`                                       |
| `version`    | `Option.some("0.1.0")` (fork manifest default)                                               |
| `gitTreeSha` | `Option.none()`                                                                              |

## Risks / Trade-offs

**Pre-clean deletes then re-copies files** — `installSkill` removes the extension dir and copies it back from the same registry location. This is a no-op in effect but does redundant I/O. Acceptable for correctness and simplicity; fork is not a hot path.

**`installSkill` swallows lockfile/settings errors** — Both `updateEntry` and `addSkill` failures are silently caught. This matches the current install behavior and is acceptable since the skill files are already in place.
