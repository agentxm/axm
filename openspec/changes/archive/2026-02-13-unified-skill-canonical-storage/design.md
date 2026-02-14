## Context

Currently, non-registry skills store canonical files directly in `.agents/skills/<name>`, which is itself an agent-visible skills directory. This creates an asymmetry:

- **Registry skills**: canonical in `.axm/extensions/@scope/skills/<name>` (non-active), agents see via symlinks
- **Non-registry skills**: canonical in `.agents/skills/<name>` (active), some agents read directly from here

This means disable must delete canonical files (otherwise the skill remains active for direct-read agents), but enable cannot restore them without network access or the original source.

Files affected:

- `packages/cli/src/cli-commands/skills/skill-paths.ts` — `computeSkillPaths`
- `packages/cli/src/cli-commands/skills/constants.ts` — `UNIVERSAL_SKILLS_DIR`
- `packages/cli/src/cli-commands/skills/install/install-skill.ts` — `installSkill`, `installForAgent`, `preCleanAllLocations`
- `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` — `uninstallSkill`, `removeFromAllLocations`, `existsInAnyLocation`
- `packages/cli/src/cli-commands/skills/enable/enable-skill.ts` — `enableSkill`
- `packages/cli/src/cli-commands/skills/disable/disable-skill.ts` — `disableSkill`
- `packages/cli/src/cli-commands/skills/rename/rename-skill.ts` — `renameSkill`
- `packages/cli/src/sources/resolve-source.ts` — `getInstalledSkillPath`
- `packages/cli/src/workspace/service.ts` — `getSkillDir`

## Goals / Non-Goals

**Goals:**

- All skills stored in `.axm/extensions/` as canonical location, making `.agents/skills/` symlink-only
- Enable/disable work offline as pure symlink toggles
- Uniform logic across source types — no per-source branching in enable/disable
- Uninstall remains the operation that deletes canonical files

**Non-Goals:**

- Backward compatibility with existing installations (users reinstall)
- Migration tooling for existing `.agents/skills/` canonical files
- Changing registry skill layout (already correct)

## Decisions

### D1: Non-registry canonical location — `.axm/extensions/external/skills/<name>`

All non-registry skills (github, gitlab, local, git, bitbucket, azurerepos) store canonical files under `.axm/extensions/external/skills/<name>`.

**Why `external`**: Clean separation from `@`-prefixed registry scopes. Source type is already tracked in the lockfile — encoding it in the directory path adds no value. A single `external` folder keeps the layout simple.

**Why not per-type folders** (`@github`, `@local`, etc.): The source type can change (e.g., fork converts registry to local). Having a single non-registry location avoids cross-directory moves on source type change.

**Why not a separate `.axm/disabled/` folder**: Would require move-on-disable/move-on-enable for non-registry skills but not registry skills, creating asymmetric logic. Keeping all canonical files in `.axm/extensions/` and only toggling symlinks is simpler.

### D2: `canonicalPath` vs `skillSrcPath` for non-registry in `external`

For non-registry skills in `.axm/extensions/external/skills/<name>`:

- `canonicalPath` = `.axm/extensions/external/skills/<name>`
- `skillSrcPath` = `.axm/extensions/external/skills/<name>` (same — no `/src` subdirectory)

Registry skills retain the existing split: `canonicalPath` is the package root (contains manifest), `skillSrcPath` is `<canonicalPath>/src`. Non-registry skills have no manifest, so no split is needed.

### D3: Self-reference detection update

Currently, `installForAgent` and other handlers skip symlink creation when an agent's `skills.dir` resolves to `UNIVERSAL_SKILLS_DIR` (`.agents/skills`). With this change:

- `.agents/skills/` is always symlink-only, never contains canonical files
- Self-reference detection against `UNIVERSAL_SKILLS_DIR` still applies — agents whose `skills.dir` IS `.agents/skills` still need symlinks created there
- No self-reference skip is needed for the new `external` location since no agent reads from `.axm/extensions/external/` directly

The self-reference detection logic remains but its meaning shifts: it no longer means "skip because files are already there" but rather "this agent uses the universal dir, create symlink there too."

Wait — actually, with the new model, ALL agents need symlinks, including ones whose `skills.dir` is `.agents/skills`. The self-reference skip must be **removed**. Previously it was correct because non-registry canonical files lived IN `.agents/skills/`, so the agent already had direct access. Now canonical files live in `.axm/extensions/external/`, so `.agents/skills/` needs a symlink like any other agent dir.

### D4: Disable — symlink removal only

Disable becomes:

1. Remove agent symlinks for all agents (lock agents + configured agents, deduplicated)
2. Clear lock agents to `[]`
3. Set `enabled: false` in settings

No canonical file deletion. No `@`-scoped directory iteration. No `removeFromAllLocations`.

### D5: Enable — symlink creation only

Enable becomes:

1. Read lock entry and configured agents
2. Compute canonical path via `getSkillDir`
3. Verify canonical directory exists (fail with helpful error if not — "try reinstalling")
4. Create agent symlinks from `skillSrcPath` (concurrent, with copy fallback)
5. Repopulate lock agents
6. Set `enabled: true` in settings

No source resolution. No file copying. No per-source-type branching.

### D6: Install — non-registry writes to `external`

`computeSkillPaths` changes the non-registry branch:

```
// Before
canonicalPath = join(base, ".agents/skills", sanitizedName)

// After
canonicalPath = join(base, ".axm/extensions/external/skills", sanitizedName)
```

The install handler's `preCleanAllLocations` and the symlink creation flow remain structurally the same, but the `UNIVERSAL_SKILLS_DIR` constant changes meaning or a new constant is introduced.

### D7: Constants update

- Add `EXTERNAL_EXTENSIONS_DIR = ".axm/extensions/external"` (or update path computation directly)
- `UNIVERSAL_SKILLS_DIR` (`.agents/skills`) remains as the agent-visible symlink directory — still used for self-reference detection in rename and other operations
- `preCleanAllLocations` and `removeFromAllLocations` must also clean from `external/skills/` in addition to `@`-scoped dirs

### D8: `getInstalledSkillPath` in `resolve-source.ts`

This helper returns a relative path for installed skills. Non-registry branch changes from `.agents/skills/<name>` to `.axm/extensions/external/skills/<name>`.

### D9: Rename handler update

`rename-skill.ts` uses `UNIVERSAL_SKILLS_DIR` for self-reference detection. This remains valid — `.agents/skills/` is still the universal agent-visible directory. The canonical rename (`fs.rename`) operates on paths from `getSkillDir`, which will now point to `external/skills/` for non-registry skills.

## Risks / Trade-offs

**Existing installations break** → Users must reinstall non-registry skills. Acceptable since backward compatibility is a non-goal and the tool is pre-1.0.

**Disk usage for disabled skills** → Canonical files remain on disk when disabled. Mitigated by `uninstall` being the explicit "delete files" operation. Disabled skills are typically few and small.

**`.agents/skills/` may contain stale files** → After upgrade, old canonical files in `.agents/skills/` won't be cleaned up automatically. Not harmful (they'll be overwritten on reinstall) but slightly untidy. Could add a warning in `axm skills list` if orphaned files detected, but this is a non-goal for this change.
