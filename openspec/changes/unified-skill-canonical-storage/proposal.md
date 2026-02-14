## Why

Disabling a skill deletes its canonical files, but enabling cannot restore them without network access (registry skills) or the original source (git-based skills). Enable/disable should work offline as a simple toggle, not a partial uninstall/reinstall cycle.

The root cause: non-registry skills store canonical files in `.agents/skills/`, which is itself an agent-visible directory. Keeping files there on disable means the skill remains active. This forces disable to delete files, creating an asymmetry that enable cannot recover from.

## What Changes

- **BREAKING**: Non-registry skills (github, gitlab, local, git, etc.) canonical location moves from `.agents/skills/<name>` to `.axm/extensions/external/skills/<name>`. The `.agents/skills/` directory will only contain symlinks, never source files.
- **BREAKING**: Disable no longer deletes canonical files. It only removes agent symlinks, clears lock agents, and sets `enabled: false`.
- **BREAKING**: Enable no longer re-resolves sources or copies files. It verifies the canonical directory exists, re-creates agent symlinks, repopulates lock agents, and sets `enabled: true`.
- Install for non-registry skills writes to `.axm/extensions/external/skills/<name>` then symlinks into agent directories (same as registry skills already do).
- Uninstall updated to remove from the new canonical location.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `skill-paths`: Non-registry `canonicalPath` and `skillSrcPath` change from `.agents/skills/<name>` to `.axm/extensions/external/skills/<name>`.
- `cli-skills-enable-disable`: Disable becomes symlink-only removal. Enable becomes symlink-only creation. No source resolution, no file copying/deletion.
- `skills-install-execute`: Non-registry install writes to `.axm/extensions/external/skills/<name>` and always creates agent symlinks (no self-reference skip for universal dir).
- `skills-uninstall-execute`: Canonical removal targets `.axm/extensions/external/skills/<name>` for non-registry skills.

## Impact

- `computeSkillPaths` — non-registry path computation changes
- `disable-skill.ts` — remove canonical deletion logic
- `enable-skill.ts` — remove source resolution logic, simplify to symlink toggle
- `executeAddSkill` / install executor — non-registry writes to new location + always symlinks
- `uninstallSkill` — canonical path changes for non-registry
- Existing installations will need migration or reinstall (canonical files in old location)
- `UNIVERSAL_SKILLS_DIR` constant may be removed or repurposed (`.agents/skills/` becomes symlink-only)
