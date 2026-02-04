## Why

Users need to remove skills they no longer want. The install command adds skills to agents, but there's no way to reverse this. Uninstall completes the skill lifecycle management story.

## What Changes

- Add `axm skills uninstall <skill-name>` command that removes a skill from all agents
- Support `--agent` flag to uninstall from specific agents only
- Support `--dry-run` flag to preview changes without applying them
- Remove skill files from canonical location (`.axm/skills/<name>/`)
- Remove symlinks/copies from agent skill directories
- Update lockfile (`.axm/axm-lock.yaml`) to remove entry
- Update settings (`.axm/settings.json`) to remove skill reference

## Capabilities

### New Capabilities

- `cli-skills-uninstall`: Command to remove installed skills, reversing the install process

### Modified Capabilities

- `skills-state`: Add UninstallSkill step handling (may already be partially specified)

## Impact

- **CLI**: New `skills uninstall` command under existing `skills` command group
- **Core**: May need `removeSkillFromAgents()` function (inverse of `installSkillToAgents()`)
- **Lockfile**: Uses existing `removeLockEntry()` function
- **Settings**: Needs removal logic (inverse of `updateSettings()` for skills)
- **File System**: Deletes directories and symlinks
