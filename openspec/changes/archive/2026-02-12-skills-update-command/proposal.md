## Why

Users have no way to update installed skills to newer versions. The only path today is manual uninstall + reinstall, which is error-prone and loses the intent of "keep this skill current." An `update` command gives users a single action to refresh skills from their sources.

## What Changes

- Add `axm skills update [source]` subcommand that re-resolves installed skills from their sources, detects newer versions, and applies updates
- Update the lockfile with new version metadata (`ref`, `resolvedVersion`, `gitTreeHash`, `updatedAt`) after successful updates
- Re-copy/re-symlink skill files to canonical and agent directories during update
- Support `--skill <pattern>` to scope updates to specific skills (glob patterns)
- Support `--force` to re-install even when no version change is detected
- Support `--preview` to show what would update without applying
- Support `--yes` to skip confirmation prompts

## Capabilities

### New Capabilities

- `cli-skills-update`: CLI command definition, argument parsing, and handler orchestration for `axm skills update [source]`
- `skills-update-build-plan`: Plan builder that compares current lockfile entries against re-resolved source metadata to determine which skills have updates available

### Modified Capabilities

- `cli-skills`: Register the `update` subcommand in the skills command group

## Impact

- **Commands**: New `skills/update/` command directory with handler, command definition, and plan builder
- **Lockfile**: Read existing entries to compare versions; write updated entries after apply
- **Resolution**: Reuse existing source resolution to re-resolve installed skill sources
- **Workspace**: Reuse `ws.resolvePlan()` pattern consistent with install/uninstall
- **Skill files**: Overwrite canonical skill directories and refresh symlinks on update
